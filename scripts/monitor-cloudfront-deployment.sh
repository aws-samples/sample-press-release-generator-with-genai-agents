#!/bin/bash

# Monitor CloudFront deployment status
# Usage: ./scripts/monitor-cloudfront-deployment.sh

DISTRIBUTION_ID="E2J9GUJI6HJEYP"
AWS_PROFILE="ia-admin"
REGION="us-west-2"
CLOUDFRONT_URL="https://dlghch10ri8d2.cloudfront.net"

echo "=== CloudFront Deployment Monitor ==="
echo "Distribution ID: $DISTRIBUTION_ID"
echo "Started at: $(date)"
echo ""

# Check status every 30 seconds for up to 20 minutes
MAX_ATTEMPTS=40
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    
    echo "[$ATTEMPT/$MAX_ATTEMPTS] Checking deployment status..."
    
    STATUS=$(AWS_PROFILE=$AWS_PROFILE aws cloudfront get-distribution \
        --id $DISTRIBUTION_ID \
        --region $REGION \
        --query 'Distribution.Status' \
        --output text 2>&1)
    
    if [ $? -ne 0 ]; then
        echo "❌ Error checking status: $STATUS"
        exit 1
    fi
    
    echo "Status: $STATUS"
    
    if [ "$STATUS" = "Deployed" ]; then
        echo ""
        echo "✅ CloudFront deployment COMPLETE!"
        echo "Completed at: $(date)"
        echo ""
        echo "=== Testing CloudFront URL ==="
        echo "Testing: $CLOUDFRONT_URL"
        echo ""
        
        # Test with curl
        echo "Curl test:"
        curl -Ik $CLOUDFRONT_URL
        
        echo ""
        echo "=== Next Steps ==="
        echo "1. Open in browser: $CLOUDFRONT_URL"
        echo "2. Verify Cognito login page loads without SSL errors"
        echo "3. Test authentication flow"
        
        exit 0
    fi
    
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        echo "Waiting 30 seconds before next check..."
        sleep 30
        echo ""
    fi
done

echo ""
echo "⚠️  Deployment still in progress after 20 minutes"
echo "Check status manually:"
echo "AWS_PROFILE=$AWS_PROFILE aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.Status'"