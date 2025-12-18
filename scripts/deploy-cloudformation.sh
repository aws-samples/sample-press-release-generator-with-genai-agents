#!/bin/bash

# Press Release Generator - CloudFormation Deployment Script
# This script deploys the complete infrastructure using AWS CloudFormation

set -euo pipefail

# Configuration
PROJECT_NAME="press-release-generator"
DEFAULT_ENVIRONMENT="prod"
DEFAULT_REGION="us-west-2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLOUDFORMATION_DIR="$PROJECT_ROOT/cloudformation"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Help function
show_help() {
    cat << EOF
Press Release Generator - CloudFormation Deployment Script

USAGE:
    $0 [OPTIONS] COMMAND

COMMANDS:
    deploy      Deploy the complete infrastructure
    update      Update existing infrastructure
    destroy     Destroy all infrastructure
    status      Show deployment status
    validate    Validate CloudFormation templates
    help        Show this help message

OPTIONS:
    -e, --environment ENV    Environment (dev, staging, prod) [default: $DEFAULT_ENVIRONMENT]
    -r, --region REGION      AWS region [default: $DEFAULT_REGION]
    -p, --project PROJECT    Project name [default: $PROJECT_NAME]
    --frontend-url URL       Frontend URL for CORS configuration
    --cors-origins ORIGINS   Comma-separated CORS allowed origins
    --backend-image IMAGE    Backend Docker image
    --frontend-image IMAGE   Frontend Docker image
    --firecrawl-secret ARN   Firecrawl API key secret ARN
    --perplexity-secret ARN  Perplexity API key secret ARN
    --bedrock-model MODEL    Bedrock model ID
    --skip-build            Skip Docker image build
    --dry-run               Show what would be deployed without executing
    -v, --verbose           Enable verbose output
    -h, --help              Show this help message

EXAMPLES:
    # Deploy to production
    $0 deploy

    # Deploy to staging with custom CORS
    $0 -e staging --frontend-url https://staging.example.com deploy

    # Update existing deployment
    $0 update

    # Validate templates
    $0 validate

    # Check deployment status
    $0 status

    # Destroy infrastructure
    $0 destroy

ENVIRONMENT VARIABLES:
    AWS_PROFILE             AWS profile to use
    AWS_REGION              AWS region (overridden by --region)
    FRONTEND_URL            Frontend URL for CORS
    CORS_ALLOWED_ORIGINS    CORS allowed origins
    FIRECRAWL_API_KEY_SECRET_ARN    Firecrawl secret ARN
    PERPLEXITY_API_KEY_SECRET_ARN   Perplexity secret ARN
    BEDROCK_MODEL_ID        Bedrock model ID

EOF
}

# Parse command line arguments
parse_args() {
    ENVIRONMENT="$DEFAULT_ENVIRONMENT"
    REGION="$DEFAULT_REGION"
    PROJECT="$PROJECT_NAME"
    FRONTEND_URL="${FRONTEND_URL:-}"
    CORS_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://*.cloudfront.net,https://*.elb.amazonaws.com}"
    BACKEND_IMAGE="${BACKEND_IMAGE:-$PROJECT_NAME-backend:latest}"
    FRONTEND_IMAGE="${FRONTEND_IMAGE:-$PROJECT_NAME-frontend:latest}"
    FIRECRAWL_SECRET="${FIRECRAWL_API_KEY_SECRET_ARN:-}"
    PERPLEXITY_SECRET="${PERPLEXITY_API_KEY_SECRET_ARN:-}"
    BEDROCK_MODEL="${BEDROCK_MODEL_ID:-arn:aws:bedrock:${AWS_REGION}:${AWS_ACCOUNT_ID}:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0}"
    SKIP_BUILD=false
    DRY_RUN=false
    VERBOSE=false
    COMMAND=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -r|--region)
                REGION="$2"
                shift 2
                ;;
            -p|--project)
                PROJECT="$2"
                shift 2
                ;;
            --frontend-url)
                FRONTEND_URL="$2"
                shift 2
                ;;
            --cors-origins)
                CORS_ORIGINS="$2"
                shift 2
                ;;
            --backend-image)
                BACKEND_IMAGE="$2"
                shift 2
                ;;
            --frontend-image)
                FRONTEND_IMAGE="$2"
                shift 2
                ;;
            --firecrawl-secret)
                FIRECRAWL_SECRET="$2"
                shift 2
                ;;
            --perplexity-secret)
                PERPLEXITY_SECRET="$2"
                shift 2
                ;;
            --bedrock-model)
                BEDROCK_MODEL="$2"
                shift 2
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            deploy|update|destroy|status|validate|help)
                COMMAND="$1"
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    if [[ -z "$COMMAND" ]]; then
        log_error "No command specified"
        show_help
        exit 1
    fi

    # Set AWS region
    export AWS_DEFAULT_REGION="$REGION"
}

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured or invalid"
        exit 1
    fi

    # Check Docker if not skipping build
    if [[ "$SKIP_BUILD" == false ]]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker is not installed"
            exit 1
        fi

        if ! docker info &> /dev/null; then
            log_error "Docker daemon is not running"
            exit 1
        fi
    fi

    # Check CloudFormation templates exist
    local templates=(
        "$CLOUDFORMATION_DIR/main-infrastructure.yaml"
        "$CLOUDFORMATION_DIR/ecs-services.yaml"
    )

    for template in "${templates[@]}"; do
        if [[ ! -f "$template" ]]; then
            log_error "CloudFormation template not found: $template"
            exit 1
        fi
    done

    log_success "Prerequisites validated"
}

# Validate CloudFormation templates
validate_templates() {
    log_info "Validating CloudFormation templates..."

    local templates=(
        "$CLOUDFORMATION_DIR/main-infrastructure.yaml"
        "$CLOUDFORMATION_DIR/ecs-services.yaml"
    )

    for template in "${templates[@]}"; do
        log_info "Validating $(basename "$template")..."
        if aws cloudformation validate-template --template-body "file://$template" > /dev/null; then
            log_success "$(basename "$template") is valid"
        else
            log_error "$(basename "$template") validation failed"
            return 1
        fi
    done

    log_success "All templates validated successfully"
}

# Build Docker images
build_images() {
    if [[ "$SKIP_BUILD" == true ]]; then
        log_info "Skipping Docker image build"
        return 0
    fi

    log_info "Building Docker images..."

    # Get AWS account ID and region for ECR
    local account_id
    account_id=$(aws sts get-caller-identity --query Account --output text)
    local ecr_registry="${account_id}.dkr.ecr.${REGION}.amazonaws.com"

    # Create ECR repositories if they don't exist
    local repositories=("${PROJECT}-backend" "${PROJECT}-frontend")
    for repo in "${repositories[@]}"; do
        if ! aws ecr describe-repositories --repository-names "$repo" --region "$REGION" &> /dev/null; then
            log_info "Creating ECR repository: $repo"
            aws ecr create-repository --repository-name "$repo" --region "$REGION" > /dev/null
        fi
    done

    # Login to ECR
    log_info "Logging in to ECR..."
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ecr_registry"

    # Build and push backend image
    log_info "Building backend image..."
    docker build -t "${PROJECT}-backend:latest" -f "$PROJECT_ROOT/backend/Dockerfile" "$PROJECT_ROOT/backend"
    docker tag "${PROJECT}-backend:latest" "${ecr_registry}/${PROJECT}-backend:latest"
    docker push "${ecr_registry}/${PROJECT}-backend:latest"

    # Build and push frontend image
    log_info "Building frontend image..."
    docker build -t "${PROJECT}-frontend:latest" -f "$PROJECT_ROOT/frontend/Dockerfile" "$PROJECT_ROOT/frontend"
    docker tag "${PROJECT}-frontend:latest" "${ecr_registry}/${PROJECT}-frontend:latest"
    docker push "${ecr_registry}/${PROJECT}-frontend:latest"

    # Update image references
    BACKEND_IMAGE="${ecr_registry}/${PROJECT}-backend:latest"
    FRONTEND_IMAGE="${ecr_registry}/${PROJECT}-frontend:latest"

    log_success "Docker images built and pushed successfully"
}

# Deploy infrastructure stack
deploy_infrastructure() {
    local stack_name="${PROJECT}-${ENVIRONMENT}-infrastructure"
    log_info "Deploying infrastructure stack: $stack_name"

    local parameters=(
        "ParameterKey=ProjectName,ParameterValue=$PROJECT"
        "ParameterKey=Environment,ParameterValue=$ENVIRONMENT"
        "ParameterKey=CorsAllowedOrigins,ParameterValue=$CORS_ORIGINS"
    )

    if [[ -n "$FRONTEND_URL" ]]; then
        parameters+=("ParameterKey=FrontendUrl,ParameterValue=$FRONTEND_URL")
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would deploy infrastructure stack with parameters:"
        printf '%s\n' "${parameters[@]}"
        return 0
    fi

    aws cloudformation deploy \
        --template-file "$CLOUDFORMATION_DIR/main-infrastructure.yaml" \
        --stack-name "$stack_name" \
        --parameter-overrides "${parameters[@]}" \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --region "$REGION" \
        --no-fail-on-empty-changeset

    log_success "Infrastructure stack deployed successfully"
}

# Deploy services stack
deploy_services() {
    local stack_name="${PROJECT}-${ENVIRONMENT}-services"
    log_info "Deploying services stack: $stack_name"

    local parameters=(
        "ParameterKey=ProjectName,ParameterValue=$PROJECT"
        "ParameterKey=Environment,ParameterValue=$ENVIRONMENT"
        "ParameterKey=BackendImage,ParameterValue=$BACKEND_IMAGE"
        "ParameterKey=FrontendImage,ParameterValue=$FRONTEND_IMAGE"
        "ParameterKey=CorsAllowedOrigins,ParameterValue=$CORS_ORIGINS"
        "ParameterKey=BedrockModelId,ParameterValue=$BEDROCK_MODEL"
    )

    if [[ -n "$FRONTEND_URL" ]]; then
        parameters+=("ParameterKey=FrontendUrl,ParameterValue=$FRONTEND_URL")
    fi

    if [[ -n "$FIRECRAWL_SECRET" ]]; then
        parameters+=("ParameterKey=FirecrawlApiKeySecretArn,ParameterValue=$FIRECRAWL_SECRET")
    fi

    if [[ -n "$PERPLEXITY_SECRET" ]]; then
        parameters+=("ParameterKey=PerplexityApiKeySecretArn,ParameterValue=$PERPLEXITY_SECRET")
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would deploy services stack with parameters:"
        printf '%s\n' "${parameters[@]}"
        return 0
    fi

    aws cloudformation deploy \
        --template-file "$CLOUDFORMATION_DIR/ecs-services.yaml" \
        --stack-name "$stack_name" \
        --parameter-overrides "${parameters[@]}" \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --region "$REGION" \
        --no-fail-on-empty-changeset

    log_success "Services stack deployed successfully"
}

# Get deployment status
get_status() {
    log_info "Getting deployment status..."

    local stacks=(
        "${PROJECT}-${ENVIRONMENT}-infrastructure"
        "${PROJECT}-${ENVIRONMENT}-services"
    )

    for stack in "${stacks[@]}"; do
        log_info "Stack: $stack"
        if aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" &> /dev/null; then
            local status
            status=$(aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" --query 'Stacks[0].StackStatus' --output text)
            log_info "  Status: $status"

            if [[ "$status" == "CREATE_COMPLETE" || "$status" == "UPDATE_COMPLETE" ]]; then
                # Get outputs
                local outputs
                outputs=$(aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" --query 'Stacks[0].Outputs' --output table 2>/dev/null || echo "No outputs")
                if [[ "$outputs" != "No outputs" ]]; then
                    echo "$outputs"
                fi
            fi
        else
            log_warning "  Stack does not exist"
        fi
        echo
    done
}

# Destroy infrastructure
destroy_infrastructure() {
    log_warning "This will destroy ALL infrastructure for $PROJECT in $ENVIRONMENT environment"
    read -p "Are you sure? (yes/no): " -r
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_info "Deployment destruction cancelled"
        exit 0
    fi

    local stacks=(
        "${PROJECT}-${ENVIRONMENT}-services"
        "${PROJECT}-${ENVIRONMENT}-infrastructure"
    )

    for stack in "${stacks[@]}"; do
        log_info "Deleting stack: $stack"
        if aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" &> /dev/null; then
            if [[ "$DRY_RUN" == true ]]; then
                log_info "DRY RUN: Would delete stack $stack"
            else
                aws cloudformation delete-stack --stack-name "$stack" --region "$REGION"
                log_info "Waiting for stack deletion to complete..."
                aws cloudformation wait stack-delete-complete --stack-name "$stack" --region "$REGION"
                log_success "Stack $stack deleted successfully"
            fi
        else
            log_warning "Stack $stack does not exist"
        fi
    done

    if [[ "$DRY_RUN" == false ]]; then
        log_success "All infrastructure destroyed successfully"
    fi
}

# Main deployment function
deploy() {
    log_info "Starting CloudFormation deployment..."
    log_info "Project: $PROJECT"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Frontend URL: ${FRONTEND_URL:-<auto-generated>}"
    log_info "CORS Origins: $CORS_ORIGINS"

    validate_prerequisites
    validate_templates
    build_images
    deploy_infrastructure
    deploy_services

    log_success "Deployment completed successfully!"
    echo
    log_info "Getting deployment information..."
    get_status
}

# Update deployment
update() {
    log_info "Updating CloudFormation deployment..."
    deploy
}

# Main script execution
main() {
    parse_args "$@"

    case "$COMMAND" in
        deploy)
            deploy
            ;;
        update)
            update
            ;;
        destroy)
            destroy_infrastructure
            ;;
        status)
            get_status
            ;;
        validate)
            validate_templates
            ;;
        help)
            show_help
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"