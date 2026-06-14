#!/bin/bash

# AWS Infrastructure Destroy Script
# Phase 1 of Terraform Infrastructure Rebuild
# 
# This script safely destroys the existing AWS infrastructure when Terraform
# configuration is corrupted or incomplete. It uses AWS CLI to identify and
# destroy resources in the correct dependency order.
#
# CRITICAL: This script is designed for your AWS account (123456789012)
# and us-west-2 region based on infrastructure analysis.

set -e  # Exit on any error
set -u  # Exit on undefined variables

# Configuration
AWS_PROFILE="your-aws-profile"
AWS_REGION="us-west-2"
PROJECT_PREFIX="press-rele"
LOG_FILE="../logs/debug/aws-infrastructure-destroy-$(date +%Y%m%d-%H%M%S).log"
FORCE_MODE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE_MODE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--force|-f]"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Validate AWS credentials and account
validate_aws_access() {
    log "=== Validating AWS Access ==="
    
    local account_id
    account_id=$(AWS_PROFILE="$AWS_PROFILE" aws sts get-caller-identity --query 'Account' --output text 2>/dev/null) || error_exit "Failed to get AWS account ID"
    
    if [ "$account_id" != "5555555555" ]; then
        error_exit "Wrong AWS account. Expected: 55555555555, Got: $account_id"
    fi
    
    log "✓ AWS access validated for account: $account_id"
    log "✓ Using profile: $AWS_PROFILE"
    log "✓ Using region: $AWS_REGION"
}

# Pre-destroy validation - check what resources exist
pre_destroy_validation() {
    log "=== Pre-Destroy Infrastructure Validation ==="
    
    # Check ALB
    local alb_count
    alb_count=$(AWS_PROFILE="$AWS_PROFILE" aws elbv2 describe-load-balancers --region "$AWS_REGION" --query "length(LoadBalancers[?contains(LoadBalancerName, '$PROJECT_PREFIX')])" --output text)
    log "✓ Found $alb_count Application Load Balancer(s)"
    
    # Check ECS Cluster
    local cluster_count
    cluster_count=$(AWS_PROFILE="$AWS_PROFILE" aws ecs list-clusters --region "$AWS_REGION" --query "length(clusterArns[?contains(@, '$PROJECT_PREFIX')])" --output text)
    log "✓ Found $cluster_count ECS Cluster(s)"
    
    # Check ECR Repositories
    local ecr_count
    ecr_count=$(AWS_PROFILE="$AWS_PROFILE" aws ecr describe-repositories --region "$AWS_REGION" --query "length(repositories[?contains(repositoryName, '$PROJECT_PREFIX')])" --output text)
    log "✓ Found $ecr_count ECR Repository(ies)"
    
    # Check ECS Services
    if [ "$cluster_count" -gt 0 ]; then
        local services
        services=$(AWS_PROFILE="$AWS_PROFILE" aws ecs list-services --region "$AWS_REGION" --cluster "${PROJECT_PREFIX}-prod-cluster" --query 'serviceArns' --output text 2>/dev/null || echo "")
        if [ -n "$services" ] && [ "$services" != "None" ]; then
            log "✓ Found ECS services in cluster"
        else
            log "✓ No ECS services found in cluster"
        fi
    fi
    
    log "=== Pre-Destroy Validation Complete ==="
}

# Stop ECS Services (graceful shutdown)
stop_ecs_services() {
    log "=== Stopping ECS Services ==="
    
    local cluster_name="${PROJECT_PREFIX}-prod-cluster"
    
    # List services in the cluster
    local services
    services=$(AWS_PROFILE="$AWS_PROFILE" aws ecs list-services --region "$AWS_REGION" --cluster "$cluster_name" --query 'serviceArns[]' --output text 2>/dev/null || echo "")
    
    if [ -n "$services" ] && [ "$services" != "None" ]; then
        log "Found services to stop: $services"
        
        # Scale down each service to 0 desired count
        for service_arn in $services; do
            local service_name
            service_name=$(basename "$service_arn")
            log "Scaling down service: $service_name"
            
            AWS_PROFILE="$AWS_PROFILE" aws ecs update-service \
                --region "$AWS_REGION" \
                --cluster "$cluster_name" \
                --service "$service_name" \
                --desired-count 0 \
                --query 'service.{Name:serviceName,Status:status,DesiredCount:desiredCount}' \
                --output table || log "WARNING: Failed to scale down $service_name"
        done
        
        # Wait for services to scale down
        log "Waiting for services to scale down..."
        sleep 30
        
        # Delete services
        for service_arn in $services; do
            local service_name
            service_name=$(basename "$service_arn")
            log "Deleting service: $service_name"
            
            AWS_PROFILE="$AWS_PROFILE" aws ecs delete-service \
                --region "$AWS_REGION" \
                --cluster "$cluster_name" \
                --service "$service_name" \
                --force || log "WARNING: Failed to delete $service_name"
        done
        
        log "✓ ECS services stopped and deleted"
    else
        log "✓ No ECS services found to stop"
    fi
}

# Delete ECS Cluster
delete_ecs_cluster() {
    log "=== Deleting ECS Cluster ==="
    
    local cluster_name="${PROJECT_PREFIX}-prod-cluster"
    
    # Check if cluster exists
    local cluster_exists
    cluster_exists=$(AWS_PROFILE="$AWS_PROFILE" aws ecs describe-clusters --region "$AWS_REGION" --clusters "$cluster_name" --query 'length(clusters[?status==`ACTIVE`])' --output text 2>/dev/null || echo "0")
    
    if [ "$cluster_exists" -gt 0 ]; then
        log "Deleting ECS cluster: $cluster_name"
        AWS_PROFILE="$AWS_PROFILE" aws ecs delete-cluster \
            --region "$AWS_REGION" \
            --cluster "$cluster_name" || log "WARNING: Failed to delete cluster $cluster_name"
        log "✓ ECS cluster deletion initiated"
    else
        log "✓ ECS cluster not found or already deleted"
    fi
}

# Delete Application Load Balancer
delete_load_balancer() {
    log "=== Deleting Application Load Balancer ==="
    
    # Get ALB ARN
    local alb_arn
    alb_arn=$(AWS_PROFILE="$AWS_PROFILE" aws elbv2 describe-load-balancers --region "$AWS_REGION" --query "LoadBalancers[?contains(LoadBalancerName, '$PROJECT_PREFIX')].LoadBalancerArn" --output text 2>/dev/null || echo "")
    
    if [ -n "$alb_arn" ] && [ "$alb_arn" != "None" ]; then
        log "Deleting ALB: $alb_arn"
        AWS_PROFILE="$AWS_PROFILE" aws elbv2 delete-load-balancer \
            --region "$AWS_REGION" \
            --load-balancer-arn "$alb_arn" || log "WARNING: Failed to delete ALB"
        log "✓ Application Load Balancer deletion initiated"
        
        # Wait for ALB to be deleted before proceeding
        log "Waiting for ALB deletion to complete..."
        sleep 60
    else
        log "✓ Application Load Balancer not found or already deleted"
    fi
}

# Clean up ECR repositories (optional - preserves Docker images)
cleanup_ecr_repositories() {
    log "=== ECR Repository Cleanup (Optional) ==="
    
    local repositories
    repositories=$(AWS_PROFILE="$AWS_PROFILE" aws ecr describe-repositories --region "$AWS_REGION" --query "repositories[?contains(repositoryName, '$PROJECT_PREFIX')].repositoryName" --output text 2>/dev/null || echo "")
    
    if [ -n "$repositories" ] && [ "$repositories" != "None" ]; then
        log "Found ECR repositories: $repositories"
        log "NOTE: ECR repositories contain Docker images and will be preserved"
        log "NOTE: To delete ECR repositories, run: aws ecr delete-repository --repository-name <name> --force"
        
        for repo in $repositories; do
            log "  - Repository: $repo"
        done
    else
        log "✓ No ECR repositories found"
    fi
}

# Post-destroy validation
post_destroy_validation() {
    log "=== Post-Destroy Validation ==="
    
    # Check ALB
    local alb_count
    alb_count=$(AWS_PROFILE="$AWS_PROFILE" aws elbv2 describe-load-balancers --region "$AWS_REGION" --query "length(LoadBalancers[?contains(LoadBalancerName, '$PROJECT_PREFIX')])" --output text 2>/dev/null || echo "0")
    
    if [ "$alb_count" -eq 0 ]; then
        log "✓ Application Load Balancer successfully destroyed"
    else
        log "WARNING: $alb_count Application Load Balancer(s) still exist"
    fi
    
    # Check ECS Cluster
    local cluster_count
    cluster_count=$(AWS_PROFILE="$AWS_PROFILE" aws ecs list-clusters --region "$AWS_REGION" --query "length(clusterArns[?contains(@, '$PROJECT_PREFIX')])" --output text 2>/dev/null || echo "0")
    
    if [ "$cluster_count" -eq 0 ]; then
        log "✓ ECS Cluster successfully destroyed"
    else
        log "WARNING: $cluster_count ECS Cluster(s) still exist"
    fi
    
    # Test ALB endpoint accessibility
    log "Testing ALB endpoint accessibility..."
    if curl -s --max-time 10 "https://press-rele-prod-alb-760680013.us-west-2.elb.amazonaws.com" >/dev/null 2>&1; then
        log "WARNING: ALB endpoint still accessible"
    else
        log "✓ ALB endpoint no longer accessible"
    fi
}

# Main execution
main() {
    log "=== AWS Infrastructure Destroy Script Started ==="
    log "Target Account: 55555555555 (your-aws-profile)"
    log "Target Region: $AWS_REGION"
    log "Project Prefix: $PROJECT_PREFIX"
    log "Log File: $LOG_FILE"
    
    # Validation phase
    validate_aws_access
    pre_destroy_validation
    
    # Confirmation prompt (skip if --force flag is used)
    if [ "$FORCE_MODE" = false ]; then
        echo ""
        echo "CRITICAL WARNING: This will destroy the following infrastructure:"
        echo "  - Application Load Balancer: press-rele-prod-alb"
        echo "  - ECS Cluster: press-rele-prod-cluster"
        echo "  - All ECS Services in the cluster"
        echo "  - Associated security groups, target groups, etc."
        echo ""
        echo "ECR repositories will be PRESERVED (containing Docker images)"
        echo ""
        read -p "Are you sure you want to proceed? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log "Destroy operation cancelled by user"
            exit 0
        fi
    else
        log "Force mode enabled - skipping confirmation prompt"
    fi
    
    # Destroy phase
    log "=== Starting Infrastructure Destroy ==="
    stop_ecs_services
    delete_ecs_cluster
    delete_load_balancer
    cleanup_ecr_repositories
    
    # Validation phase
    post_destroy_validation
    
    log "=== AWS Infrastructure Destroy Script Completed ==="
    log "Check log file for detailed results: $LOG_FILE"
    
    echo ""
    echo "Infrastructure destroy operation completed!"
    echo "Check the log file for detailed results: $LOG_FILE"
    echo ""
    echo "Next Steps:"
    echo "1. Verify all resources are destroyed using AWS Console"
    echo "2. Proceed with Phase 2: Enhanced secure deployment"
    echo "3. Update Memory Bank with destroy operation results"
}

# Execute main function
main "$@"