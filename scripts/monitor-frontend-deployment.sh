#!/bin/bash

# Monitor Frontend Service Deployment with Port 8080
# This script monitors the ECS frontend service until it reaches healthy state

set -e

AWS_PROFILE=ia-admin
REGION=us-west-2
CLUSTER=press-rele-prod-cluster
SERVICE=press-rele-prod-frontend
TG_ARN="arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/press-rele-prod-fe-tg-8080/603ce83741771d5e"

echo "=== Frontend Service Deployment Monitor ==="
echo "Cluster: $CLUSTER"
echo "Service: $SERVICE"
echo "Target Group: press-rele-prod-fe-tg-8080"
echo "Expected Port: 8080"
echo ""

MAX_CHECKS=30
CHECK_INTERVAL=30

for i in $(seq 1 $MAX_CHECKS); do
  echo "=== Check $i/$MAX_CHECKS ($(date +%H:%M:%S)) ==="
  
  # Get service status
  SERVICE_STATUS=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-services \
    --cluster $CLUSTER \
    --services $SERVICE \
    --region $REGION \
    --query 'services[0].{Running:runningCount,Desired:desiredCount,Status:status}' \
    --output json)
  
  echo "Service Status: $SERVICE_STATUS"
  
  RUNNING=$(echo "$SERVICE_STATUS" | jq -r '.Running')
  DESIRED=$(echo "$SERVICE_STATUS" | jq -r '.Desired')
  
  # Get target health
  TG_HEALTH=$(AWS_PROFILE=$AWS_PROFILE aws elbv2 describe-target-health \
    --target-group-arn $TG_ARN \
    --region $REGION \
    --query 'TargetHealthDescriptions[*].{IP:Target.Id,Port:Target.Port,State:TargetHealth.State,Reason:TargetHealth.Reason}' \
    --output json)
  
  echo "Target Health: $TG_HEALTH"
  
  # Check if we have a healthy target
  HEALTHY_COUNT=$(echo "$TG_HEALTH" | jq '[.[] | select(.State == "healthy")] | length')
  
  if [ "$RUNNING" == "$DESIRED" ] && [ "$RUNNING" != "0" ] && [ "$HEALTHY_COUNT" -gt 0 ]; then
    echo ""
    echo "✅ SUCCESS! Frontend service is HEALTHY!"
    echo "   Running: $RUNNING/$DESIRED"
    echo "   Healthy Targets: $HEALTHY_COUNT"
    exit 0
  fi
  
  # Get latest event
  LATEST_EVENT=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-services \
    --cluster $CLUSTER \
    --services $SERVICE \
    --region $REGION \
    --query 'services[0].events[0].message' \
    --output text)
  
  echo "Latest Event: $LATEST_EVENT"
  echo ""
  
  if [ $i -lt $MAX_CHECKS ]; then
    echo "Waiting $CHECK_INTERVAL seconds..."
    sleep $CHECK_INTERVAL
  fi
done

echo ""
echo "⚠️ Deployment monitoring timed out after $((MAX_CHECKS * CHECK_INTERVAL / 60)) minutes"
echo "Service Status: Running=$RUNNING, Desired=$DESIRED"
echo "Check CloudWatch logs for details"
exit 1