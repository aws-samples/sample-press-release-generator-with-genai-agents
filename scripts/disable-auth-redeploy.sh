#!/bin/bash

# Phase 5C: Disable Authentication Quick Fix
# Disables Cognito authentication in ECS backend task definition
# WARNING: Development/testing only - NOT for production use

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Phase 5C: Disable Authentication${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Configuration
AWS_PROFILE="your-aws-profile"
AWS_REGION="us-west-2"
CLUSTER_NAME="press-rele-prod-cluster"
SERVICE_NAME="press-rele-prod-backend"
TASK_FAMILY="press-rele-prod-backend"
ECR_REPO="123456789012.dkr.ecr.us-west-2.amazonaws.com/press-rele-backend"

# Step 1: Get current task definition
echo -e "${GREEN}Step 1: Retrieving current task definition...${NC}"
TASK_DEF=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-task-definition \
  --task-definition $TASK_FAMILY \
  --region $AWS_REGION \
  --query 'taskDefinition' \
  --output json)

if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to retrieve task definition${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Task definition retrieved${NC}"

# Step 2: Extract and modify environment variables
echo -e "${GREEN}Step 2: Modifying environment variables...${NC}"

# Get current environment variables and modify ENABLE_AUTHENTICATION
NEW_ENV=$(echo "$TASK_DEF" | jq '.containerDefinitions[0].environment' | \
  jq 'map(if .name == "ENABLE_AUTHENTICATION" then .value = "false" else . end)')

# Verify the change
AUTH_VALUE=$(echo "$NEW_ENV" | jq -r '.[] | select(.name=="ENABLE_AUTHENTICATION") | .value')
if [ "$AUTH_VALUE" != "false" ]; then
  echo -e "${RED}Failed to modify ENABLE_AUTHENTICATION${NC}"
  exit 1
fi

echo -e "${GREEN}✓ ENABLE_AUTHENTICATION set to false${NC}"

# Step 3: Create new task definition
echo -e "${GREEN}Step 3: Creating new task definition...${NC}"

# Build new task definition JSON
NEW_TASK_DEF=$(echo "$TASK_DEF" | jq --argjson env "$NEW_ENV" '
  .containerDefinitions[0].environment = $env |
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
')

# Register new task definition (write to temp file to avoid stdin issues)
TEMP_TASK_DEF="/tmp/task-def-$$.json"
echo "$NEW_TASK_DEF" > "$TEMP_TASK_DEF"

NEW_TASK_ARN=$(AWS_PROFILE=$AWS_PROFILE aws ecs register-task-definition \
  --cli-input-json "file://$TEMP_TASK_DEF" \
  --region $AWS_REGION \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

# Clean up temp file
rm -f "$TEMP_TASK_DEF"

if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to register new task definition${NC}"
  exit 1
fi

echo -e "${GREEN}✓ New task definition registered: $NEW_TASK_ARN${NC}"

# Step 4: Update ECS service
echo -e "${GREEN}Step 4: Updating ECS service...${NC}"

AWS_PROFILE=$AWS_PROFILE aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --task-definition $NEW_TASK_ARN \
  --force-new-deployment \
  --region $AWS_REGION \
  --output json > /dev/null

if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to update service${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Service update initiated${NC}"

# Step 5: Wait for deployment
echo -e "${GREEN}Step 5: Waiting for deployment to stabilize...${NC}"
echo -e "${YELLOW}This may take 3-5 minutes...${NC}"

AWS_PROFILE=$AWS_PROFILE aws ecs wait services-stable \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region $AWS_REGION

if [ $? -ne 0 ]; then
  echo -e "${RED}Service failed to stabilize${NC}"
  echo -e "${YELLOW}Check CloudWatch logs for details${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Service deployment complete${NC}"

# Step 6: Verify new configuration
echo -e "${GREEN}Step 6: Verifying configuration...${NC}"

VERIFY_ENV=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-task-definition \
  --task-definition $TASK_FAMILY \
  --region $AWS_REGION \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`ENABLE_AUTHENTICATION`]' \
  --output json)

VERIFY_VALUE=$(echo "$VERIFY_ENV" | jq -r '.[0].value')

if [ "$VERIFY_VALUE" == "false" ]; then
  echo -e "${GREEN}✓ Configuration verified: ENABLE_AUTHENTICATION=false${NC}"
else
  echo -e "${RED}Configuration verification failed${NC}"
  exit 1
fi

# Step 7: Check service health
echo -e "${GREEN}Step 7: Checking service health...${NC}"

RUNNING_COUNT=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region $AWS_REGION \
  --query 'services[0].runningCount' \
  --output text)

DESIRED_COUNT=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region $AWS_REGION \
  --query 'services[0].desiredCount' \
  --output text)

if [ "$RUNNING_COUNT" == "$DESIRED_COUNT" ]; then
  echo -e "${GREEN}✓ Service healthy: $RUNNING_COUNT/$DESIRED_COUNT tasks running${NC}"
else
  echo -e "${YELLOW}⚠ Service status: $RUNNING_COUNT/$DESIRED_COUNT tasks running${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Configuration Changes:${NC}"
echo -e "  ENABLE_AUTHENTICATION: true → false"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Test ALB endpoint: http://press-rele-prod-alb-1485276256.us-west-2.elb.amazonaws.com"
echo -e "  2. Test CloudFront: https://example-distribution.cloudfront.net"
echo -e "  3. Submit test user code to verify 503 error is resolved"
echo ""
echo -e "${YELLOW}⚠ WARNING: Authentication is now DISABLED${NC}"
echo -e "  This configuration is for testing only"
echo -e "  Plan to implement ALB Cognito integration for production"
echo ""
echo -e "${YELLOW}CloudWatch Logs:${NC}"
echo -e "  aws logs tail /ecs/press-rele-prod-backend --follow --profile your-aws-profile --region us-west-2"
echo ""