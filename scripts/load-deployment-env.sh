#!/bin/bash

# =============================================================================
# Deployment Environment Configuration Loader
# =============================================================================
# This script loads environment-specific configuration from config/deployment-env.{environment}
# and makes it available to other scripts and Terraform operations.
#
# Usage:
#   source scripts/load-deployment-env.sh [environment]
#   
# Examples:
#   source scripts/load-deployment-env.sh your-aws-profile
#   source scripts/load-deployment-env.sh production
#   source scripts/load-deployment-env.sh development
#
# The script will:
# 1. Load the specified environment configuration
# 2. Export all variables for use by other scripts
# 3. Validate required variables are set
# 4. Set up Terraform variable file path
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Get the project root directory
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
else
    PROJECT_ROOT="$(pwd)"
fi

# Determine environment
ENVIRONMENT="${1:-}"
if [[ -z "$ENVIRONMENT" ]]; then
    print_error "Environment not specified. Usage: source scripts/load-deployment-env.sh [environment]"
    return 1
fi

# Path to environment configuration file
ENV_CONFIG_FILE="$PROJECT_ROOT/config/deployment-env.$ENVIRONMENT"

# Check if environment configuration file exists
if [[ ! -f "$ENV_CONFIG_FILE" ]]; then
    print_error "Environment configuration file not found: $ENV_CONFIG_FILE"
    print_info "Available environments:"
    ls -1 "$PROJECT_ROOT/config/deployment-env."* 2>/dev/null | sed 's/.*deployment-env\./  - /' || echo "  No environment files found"
    return 1
fi

print_info "Loading deployment environment: $ENVIRONMENT"
print_info "Configuration file: $ENV_CONFIG_FILE"

# Source the environment configuration
set -a  # Automatically export all variables
source "$ENV_CONFIG_FILE"
set +a  # Stop automatically exporting

# Validate required variables
REQUIRED_VARS=(
    "DEPLOYMENT_ENVIRONMENT"
    "PROJECT_NAME"
    "AWS_ACCOUNT_ID"
    "AWS_REGION"
    "AWS_PROFILE"
    "ECR_BACKEND_REPO_NAME"
    "ECR_FRONTEND_REPO_NAME"
    "ECS_CLUSTER_NAME"
    "ECS_BACKEND_SERVICE_NAME"
    "ECS_FRONTEND_SERVICE_NAME"
)

print_info "Validating required variables..."
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "$(eval echo \${$var:-})" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    print_error "Missing required variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    return 1
fi

# Expand variables that reference other variables
export BACKEND_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_BACKEND_REPO_NAME}:latest"
export FRONTEND_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_FRONTEND_REPO_NAME}:latest"
export BEDROCK_MODEL_ID="arn:aws:bedrock:${AWS_REGION}:${AWS_ACCOUNT_ID}:inference-profile/us.anthropic.claude-sonnet-4-20250514-v1:0"

# Set Terraform-specific variables
export TF_VAR_aws_account_id="$AWS_ACCOUNT_ID"
export TF_VAR_aws_region="$AWS_REGION"
export TF_VAR_deployment_environment="$DEPLOYMENT_ENVIRONMENT"
export TF_VAR_project_name="$PROJECT_NAME"
export TF_VAR_backend_image_uri="$BACKEND_IMAGE_URI"
export TF_VAR_frontend_image_uri="$FRONTEND_IMAGE_URI"
export TF_VAR_bedrock_model_id="$BEDROCK_MODEL_ID"

# Set Terraform variable file path
export TF_VAR_FILE="terraform.tfvars.$ENVIRONMENT"

print_success "Environment configuration loaded successfully!"
print_info "Key configuration:"
echo "  - Environment: $DEPLOYMENT_ENVIRONMENT"
echo "  - AWS Account: $AWS_ACCOUNT_ID"
echo "  - AWS Region: $AWS_REGION"
echo "  - AWS Profile: $AWS_PROFILE"
echo "  - Backend Image: $BACKEND_IMAGE_URI"
echo "  - Frontend Image: $FRONTEND_IMAGE_URI"
echo "  - ECS Cluster: $ECS_CLUSTER_NAME"
echo "  - Terraform Vars: $TF_VAR_FILE"

print_info "Environment variables are now available for scripts and Terraform operations."
print_info "Use 'env | grep -E \"(AWS_|TF_VAR_|ECR_|ECS_)\"' to see all exported variables."