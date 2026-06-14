#!/bin/bash
# Delete Orphaned VPC Script
# Purpose: Clean up orphaned VPCs to free up VPC limit for new deployment
# Date: 2025-10-14

set -e

VPC_ID=$1
PROFILE="your-aws-profile"
REGION="us-west-2"

if [ -z "$VPC_ID" ]; then
  echo "Usage: $0 <vpc-id>"
  echo "Example: $0 vpc-EXAMPLE"
  exit 1
fi

echo "========================================="
echo "Deleting VPC: $VPC_ID"
echo "Profile: $PROFILE"
echo "Region: $REGION"
echo "Date: $(date)"
echo "========================================="
echo ""

# Step 1: Delete NAT Gateways
echo "Step 1: Deleting NAT Gateways..."
NAT_GWS=$(AWS_PROFILE=$PROFILE aws ec2 describe-nat-gateways --region $REGION \
  --filter "Name=vpc-id,Values=$VPC_ID" "Name=state,Values=available" \
  --query 'NatGateways[*].NatGatewayId' --output text)

if [ -n "$NAT_GWS" ]; then
  for nat in $NAT_GWS; do
    echo "  Deleting NAT Gateway: $nat"
    AWS_PROFILE=$PROFILE aws ec2 delete-nat-gateway --region $REGION --nat-gateway-id $nat
  done
  echo "  Waiting 60s for NAT gateways to delete..."
  sleep 60
else
  echo "  No NAT gateways found"
fi

# Step 2: Release Elastic IPs
echo "Step 2: Releasing Elastic IPs..."
EIPS=$(AWS_PROFILE=$PROFILE aws ec2 describe-addresses --region $REGION \
  --filters "Name=domain,Values=vpc" \
  --query "Addresses[?NetworkInterfaceId==null].AllocationId" --output text)

if [ -n "$EIPS" ]; then
  for eip in $EIPS; do
    echo "  Releasing EIP: $eip"
    AWS_PROFILE=$PROFILE aws ec2 release-address --region $REGION --allocation-id $eip || true
  done
else
  echo "  No unattached EIPs found"
fi

# Step 3: Delete Subnets
echo "Step 3: Deleting Subnets..."
SUBNETS=$(AWS_PROFILE=$PROFILE aws ec2 describe-subnets --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].SubnetId' --output text)

if [ -n "$SUBNETS" ]; then
  for subnet in $SUBNETS; do
    echo "  Deleting Subnet: $subnet"
    AWS_PROFILE=$PROFILE aws ec2 delete-subnet --region $REGION --subnet-id $subnet || echo "    Failed (may have dependencies)"
  done
else
  echo "  No subnets found"
fi

# Step 4: Detach and Delete Internet Gateways
echo "Step 4: Detaching and Deleting Internet Gateways..."
IGWS=$(AWS_PROFILE=$PROFILE aws ec2 describe-internet-gateways --region $REGION \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
  --query 'InternetGateways[*].InternetGatewayId' --output text)

if [ -n "$IGWS" ]; then
  for igw in $IGWS; do
    echo "  Detaching IGW: $igw from VPC: $VPC_ID"
    AWS_PROFILE=$PROFILE aws ec2 detach-internet-gateway --region $REGION \
      --internet-gateway-id $igw --vpc-id $VPC_ID || true
    echo "  Deleting IGW: $igw"
    AWS_PROFILE=$PROFILE aws ec2 delete-internet-gateway --region $REGION \
      --internet-gateway-id $igw || true
  done
else
  echo "  No internet gateways found"
fi

# Step 5: Delete Route Tables (except main)
echo "Step 5: Deleting Route Tables..."
ROUTE_TABLES=$(AWS_PROFILE=$PROFILE aws ec2 describe-route-tables --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[?Associations[0].Main!=`true`].RouteTableId' --output text)

if [ -n "$ROUTE_TABLES" ]; then
  for rt in $ROUTE_TABLES; do
    echo "  Deleting Route Table: $rt"
    AWS_PROFILE=$PROFILE aws ec2 delete-route-table --region $REGION --route-table-id $rt || echo "    Failed (may have dependencies)"
  done
else
  echo "  No custom route tables found"
fi

# Step 6: Delete Security Groups (except default)
echo "Step 6: Deleting Security Groups..."
SGS=$(AWS_PROFILE=$PROFILE aws ec2 describe-security-groups --region $REGION \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[?GroupName!=`default`].GroupId' --output text)

if [ -n "$SGS" ]; then
  for sg in $SGS; do
    echo "  Deleting Security Group: $sg"
    AWS_PROFILE=$PROFILE aws ec2 delete-security-group --region $REGION --group-id $sg || echo "    Failed (may have dependencies)"
  done
else
  echo "  No custom security groups found"
fi

# Step 7: Delete VPC
echo "Step 7: Deleting VPC..."
echo "  Attempting to delete VPC: $VPC_ID"
AWS_PROFILE=$PROFILE aws ec2 delete-vpc --region $REGION --vpc-id $VPC_ID && echo "  ✅ VPC deleted successfully!" || echo "  ❌ VPC deletion failed (check for remaining dependencies)"

echo ""
echo "========================================="
echo "VPC Deletion Complete"
echo "========================================="