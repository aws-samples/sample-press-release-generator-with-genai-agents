#!/bin/bash

# Docker Image Build and Push Script for ECR
# This script builds Docker images and pushes them to ECR repositories

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/terraform"

# Docker configuration
BACKEND_DOCKERFILE="$PROJECT_ROOT/backend/Dockerfile"
FRONTEND_DOCKERFILE="$PROJECT_ROOT/frontend/Dockerfile"
IMAGE_TAG="latest"

echo -e "${BLUE}🐳 Press Release Generator - Docker Image Build & Push${NC}"
echo "=========================================================="

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured"
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed"
        exit 1
    fi
    
    # Check if Terraform directory exists
    if [ ! -d "$TERRAFORM_DIR" ]; then
        print_error "Terraform directory not found: $TERRAFORM_DIR"
        exit 1
    fi
    
    # Check Dockerfiles
    if [ ! -f "$BACKEND_DOCKERFILE" ]; then
        print_error "Backend Dockerfile not found: $BACKEND_DOCKERFILE"
        exit 1
    fi
    
    if [ ! -f "$FRONTEND_DOCKERFILE" ]; then
        print_error "Frontend Dockerfile not found: $FRONTEND_DOCKERFILE"
        exit 1
    fi
    
    print_status "All prerequisites satisfied"
}

# Get ECR repository information from Terraform or AWS CLI
get_ecr_info() {
    print_info "Getting ECR repository information..."
    
    # Set AWS profile and region
    export AWS_PROFILE="${AWS_PROFILE:-your-aws-profile}"
    AWS_REGION="${AWS_REGION:-us-west-2}"
    
    # Initialize variables
    BACKEND_REPO_URL=""
    FRONTEND_REPO_URL=""
    
    # Try Terraform first if state exists
    if [ -d "$TERRAFORM_DIR" ] && cd "$TERRAFORM_DIR" 2>/dev/null && terraform show &> /dev/null 2>&1; then
        print_info "Attempting to get ECR URLs from Terraform state..."
        
        # Get outputs and check if they're valid (not error messages)
        local backend_output=$(terraform output -raw backend_ecr_repository_url 2>/dev/null || echo "")
        local frontend_output=$(terraform output -raw frontend_ecr_repository_url 2>/dev/null || echo "")
        
        # Only use Terraform outputs if they look like valid ECR URLs (contain .dkr.ecr.)
        if [[ "$backend_output" =~ \.dkr\.ecr\. ]] && [[ "$frontend_output" =~ \.dkr\.ecr\. ]]; then
            BACKEND_REPO_URL="$backend_output"
            FRONTEND_REPO_URL="$frontend_output"
            AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "$AWS_REGION")
            print_status "ECR repository information retrieved from Terraform"
        else
            print_info "Terraform outputs not valid, will use AWS CLI discovery"
        fi
    fi
    
    # Fallback to AWS CLI discovery if Terraform URLs are not valid
    if [[ -z "$BACKEND_REPO_URL" || -z "$FRONTEND_REPO_URL" ]]; then
        print_info "Discovering ECR repositories via AWS CLI..."
        
        cd "$PROJECT_ROOT"
        
        # Get AWS account ID
        local account_id
        account_id=$(aws sts get-caller-identity --query 'Account' --output text 2>/dev/null)
        
        if [ -z "$account_id" ]; then
            print_error "Failed to get AWS account ID. Check AWS credentials."
            exit 1
        fi
        
        print_info "AWS Account: $account_id"
        print_info "AWS Region: $AWS_REGION"
        
        # Discover ECR repositories matching our naming pattern
        local backend_repo=$(aws ecr describe-repositories --region "$AWS_REGION" \
            --query "repositories[?contains(repositoryName, 'backend')].repositoryName" \
            --output text 2>/dev/null | awk '{print $1}')
        
        local frontend_repo=$(aws ecr describe-repositories --region "$AWS_REGION" \
            --query "repositories[?contains(repositoryName, 'frontend')].repositoryName" \
            --output text 2>/dev/null | awk '{print $1}')
        
        if [[ -z "$backend_repo" || -z "$frontend_repo" ]]; then
            print_error "Could not find ECR repositories. Expected repositories with 'backend' and 'frontend' in names."
            print_info "Available repositories:"
            aws ecr describe-repositories --region "$AWS_REGION" --query "repositories[].repositoryName" --output text
            exit 1
        fi
        
        # Construct ECR URLs
        BACKEND_REPO_URL="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com/${backend_repo}"
        FRONTEND_REPO_URL="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com/${frontend_repo}"
        
        print_status "ECR repositories discovered via AWS CLI"
    fi
    
    print_info "Backend Repository: $BACKEND_REPO_URL"
    print_info "Frontend Repository: $FRONTEND_REPO_URL"
    print_info "AWS Region: $AWS_REGION"
}

# Login to ECR
ecr_login() {
    print_info "Logging in to ECR..."
    
    # Extract registry URL from repository URL
    local registry_url="${BACKEND_REPO_URL%/*}"
    
    if aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry_url"; then
        print_status "Successfully logged in to ECR"
    else
        print_error "Failed to login to ECR"
        exit 1
    fi
}

# Build Docker image
build_image() {
    local service_name=$1
    local dockerfile_path=$2
    local context_path=$3
    local image_url=$4
    
    print_info "Building $service_name Docker image..."
    
    cd "$PROJECT_ROOT"
    
    # Build Docker image
    if docker build --platform linux/amd64 -t "$image_url:$IMAGE_TAG" -f "$dockerfile_path" "$context_path"; then
        print_status "$service_name image built successfully"
        
        # Also tag as latest
        docker tag "$image_url:$IMAGE_TAG" "$image_url:latest"
        
        # Show image info
        local image_size=$(docker images "$image_url:$IMAGE_TAG" --format "table {{.Size}}" | tail -n 1)
        print_info "$service_name image size: $image_size"
    else
        print_error "Failed to build $service_name image"
        exit 1
    fi
}

# Push Docker image
push_image() {
    local service_name=$1
    local image_url=$2
    
    print_info "Pushing $service_name image to ECR..."
    
    if docker push "$image_url:$IMAGE_TAG"; then
        print_status "$service_name image pushed successfully"
        
        # Also push latest tag
        if docker push "$image_url:latest"; then
            print_status "$service_name latest tag pushed successfully"
        else
            print_warning "Failed to push $service_name latest tag (non-critical)"
        fi
    else
        print_error "Failed to push $service_name image"
        exit 1
    fi
}

# Update ECS services with new images
update_ecs_services() {
    print_info "Updating ECS services with new Docker images..."
    
    cd "$TERRAFORM_DIR"
    
    # Update terraform.tfvars file with ECR image URLs (preserve existing config)
    print_info "Updating terraform.tfvars with ECR image URLs..."
    
    if [[ -f terraform.tfvars ]]; then
        # Preserve existing configuration, just update ECR URLs
        print_info "Preserving existing terraform.tfvars configuration..."
        
        # Update backend_image if it exists, otherwise add it
        if grep -q "^backend_image" terraform.tfvars; then
            sed -i.bak "s|^backend_image.*|backend_image = \"$BACKEND_REPO_URL:$IMAGE_TAG\"|" terraform.tfvars
        else
            echo "backend_image = \"$BACKEND_REPO_URL:$IMAGE_TAG\"" >> terraform.tfvars
        fi
        
        # Update frontend_image if it exists, otherwise add it
        if grep -q "^frontend_image" terraform.tfvars; then
            sed -i.bak "s|^frontend_image.*|frontend_image = \"$FRONTEND_REPO_URL:$IMAGE_TAG\"|" terraform.tfvars
        else
            echo "frontend_image = \"$FRONTEND_REPO_URL:$IMAGE_TAG\"" >> terraform.tfvars
        fi
        
        # Clean up backup file
        rm -f terraform.tfvars.bak
        
        print_info "Updated ECR URLs while preserving existing configuration"
    else
        # Create new file if none exists
        cat > terraform.tfvars << EOF
# ECR Image URLs (auto-generated by build-and-push-images.sh)
# Generated on: $(date)
backend_image = "$BACKEND_REPO_URL:$IMAGE_TAG"
frontend_image = "$FRONTEND_REPO_URL:$IMAGE_TAG"
EOF
        print_info "Created new terraform.tfvars with ECR image URLs"
    fi
    
    print_status "terraform.tfvars updated with new image URLs"
    
    # Apply the updated configuration
    print_info "Applying Terraform configuration with new images..."
    if terraform plan -out=tfplan-update && terraform apply -auto-approve tfplan-update; then
        print_status "ECS services updated with new images"
        rm -f tfplan-update
        
        # Wait for services to stabilize
        print_info "Waiting for ECS services to stabilize..."
        sleep 30
        
        # Get cluster and service names
        local cluster_name=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "")
        local backend_service=$(terraform output -raw backend_service_name 2>/dev/null || echo "")
        local frontend_service=$(terraform output -raw frontend_service_name 2>/dev/null || echo "")
        
        if [[ -n "$cluster_name" && -n "$backend_service" && -n "$frontend_service" ]]; then
            print_info "Checking service deployment status..."
            
            # Check backend service
            if aws ecs wait services-stable --cluster "$cluster_name" --services "$backend_service" --region "$AWS_REGION"; then
                print_status "Backend service deployment completed"
            else
                print_warning "Backend service deployment may still be in progress"
            fi
            
            # Check frontend service
            if aws ecs wait services-stable --cluster "$cluster_name" --services "$frontend_service" --region "$AWS_REGION"; then
                print_status "Frontend service deployment completed"
            else
                print_warning "Frontend service deployment may still be in progress"
            fi
        fi
    else
        print_error "Failed to update ECS services"
        rm -f tfplan-update
        exit 1
    fi
}

# Show deployment status
show_deployment_status() {
    print_info "Deployment Status:"
    echo "=================="
    
    cd "$TERRAFORM_DIR"
    
    # Get service information
    local cluster_name=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "")
    local app_url=$(terraform output -raw application_url 2>/dev/null || echo "")
    local api_url=$(terraform output -raw api_url 2>/dev/null || echo "")
    
    echo ""
    print_info "🐳 Docker Images:"
    echo "   Backend: $BACKEND_REPO_URL:$IMAGE_TAG"
    echo "   Frontend: $FRONTEND_REPO_URL:$IMAGE_TAG"
    
    if [[ -n "$app_url" && -n "$api_url" ]]; then
        echo ""
        print_info "🌐 Application URLs:"
        echo "   Application: $app_url"
        echo "   API: $api_url"
    fi
    
    if [[ -n "$cluster_name" ]]; then
        echo ""
        print_info "🔍 Useful Commands:"
        echo "   Check services: aws ecs describe-services --cluster $cluster_name --services backend frontend --region $AWS_REGION"
        echo "   View logs: aws logs tail /ecs/$cluster_name --follow --region $AWS_REGION"
        echo "   Force deployment: aws ecs update-service --cluster $cluster_name --service backend --force-new-deployment --region $AWS_REGION"
    fi
}

# Main function
main() {
    local update_services=true
    local build_only=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --build-only)
                build_only=true
                update_services=false
                shift
                ;;
            --no-update)
                update_services=false
                shift
                ;;
            --tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --build-only      Build and push images only, don't update ECS services"
                echo "  --no-update       Build and push images but don't update ECS services"
                echo "  --tag TAG         Use specific tag for images (default: latest)"
                echo "  --help, -h        Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    print_info "Starting Docker image build and push process..."
    print_info "Image tag: $IMAGE_TAG"
    
    # Run the process
    check_prerequisites
    get_ecr_info
    ecr_login
    
    # Build images
    build_image "backend" "$BACKEND_DOCKERFILE" "." "$BACKEND_REPO_URL"
    build_image "frontend" "$FRONTEND_DOCKERFILE" "." "$FRONTEND_REPO_URL"
    
    # Push images
    push_image "backend" "$BACKEND_REPO_URL"
    push_image "frontend" "$FRONTEND_REPO_URL"
    
    if [ "$build_only" = false ] && [ "$update_services" = true ]; then
        update_ecs_services
    fi
    
    show_deployment_status
    
    print_status "🎉 Docker image build and push completed successfully!"
    
    if [ "$update_services" = false ]; then
        print_info "To update ECS services with new images, run:"
        print_info "  cd $TERRAFORM_DIR && terraform apply"
    fi
}

# Run main function
main "$@"