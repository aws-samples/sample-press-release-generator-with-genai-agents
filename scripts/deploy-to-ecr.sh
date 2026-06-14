#!/bin/bash

# ECR Docker Image Build and Push Script
# Automates building and pushing Docker images to AWS ECR for ECS deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="us-west-2"
AWS_ACCOUNT_ID="55555555555"
AWS_PROFILE="your-aws-profile"
BACKEND_ECR_REPO="press-rele-prod-backend-55555555555"
FRONTEND_ECR_REPO="press-rele-prod-frontend-55555555555"
ECS_CLUSTER="press-rele-prod-cluster"
BACKEND_SERVICE="press-rele-prod-backend"
FRONTEND_SERVICE="press-rele-prod-frontend"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Log file
LOG_FILE="$PROJECT_ROOT/logs/debug/ecr-deployment-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

print_error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}" | tee -a "$LOG_FILE"
}

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_status "Docker is installed"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    print_status "AWS CLI is installed"
    
    # Check AWS profile
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        print_error "AWS profile '$AWS_PROFILE' is not configured or credentials expired"
        print_info "Run: mwinit -o && aws configure sso --profile $AWS_PROFILE"
        exit 1
    fi
    print_status "AWS profile '$AWS_PROFILE' is valid"
    
    # Get account info
    CALLER_IDENTITY=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --output json)
    CURRENT_ACCOUNT=$(echo "$CALLER_IDENTITY" | grep -o '"Account": "[^"]*"' | cut -d'"' -f4)
    
    if [ "$CURRENT_ACCOUNT" != "$AWS_ACCOUNT_ID" ]; then
        print_error "AWS account mismatch: expected $AWS_ACCOUNT_ID, got $CURRENT_ACCOUNT"
        exit 1
    fi
    print_status "AWS account verified: $AWS_ACCOUNT_ID"
}

# Login to ECR
ecr_login() {
    print_header "Logging into ECR"
    
    print_info "Authenticating with ECR..."
    aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" | \
        docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com" \
        >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        print_status "Successfully logged into ECR"
    else
        print_error "Failed to login to ECR"
        exit 1
    fi
}

# Build backend Docker image
build_backend() {
    print_header "Building Backend Docker Image"
    
    cd "$PROJECT_ROOT"
    
    print_info "Building backend image for AMD64 architecture..."
    docker build \
        --platform linux/amd64 \
        -t "$BACKEND_ECR_REPO:latest" \
        -t "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPO:latest" \
        -f backend/Dockerfile \
        . \
        >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        print_status "Backend image built successfully"
    else
        print_error "Failed to build backend image"
        tail -50 "$LOG_FILE"
        exit 1
    fi
}

# Build frontend Docker image
build_frontend() {
    print_header "Building Frontend Docker Image"
    
    cd "$PROJECT_ROOT"
    
    print_info "Building frontend image for AMD64 architecture..."
    docker build \
        --platform linux/amd64 \
        -t "$FRONTEND_ECR_REPO:latest" \
        -t "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_ECR_REPO:latest" \
        -f frontend/Dockerfile \
        . \
        >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        print_status "Frontend image built successfully"
    else
        print_error "Failed to build frontend image"
        tail -50 "$LOG_FILE"
        exit 1
    fi
}

# Push backend image to ECR
push_backend() {
    print_header "Pushing Backend Image to ECR"
    
    print_info "Pushing backend image..."
    docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPO:latest" \
        >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        print_status "Backend image pushed successfully"
    else
        print_error "Failed to push backend image"
        tail -50 "$LOG_FILE"
        exit 1
    fi
}

# Push frontend image to ECR
push_frontend() {
    print_header "Pushing Frontend Image to ECR"
    
    print_info "Pushing frontend image..."
    docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_ECR_REPO:latest" \
        >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        print_status "Frontend image pushed successfully"
    else
        print_error "Failed to push frontend image"
        tail -50 "$LOG_FILE"
        exit 1
    fi
}

# Force ECS service redeployment
force_redeploy() {
    print_header "Forcing ECS Service Redeployment"
    
    print_info "Forcing backend service redeploy..."
    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$BACKEND_SERVICE" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        >> "$LOG_FILE" 2>&1
    print_status "Backend service redeploy initiated"
    
    print_info "Forcing frontend service redeploy..."
    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$FRONTEND_SERVICE" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        >> "$LOG_FILE" 2>&1
    print_status "Frontend service redeploy initiated"
}

# Wait for services to stabilize
wait_for_services() {
    print_header "Waiting for Services to Stabilize"
    
    print_info "Waiting for backend service..."
    aws ecs wait services-stable \
        --cluster "$ECS_CLUSTER" \
        --services "$BACKEND_SERVICE" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        >> "$LOG_FILE" 2>&1 &
    BACKEND_WAIT_PID=$!
    
    print_info "Waiting for frontend service..."
    aws ecs wait services-stable \
        --cluster "$ECS_CLUSTER" \
        --services "$FRONTEND_SERVICE" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        >> "$LOG_FILE" 2>&1 &
    FRONTEND_WAIT_PID=$!
    
    # Wait for both with timeout
    TIMEOUT=600  # 10 minutes
    ELAPSED=0
    INTERVAL=10
    
    while [ $ELAPSED -lt $TIMEOUT ]; do
        if ! kill -0 $BACKEND_WAIT_PID 2>/dev/null && ! kill -0 $FRONTEND_WAIT_PID 2>/dev/null; then
            print_status "Both services are stable"
            return 0
        fi
        
        print_info "Waiting... ($ELAPSED/$TIMEOUT seconds)"
        sleep $INTERVAL
        ELAPSED=$((ELAPSED + INTERVAL))
    done
    
    print_warning "Timeout waiting for services to stabilize"
    print_info "Services may still be deploying - check AWS console"
}

# Check service health
check_health() {
    print_header "Checking Service Health"
    
    # Get ALB DNS from Terraform outputs
    ALB_DNS=$(cd "$PROJECT_ROOT/terraform" && terraform output -raw alb_dns_name 2>/dev/null || echo "")
    
    if [ -z "$ALB_DNS" ]; then
        print_warning "Could not get ALB DNS from Terraform outputs"
        print_info "Checking ECS service status instead..."
        
        # Check backend service
        BACKEND_STATUS=$(aws ecs describe-services \
            --cluster "$ECS_CLUSTER" \
            --services "$BACKEND_SERVICE" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --query 'services[0].runningCount' \
            --output text 2>/dev/null)
        
        print_info "Backend running tasks: $BACKEND_STATUS"
        
        # Check frontend service
        FRONTEND_STATUS=$(aws ecs describe-services \
            --cluster "$ECS_CLUSTER" \
            --services "$FRONTEND_SERVICE" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --query 'services[0].runningCount' \
            --output text 2>/dev/null)
        
        print_info "Frontend running tasks: $FRONTEND_STATUS"
        
        if [ "$BACKEND_STATUS" -gt 0 ] && [ "$FRONTEND_STATUS" -gt 0 ]; then
            print_status "Services are running"
        else
            print_warning "Services are not fully running yet"
        fi
    else
        print_info "Testing ALB health endpoint..."
        if curl -f -s "http://$ALB_DNS/health" > /dev/null 2>&1; then
            print_status "Backend health check passed"
        else
            print_warning "Backend health check failed (may still be starting)"
        fi
        
        print_info "Testing frontend endpoint..."
        if curl -f -s "http://$ALB_DNS/" > /dev/null 2>&1; then
            print_status "Frontend health check passed"
        else
            print_warning "Frontend health check failed (may still be starting)"
        fi
    fi
}

# Show deployment summary
show_summary() {
    print_header "Deployment Summary"
    
    print_info "Images pushed to ECR:"
    echo "  Backend:  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_ECR_REPO:latest"
    echo "  Frontend: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_ECR_REPO:latest"
    
    print_info "ECS Services:"
    echo "  Cluster: $ECS_CLUSTER"
    echo "  Backend Service: $BACKEND_SERVICE"
    echo "  Frontend Service: $FRONTEND_SERVICE"
    
    print_info "Useful Commands:"
    echo "  View backend logs:  aws logs tail /ecs/press-rele-prod-backend --follow --profile $AWS_PROFILE"
    echo "  View frontend logs: aws logs tail /ecs/press-rele-prod-frontend --follow --profile $AWS_PROFILE"
    echo "  Check services:     aws ecs describe-services --cluster $ECS_CLUSTER --services $BACKEND_SERVICE $FRONTEND_SERVICE --profile $AWS_PROFILE"
    
    print_info "Log file: $LOG_FILE"
}

# Main deployment function
main() {
    print_header "🚀 ECR Docker Image Deployment"
    print_info "Started at: $(date)"
    
    check_prerequisites
    ecr_login
    build_backend
    build_frontend
    push_backend
    push_frontend
    force_redeploy
    wait_for_services
    check_health
    show_summary
    
    print_status "Deployment completed!"
    print_info "Finished at: $(date)"
}

# Run main function
main "$@"