#!/bin/bash

# Import Existing AWS Resources into Terraform State
# Use this before deploying authentication to avoid resource conflicts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/terraform"

# Default values
ENVIRONMENT=${1:-prod}
PROJECT_NAME="press-rele"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Usage
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    cat << EOF
Usage: $0 [ENVIRONMENT]

Import existing AWS resources into Terraform state to avoid conflicts.

Arguments:
    ENVIRONMENT    Environment name (default: prod)

Examples:
    $0 prod        # Import production resources
    $0 dev         # Import development resources
    $0 staging     # Import staging resources

This script imports:
- S3 storage bucket
- ECS cluster
- CloudWatch query definitions
- Other existing resources

Run this BEFORE deploying authentication if you have existing infrastructure.

EOF
    exit 0
fi

log_info "=== Importing Existing Resources ==="
log_info "Environment: $ENVIRONMENT"
log_info "Project: $PROJECT_NAME"
echo ""

cd "$TERRAFORM_DIR"

# Check if Terraform is initialized
if [[ ! -d ".terraform" ]]; then
    log_info "Initializing Terraform..."
    terraform init
fi

# Import S3 bucket
BUCKET_NAME="${PROJECT_NAME}-${ENVIRONMENT}-storage"
log_info "Checking S3 bucket: $BUCKET_NAME"

if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    log_info "S3 bucket exists, importing..."
    if terraform import aws_s3_bucket.storage "$BUCKET_NAME" 2>/dev/null; then
        log_success "S3 bucket imported successfully"
    else
        log_warning "S3 bucket already in state or import failed"
    fi
else
    log_info "S3 bucket does not exist, will be created"
fi

# Import ECS cluster
CLUSTER_NAME="${PROJECT_NAME}-${ENVIRONMENT}-cluster"
log_info "Checking ECS cluster: $CLUSTER_NAME"

if aws ecs describe-clusters --clusters "$CLUSTER_NAME" --query 'clusters[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
    log_info "ECS cluster exists, importing..."
    if terraform import aws_ecs_cluster.main "$CLUSTER_NAME" 2>/dev/null; then
        log_success "ECS cluster imported successfully"
    else
        log_warning "ECS cluster already in state or import failed"
    fi
else
    log_info "ECS cluster does not exist, will be created"
fi

# Import CloudWatch query definitions
log_info "Checking CloudWatch query definitions..."

QUERY_DEFS=$(aws logs describe-query-definitions \
  --query-definition-name-prefix "${PROJECT_NAME}-${ENVIRONMENT}" \
  --query 'queryDefinitions[*].[name,queryDefinitionId]' \
  --output text 2>/dev/null || echo "")

if [[ -n "$QUERY_DEFS" ]]; then
    log_info "Found existing query definitions, importing..."
    
    echo "$QUERY_DEFS" | while read name id; do
        if [[ $name == *"backend-errors"* ]]; then
            log_info "Importing backend errors query: $id"
            terraform import aws_cloudwatch_query_definition.backend_errors "$id" 2>/dev/null || log_warning "Already in state"
        elif [[ $name == *"health-check"* ]]; then
            log_info "Importing health check failures query: $id"
            terraform import aws_cloudwatch_query_definition.health_check_failures "$id" 2>/dev/null || log_warning "Already in state"
        fi
    done
    
    log_success "CloudWatch query definitions imported"
else
    log_info "No existing query definitions found"
fi

# Import ECR repositories
BACKEND_REPO="${PROJECT_NAME}-${ENVIRONMENT}-backend"
FRONTEND_REPO="${PROJECT_NAME}-${ENVIRONMENT}-frontend"

log_info "Checking ECR repositories..."

if aws ecr describe-repositories --repository-names "$BACKEND_REPO" 2>/dev/null >/dev/null; then
    log_info "Backend ECR repository exists, importing..."
    terraform import aws_ecr_repository.backend "$BACKEND_REPO" 2>/dev/null || log_warning "Already in state"
    log_success "Backend ECR repository imported"
else
    log_info "Backend ECR repository does not exist, will be created"
fi

if aws ecr describe-repositories --repository-names "$FRONTEND_REPO" 2>/dev/null >/dev/null; then
    log_info "Frontend ECR repository exists, importing..."
    terraform import aws_ecr_repository.frontend "$FRONTEND_REPO" 2>/dev/null || log_warning "Already in state"
    log_success "Frontend ECR repository imported"
else
    log_info "Frontend ECR repository does not exist, will be created"
fi

# Import VPC (if exists)
VPC_NAME="${PROJECT_NAME}-${ENVIRONMENT}-vpc"
log_info "Checking VPC..."

VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:Name,Values=$VPC_NAME" \
  --query 'Vpcs[0].VpcId' \
  --output text 2>/dev/null || echo "")

if [[ -n "$VPC_ID" && "$VPC_ID" != "None" ]]; then
    log_info "VPC exists: $VPC_ID, importing..."
    terraform import aws_vpc.main "$VPC_ID" 2>/dev/null || log_warning "Already in state"
    log_success "VPC imported"
else
    log_info "VPC does not exist, will be created"
fi

echo ""
log_success "=== Import Complete ==="
log_info "Next steps:"
echo "1. Run: terraform plan"
echo "2. Review changes carefully"
echo "3. Run: terraform apply"
echo ""
log_info "Or use the deployment script:"
echo "./scripts/deploy-with-auth.sh --environment $ENVIRONMENT --public --enable-auth"