#!/bin/bash
# Terraform Import Existing Resources Script
# Purpose: Import successfully created AWS resources into terraform state
# Date: 2025-10-14

set -e

cd terraform

PROFILE="your-aws-profile"
REGION="us-west-2"
ACCOUNT_ID="123456789012"

echo "========================================="
echo "Importing Existing AWS Resources"
echo "Profile: $PROFILE"
echo "Region: $REGION"
echo "Account: $ACCOUNT_ID"
echo "Date: $(date)"
echo "========================================="
echo ""

# Import VPC and networking (from partial terraform apply)
echo "Step 1: Importing VPC..."
AWS_PROFILE=$PROFILE terraform import aws_vpc.main vpc-EXAMPLE || echo "  Already imported or failed"

echo "Step 2: Importing Subnets..."
AWS_PROFILE=$PROFILE terraform import 'aws_subnet.public[0]' subnet-EXAMPLE1 || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import 'aws_subnet.public[1]' subnet-EXAMPLE2 || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import 'aws_subnet.private[0]' subnet-EXAMPLE3 || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import 'aws_subnet.private[1]' subnet-EXAMPLE4 || echo "  Already imported or failed"

echo "Step 3: Importing Internet Gateway..."
AWS_PROFILE=$PROFILE terraform import aws_internet_gateway.main igw-092355f549b2f2156 || echo "  Already imported or failed"

echo "Step 4: Importing NAT Gateways..."
AWS_PROFILE=$PROFILE terraform import 'aws_nat_gateway.main[0]' nat-085ddf9974e12afc8 || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import 'aws_nat_gateway.main[1]' nat-0d2dc7ee7fe93872d || echo "  Already imported or failed"

# Import ECR repositories
echo "Step 5: Importing ECR Repositories..."
AWS_PROFILE=$PROFILE terraform import aws_ecr_repository.backend press-rele-prod-backend-$ACCOUNT_ID || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import aws_ecr_repository.frontend press-rele-prod-frontend-$ACCOUNT_ID || echo "  Already imported or failed"

# Import ECS cluster
echo "Step 6: Importing ECS Cluster..."
AWS_PROFILE=$PROFILE terraform import aws_ecs_cluster.main press-rele-prod-cluster || echo "  Already imported or failed"

# Import Cognito
echo "Step 7: Importing Cognito Resources..."
AWS_PROFILE=$PROFILE terraform import 'aws_cognito_user_pool.main[0]' us-west-2_EXAMPLE || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import 'aws_cognito_user_pool_domain.main[0]' press-release-generator-prod-EXAMPLE || echo "  Already imported or failed"

# Import S3 bucket
echo "Step 8: Importing S3 Bucket..."
AWS_PROFILE=$PROFILE terraform import aws_s3_bucket.storage press-rele-prod-storage-$ACCOUNT_ID || echo "  Already imported or failed"

# Import IAM roles (if they exist)
echo "Step 9: Importing IAM Roles..."
AWS_PROFILE=$PROFILE terraform import aws_iam_role.ecs_task_execution press-rele-prod-ecs-task-execution || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import aws_iam_role.ecs_task press-rele-prod-ecs-task || echo "  Already imported or failed"

# Import CloudWatch log groups
echo "Step 10: Importing CloudWatch Log Groups..."
AWS_PROFILE=$PROFILE terraform import aws_cloudwatch_log_group.backend /ecs/press-rele-prod-backend || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import aws_cloudwatch_log_group.frontend /ecs/press-rele-prod-frontend || echo "  Already imported or failed"
AWS_PROFILE=$PROFILE terraform import aws_cloudwatch_log_group.strands /aws/ecs/press-rele-prod-strands || echo "  Already imported or failed"

# Import SNS topic
echo "Step 11: Importing SNS Topic..."
AWS_PROFILE=$PROFILE terraform import aws_sns_topic.alerts arn:aws:sns:$REGION:$ACCOUNT_ID:press-rele-prod-alerts || echo "  Already imported or failed"

echo ""
echo "========================================="
echo "Import Complete"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Run: terraform plan -var-file=terraform.tfvars"
echo "2. Review plan to see remaining resources to create"
echo "3. Run: terraform apply -var-file=terraform.tfvars -auto-approve"