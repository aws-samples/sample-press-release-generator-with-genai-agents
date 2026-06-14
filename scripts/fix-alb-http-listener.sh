#!/bin/bash

# Fix ALB HTTP Listener - Add Cognito Authentication
# This allows CloudFront to connect via HTTP while maintaining Cognito security

set -e

ALB_ARN="arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/press-rele-prod-alb/EXAMPLEALBID"
HTTP_LISTENER_ARN="arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/press-rele-prod-alb/EXAMPLEALBID/EXAMPLELISTENER"
BACKEND_TG_ARN="arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/press-rele-prod-be-tg/EXAMPLEBETG"
FRONTEND_TG_ARN="arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/press-rele-prod-fe-tg-8080/EXAMPLEFETG"
USER_POOL_ARN="arn:aws:cognito-idp:us-west-2:123456789012:userpool/us-west-2_EXAMPLE"
USER_POOL_CLIENT_ID="EXAMPLE_CLIENT_ID"
USER_POOL_DOMAIN="press-release-generator-prod-EXAMPLE"
AWS_PROFILE="your-aws-profile"
REGION="us-west-2"

echo "=== Phase 5G: Add Cognito Authentication to ALB HTTP Listener ==="
echo "ALB: $ALB_ARN"
echo "HTTP Listener: $HTTP_LISTENER_ARN"
echo "User Pool: $USER_POOL_ARN"
echo "AWS Profile: $AWS_PROFILE"
echo "Region: $REGION"
echo ""

echo "Step 1: Current HTTP listener configuration..."
AWS_PROFILE=$AWS_PROFILE aws elbv2 describe-listeners \
    --listener-arns $HTTP_LISTENER_ARN \
    --region $REGION \
    --query 'Listeners[0].DefaultActions' \
    --output json

echo ""
echo "Step 2: Checking for existing rules on HTTP listener..."
RULES=$(AWS_PROFILE=$AWS_PROFILE aws elbv2 describe-rules \
    --listener-arn $HTTP_LISTENER_ARN \
    --region $REGION \
    --query 'Rules[?Priority!=`default`]' \
    --output json)

if [ "$RULES" != "[]" ]; then
    echo "Found existing rules. Deleting them first..."
    echo "$RULES" | jq -r '.[].RuleArn' | while read rule_arn; do
        echo "Deleting rule: $rule_arn"
        AWS_PROFILE=$AWS_PROFILE aws elbv2 delete-rule \
            --rule-arn "$rule_arn" \
            --region $REGION
    done
    echo "✅ Existing rules deleted"
else
    echo "No existing rules found"
fi

echo ""
echo "Step 3: Creating Cognito-protected rules for HTTP listener..."

# Rule 1: /api/* → Cognito → Backend (Priority 100)
echo "Creating rule for /api/* with Cognito authentication..."
cat > temp/api-rule-actions.json <<EOF
[
    {
        "Type": "authenticate-cognito",
        "Order": 1,
        "AuthenticateCognitoConfig": {
            "UserPoolArn": "$USER_POOL_ARN",
            "UserPoolClientId": "$USER_POOL_CLIENT_ID",
            "UserPoolDomain": "$USER_POOL_DOMAIN"
        }
    },
    {
        "Type": "forward",
        "Order": 2,
        "TargetGroupArn": "$BACKEND_TG_ARN"
    }
]
EOF

API_RULE_ARN=$(AWS_PROFILE=$AWS_PROFILE aws elbv2 create-rule \
    --listener-arn $HTTP_LISTENER_ARN \
    --priority 100 \
    --conditions Field=path-pattern,Values='/api/*' \
    --actions file://temp/api-rule-actions.json \
    --region $REGION \
    --query 'Rules[0].RuleArn' \
    --output text)

echo "✅ API rule created with Cognito: $API_RULE_ARN"

# Rule 2: /* → Cognito → Frontend (Priority 200)
echo "Creating rule for /* with Cognito authentication..."
cat > temp/root-rule-actions.json <<EOF
[
    {
        "Type": "authenticate-cognito",
        "Order": 1,
        "AuthenticateCognitoConfig": {
            "UserPoolArn": "$USER_POOL_ARN",
            "UserPoolClientId": "$USER_POOL_CLIENT_ID",
            "UserPoolDomain": "$USER_POOL_DOMAIN"
        }
    },
    {
        "Type": "forward",
        "Order": 2,
        "TargetGroupArn": "$FRONTEND_TG_ARN"
    }
]
EOF

ROOT_RULE_ARN=$(AWS_PROFILE=$AWS_PROFILE aws elbv2 create-rule \
    --listener-arn $HTTP_LISTENER_ARN \
    --priority 200 \
    --conditions Field=path-pattern,Values='/*' \
    --actions file://temp/root-rule-actions.json \
    --region $REGION \
    --query 'Rules[0].RuleArn' \
    --output text)

echo "✅ Root rule created with Cognito: $ROOT_RULE_ARN"

echo ""
echo "Step 4: Modifying default action to use Cognito + forward..."
cat > temp/default-actions.json <<EOF
[
    {
        "Type": "authenticate-cognito",
        "Order": 1,
        "AuthenticateCognitoConfig": {
            "UserPoolArn": "$USER_POOL_ARN",
            "UserPoolClientId": "$USER_POOL_CLIENT_ID",
            "UserPoolDomain": "$USER_POOL_DOMAIN"
        }
    },
    {
        "Type": "forward",
        "Order": 2,
        "TargetGroupArn": "$FRONTEND_TG_ARN"
    }
]
EOF

AWS_PROFILE=$AWS_PROFILE aws elbv2 modify-listener \
    --listener-arn $HTTP_LISTENER_ARN \
    --default-actions file://temp/default-actions.json \
    --region $REGION \
    --output json > temp/alb-http-listener-update.json

echo "✅ Default action updated with Cognito authentication"

echo ""
echo "Step 5: Verifying new configuration..."
AWS_PROFILE=$AWS_PROFILE aws elbv2 describe-listeners \
    --listener-arns $HTTP_LISTENER_ARN \
    --region $REGION \
    --query 'Listeners[0].DefaultActions' \
    --output json

echo ""
echo "Step 6: Listing all rules..."
AWS_PROFILE=$AWS_PROFILE aws elbv2 describe-rules \
    --listener-arn $HTTP_LISTENER_ARN \
    --region $REGION \
    --query 'Rules[*].{Priority:Priority,Path:Conditions[0].Values,Actions:Actions[*].Type}' \
    --output table

echo ""
echo "=== Next Steps ==="
echo "1. Test CloudFront URL: curl -Ik https://example-distribution.cloudfront.net"
echo "2. Should now redirect to Cognito login (302)"
echo "3. Test in browser: https://example-distribution.cloudfront.net"
echo "4. Should see Cognito login page without SSL certificate errors"
echo ""
echo "✅ Phase 5G: ALB HTTP listener Cognito authentication added"