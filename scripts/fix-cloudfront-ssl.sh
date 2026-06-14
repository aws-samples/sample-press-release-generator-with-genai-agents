#!/bin/bash
# Phase 5G: Fix CloudFront SSL Certificate Issue
# Changes CloudFront origin protocol from https-only to http-only
# This allows CloudFront to connect to ALB without certificate trust issues

set -e

DISTRIBUTION_ID="EXAMPLE_DISTRIBUTION_ID"
AWS_PROFILE="your-aws-profile"
REGION="us-west-2"

echo "=== Phase 5G: CloudFront SSL Fix ==="
echo "Distribution ID: $DISTRIBUTION_ID"
echo "AWS Profile: $AWS_PROFILE"
echo "Region: $REGION"
echo ""

# Step 1: Get current distribution configuration
echo "Step 1: Fetching current CloudFront distribution configuration..."
AWS_PROFILE=$AWS_PROFILE aws cloudfront get-distribution-config \
  --id $DISTRIBUTION_ID \
  --region $REGION > temp/cloudfront-config-raw.json

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to fetch CloudFront configuration"
  exit 1
fi

# Extract ETag
ETAG=$(jq -r '.ETag' temp/cloudfront-config-raw.json)
echo "Current ETag: $ETAG"

# Extract distribution config
jq '.DistributionConfig' temp/cloudfront-config-raw.json > temp/cloudfront-config.json

# Step 2: Show current origin protocol
echo ""
echo "Step 2: Current origin protocol policy:"
jq -r '.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy' temp/cloudfront-config.json

# Step 3: Modify origin protocol to http-only
echo ""
echo "Step 3: Changing origin protocol to http-only..."
jq '.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy = "http-only"' \
  temp/cloudfront-config.json > temp/cloudfront-config-updated.json

# Verify the change
NEW_PROTOCOL=$(jq -r '.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy' temp/cloudfront-config-updated.json)
echo "New protocol: $NEW_PROTOCOL"

if [ "$NEW_PROTOCOL" != "http-only" ]; then
  echo "ERROR: Failed to update protocol policy"
  exit 1
fi

# Step 4: Update CloudFront distribution
echo ""
echo "Step 4: Updating CloudFront distribution..."
echo "This will take 5-15 minutes to deploy..."

AWS_PROFILE=$AWS_PROFILE aws cloudfront update-distribution \
  --id $DISTRIBUTION_ID \
  --if-match "$ETAG" \
  --distribution-config file://temp/cloudfront-config-updated.json \
  --region $REGION > temp/cloudfront-update-result.json

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to update CloudFront distribution"
  exit 1
fi

echo "✅ CloudFront distribution update initiated successfully"

# Step 5: Check deployment status
echo ""
echo "Step 5: Checking deployment status..."
STATUS=$(jq -r '.Distribution.Status' temp/cloudfront-update-result.json)
echo "Deployment Status: $STATUS"

# Step 6: Instructions for testing
echo ""
echo "=== Next Steps ==="
echo "1. Wait 5-15 minutes for CloudFront deployment to complete"
echo "2. Check status: AWS_PROFILE=$AWS_PROFILE aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.Status'"
echo "3. Test with curl: curl -Ik https://example-distribution.cloudfront.net"
echo "4. Test in browser: https://example-distribution.cloudfront.net"
echo "5. Expected: Cognito login page with no certificate errors"
echo ""
echo "Configuration files saved in temp/ directory:"
echo "  - temp/cloudfront-config-raw.json (original with ETag)"
echo "  - temp/cloudfront-config.json (extracted config)"
echo "  - temp/cloudfront-config-updated.json (modified config)"
echo "  - temp/cloudfront-update-result.json (update response)"
echo ""
echo "✅ Phase 5G: CloudFront SSL fix script completed"