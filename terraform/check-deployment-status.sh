#!/bin/bash

# Quick Deployment Status Check
# Diagnoses why URLs are not accessible from laptop

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

log "🔍 Checking Current Deployment Status"
log "===================================="

# Get current deployment info
if ! terraform show > /dev/null 2>&1; then
    error "No Terraform deployment found. Run 'terraform apply' first."
    exit 1
fi

# Extract key information
ALB_DNS=$(terraform output -raw load_balancer_dns_name 2>/dev/null || echo "NOT_FOUND")
CLUSTER_NAME=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "NOT_FOUND")
DEPLOYMENT_TYPE=$(terraform show -json | jq -r '.values.root_module.resources[] | select(.address == "aws_lb.main") | .values.internal' 2>/dev/null || echo "unknown")

log "Current Configuration:"
log "- Load Balancer DNS: $ALB_DNS"
log "- ECS Cluster: $CLUSTER_NAME"
log "- ALB Internal: $DEPLOYMENT_TYPE"

# Determine accessibility
if [ "$DEPLOYMENT_TYPE" = "true" ]; then
    error "🚨 FOUND THE PROBLEM!"
    error "Your deployment is INTERNAL (VPC-only access)"
    error "This is why you can't access it from your laptop!"
    echo ""
    warning "SOLUTION: Convert to public deployment"
    log "Run: ./deploy-public-access-fix.sh"
elif [ "$DEPLOYMENT_TYPE" = "false" ]; then
    success "Deployment is PUBLIC (internet-facing)"
    log "Checking service health..."
    
    # Check service status
    BACKEND_SERVICE=$(terraform output -raw backend_service_name 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$BACKEND_SERVICE" != "NOT_FOUND" ]; then
        log "Checking ECS service status..."
        SERVICE_STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$BACKEND_SERVICE" --query 'services[0].status' --output text 2>/dev/null || echo "ERROR")
        RUNNING_COUNT=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$BACKEND_SERVICE" --query 'services[0].runningCount' --output text 2>/dev/null || echo "0")
        DESIRED_COUNT=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$BACKEND_SERVICE" --query 'services[0].desiredCount' --output text 2>/dev/null || echo "0")
        
        log "Service Status: $SERVICE_STATUS"
        log "Running Tasks: $RUNNING_COUNT/$DESIRED_COUNT"
        
        if [ "$RUNNING_COUNT" = "0" ]; then
            warning "No tasks are running! This explains the connectivity issues."
            log "Check service events: aws ecs describe-services --cluster $CLUSTER_NAME --services $BACKEND_SERVICE"
        fi
    fi
else
    warning "Could not determine deployment type"
fi

# Test connectivity if public
if [ "$DEPLOYMENT_TYPE" = "false" ] && [ "$ALB_DNS" != "NOT_FOUND" ]; then
    log ""
    log "🌐 Testing Public Connectivity..."
    
    HEALTH_URL="https://$ALB_DNS/health"
    STATUS_URL="https://$ALB_DNS/api/v1/status"
    
    log "Testing: $HEALTH_URL"
    if curl -f -s --max-time 10 "$HEALTH_URL" > /dev/null 2>&1; then
        success "✅ Health endpoint is accessible!"
    else
        warning "❌ Health endpoint is not accessible"
    fi
    
    log "Testing: $STATUS_URL"
    if curl -f -s --max-time 10 "$STATUS_URL" > /dev/null 2>&1; then
        success "✅ Status endpoint is accessible!"
    else
        warning "❌ Status endpoint is not accessible"
    fi
fi

log ""
log "📋 Quick Fix Commands:"
if [ "$DEPLOYMENT_TYPE" = "true" ]; then
    log "1. Convert to public deployment:"
    log "   ./deploy-public-access-fix.sh"
else
    log "1. Check target group health:"
    log "   aws elbv2 describe-target-health --target-group-arn \$(terraform output -raw backend_target_group_arn)"
    log ""
    log "2. Check service logs:"
    log "   aws logs tail \$(terraform output -raw backend_log_group_name) --follow"
    log ""
    log "3. Force service restart:"
    log "   aws ecs update-service --cluster $CLUSTER_NAME --service $BACKEND_SERVICE --force-new-deployment"
fi

log ""
log "🔍 Diagnosis Complete"