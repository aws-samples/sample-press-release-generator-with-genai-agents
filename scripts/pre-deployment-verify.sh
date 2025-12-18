#!/bin/bash

# Pre-Deployment Verification Script
# 100 Market Press Release Generator - Phase 2 Deployment
#
# This script verifies all prerequisites are met before starting
# the terraform destroy/redeploy cycle.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="your-aws-profile"
AWS_REGION="us-west-2"
EXPECTED_ACCOUNT="55555555555"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Logging functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((CHECKS_PASSED++))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((CHECKS_FAILED++))
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((CHECKS_WARNING++))
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check functions
check_docker() {
    print_header "Docker Verification"
    
    print_check "Checking if Docker is installed..."
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        print_pass "Docker installed: $DOCKER_VERSION"
    else
        print_fail "Docker is not installed or not in PATH"
        return 1
    fi
    
    print_check "Checking if Docker daemon is running..."
    if docker info &> /dev/null; then
        print_pass "Docker daemon is running"
    else
        print_fail "Docker daemon is not running - start Docker Desktop"
        return 1
    fi
    
    print_check "Checking Docker disk space..."
    DOCKER_SPACE=$(df -h / | awk 'NR==2 {print $4}')
    print_info "Available disk space: $DOCKER_SPACE"
    
    # Check if we have at least 10GB free
    SPACE_GB=$(df -g / | awk 'NR==2 {print $4}')
    if [ "$SPACE_GB" -lt 10 ]; then
        print_warn "Low disk space (<10GB) - Docker builds may fail"
    else
        print_pass "Sufficient disk space for Docker builds"
    fi
}

check_aws_cli() {
    print_header "AWS CLI Verification"
    
    print_check "Checking if AWS CLI is installed..."
    if command -v aws &> /dev/null; then
        AWS_VERSION=$(aws --version)
        print_pass "AWS CLI installed: $AWS_VERSION"
    else
        print_fail "AWS CLI is not installed"
        return 1
    fi
    
    print_check "Checking AWS profile configuration..."
    if AWS_PROFILE=$AWS_PROFILE aws sts get-caller-identity &> /dev/null; then
        ACCOUNT_ID=$(AWS_PROFILE=$AWS_PROFILE aws sts get-caller-identity --query 'Account' --output text)
        USER_ARN=$(AWS_PROFILE=$AWS_PROFILE aws sts get-caller-identity --query 'Arn' --output text)
        
        if [ "$ACCOUNT_ID" == "$EXPECTED_ACCOUNT" ]; then
            print_pass "AWS profile '$AWS_PROFILE' configured correctly"
            print_info "Account ID: $ACCOUNT_ID"
            print_info "User ARN: $USER_ARN"
        else
            print_fail "Wrong AWS account. Expected: $EXPECTED_ACCOUNT, Got: $ACCOUNT_ID"
            return 1
        fi
    else
        print_fail "AWS profile '$AWS_PROFILE' not configured or credentials expired"
        print_info "Run: aws configure --profile $AWS_PROFILE"
        return 1
    fi
}

check_terraform() {
    print_header "Terraform Verification"
    
    print_check "Checking if Terraform is installed..."
    if command -v terraform &> /dev/null; then
        TERRAFORM_VERSION=$(terraform version | head -n 1)
        print_pass "Terraform installed: $TERRAFORM_VERSION"
    else
        print_fail "Terraform is not installed"
        return 1
    fi
    
    print_check "Checking Terraform directory..."
    if [ -d "$PROJECT_ROOT/terraform" ]; then
        print_pass "Terraform directory exists"
    else
        print_fail "Terraform directory not found: $PROJECT_ROOT/terraform"
        return 1
    fi
    
    print_check "Checking Terraform state file..."
    if [ -f "$PROJECT_ROOT/terraform/terraform.tfstate" ]; then
        STATE_SIZE=$(ls -lh "$PROJECT_ROOT/terraform/terraform.tfstate" | awk '{print $5}')
        print_pass "Terraform state file exists ($STATE_SIZE)"
    else
        print_warn "No terraform state file found (fresh deployment or already destroyed)"
    fi
    
    print_check "Validating Terraform configuration..."
    cd "$PROJECT_ROOT/terraform"
    if terraform validate &> /dev/null; then
        print_pass "Terraform configuration is valid"
    else
        print_fail "Terraform configuration has errors"
        terraform validate
        return 1
    fi
}

check_ecr_repositories() {
    print_header "ECR Repository Verification"
    
    print_check "Checking ECR repository accessibility..."
    REPO_COUNT=$(AWS_PROFILE=$AWS_PROFILE aws ecr describe-repositories \
        --region $AWS_REGION \
        --query 'length(repositories)' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$REPO_COUNT" -gt 0 ]; then
        print_pass "Found $REPO_COUNT ECR repositories"
        
        # List repositories
        print_info "ECR Repositories:"
        AWS_PROFILE=$AWS_PROFILE aws ecr describe-repositories \
            --region $AWS_REGION \
            --query 'repositories[*].[repositoryName]' \
            --output text | while read repo; do
            print_info "  - $repo"
        done
    else
        print_fail "No ECR repositories found or cannot access ECR"
        return 1
    fi
}

check_environment_files() {
    print_header "Environment Configuration Verification"
    
    print_check "Checking .env.ia-admin file..."
    if [ -f "$PROJECT_ROOT/.env.ia-admin" ]; then
        print_pass ".env.ia-admin file exists"
        
        # Check for critical environment variables (without exposing values)
        CRITICAL_VARS=("AWS_PROFILE" "AWS_REGION" "AWS_BEDROCK_MODEL_ID" "TAVILY_API_KEY")
        for var in "${CRITICAL_VARS[@]}"; do
            if grep -q "^$var=" "$PROJECT_ROOT/.env.ia-admin"; then
                print_pass "  ✓ $var is set"
            else
                print_fail "  ✗ $var is missing"
            fi
        done
    else
        print_fail ".env.ia-admin file not found"
        print_info "This file contains required secrets for deployment"
        return 1
    fi
    
    print_check "Checking Dockerfiles..."
    if [ -f "$PROJECT_ROOT/backend/Dockerfile" ]; then
        print_pass "Backend Dockerfile exists"
    else
        print_fail "Backend Dockerfile not found"
    fi
    
    if [ -f "$PROJECT_ROOT/frontend/Dockerfile" ]; then
        print_pass "Frontend Dockerfile exists"
    else
        print_fail "Frontend Dockerfile not found"
    fi
}

check_git_status() {
    print_header "Git Repository Verification"
    
    print_check "Checking git repository status..."
    cd "$PROJECT_ROOT"
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        print_pass "Git repository initialized"
        
        # Check current branch
        CURRENT_BRANCH=$(git branch --show-current)
        print_info "Current branch: $CURRENT_BRANCH"
        
        # Check for uncommitted changes
        if git diff-index --quiet HEAD --; then
            print_pass "No uncommitted changes"
        else
            print_warn "Uncommitted changes detected - consider committing before deployment"
            git status --short | head -n 5
        fi
        
        # Check current commit
        CURRENT_COMMIT=$(git rev-parse --short HEAD)
        COMMIT_MSG=$(git log -1 --pretty=%B | head -n 1)
        print_info "Current commit: $CURRENT_COMMIT - $COMMIT_MSG"
    else
        print_warn "Not a git repository"
    fi
}

check_local_code_version() {
    print_header "Local Code Version Verification"
    
    print_check "Checking for Phase 5 indicators..."
    
    # Check for API cost tracking (Phase 5 feature)
    if grep -q "costCalculator" "$PROJECT_ROOT/backend/src/utils/costCalculator.js" 2>/dev/null; then
        print_pass "API cost tracking code present (Phase 5)"
    else
        print_warn "API cost tracking code not found - may not be Phase 5"
    fi
    
    # Check for quality improvements
    if grep -q "78%" "$PROJECT_ROOT/memory-bank/progress.md" 2>/dev/null; then
        print_pass "Quality improvements documented (Phase 5)"
    else
        print_warn "Quality improvements not documented"
    fi
    
    # Check for strands-cleanup merge
    if grep -q "strands-cleanup" "$PROJECT_ROOT/memory-bank/progress.md" 2>/dev/null; then
        print_pass "Strands-cleanup merge documented (Phase 5)"
    else
        print_warn "Strands-cleanup merge not documented"
    fi
}

check_secrets_manager() {
    print_header "AWS Secrets Manager Verification (Optional)"
    
    print_check "Checking if secrets exist in AWS Secrets Manager..."
    
    # Check for Tavily API key secret
    if AWS_PROFILE=$AWS_PROFILE aws secretsmanager describe-secret \
        --secret-id press-rele-prod-tavily-api-key \
        --region $AWS_REGION &> /dev/null; then
        print_pass "Tavily API key secret exists in Secrets Manager"
    else
        print_warn "Tavily API key secret not found in Secrets Manager"
        print_info "Secret will need to be created or configured in terraform.tfvars"
    fi
}

create_state_backup() {
    print_header "Terraform State Backup"
    
    if [ -f "$PROJECT_ROOT/terraform/terraform.tfstate" ]; then
        print_check "Creating terraform state backup..."
        BACKUP_FILE="$PROJECT_ROOT/terraform/terraform.tfstate.backup-$(date +%Y%m%d-%H%M%S)"
        cp "$PROJECT_ROOT/terraform/terraform.tfstate" "$BACKUP_FILE"
        
        if [ -f "$BACKUP_FILE" ]; then
            BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
            print_pass "State backup created: $BACKUP_FILE ($BACKUP_SIZE)"
        else
            print_fail "Failed to create state backup"
            return 1
        fi
    else
        print_info "No terraform state file to backup (fresh deployment)"
    fi
}

# Summary and recommendations
print_summary() {
    print_header "Pre-Deployment Verification Summary"
    
    echo -e "Checks Passed:  ${GREEN}$CHECKS_PASSED${NC}"
    echo -e "Checks Failed:  ${RED}$CHECKS_FAILED${NC}"
    echo -e "Warnings:       ${YELLOW}$CHECKS_WARNING${NC}"
    echo ""
    
    if [ $CHECKS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ ALL CRITICAL CHECKS PASSED${NC}"
        echo ""
        echo "System is ready for deployment!"
        echo ""
        echo "Next Steps:"
        echo "1. Review deployment execution plan: docs/deployment/cloud-redeployment-execution-plan.md"
        echo "2. Execute Phase 2A (Destroy): cd scripts && ./aws-infrastructure-destroy.sh"
        echo "3. Execute Phase 2B (Rebuild): cd scripts && ./build-and-push-images.sh"
        echo "4. Execute Phase 2C (Validation): Follow validation checklist in execution plan"
        echo ""
        
        if [ $CHECKS_WARNING -gt 0 ]; then
            echo -e "${YELLOW}⚠️  $CHECKS_WARNING warnings detected - review before proceeding${NC}"
            echo ""
        fi
        
        return 0
    else
        echo -e "${RED}❌ $CHECKS_FAILED CRITICAL CHECKS FAILED${NC}"
        echo ""
        echo "System is NOT ready for deployment!"
        echo ""
        echo "Required Actions:"
        echo "1. Fix all failed checks listed above"
        echo "2. Re-run this script to verify fixes"
        echo "3. Do not proceed with deployment until all checks pass"
        echo ""
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   Pre-Deployment Verification Script                      ║"
    echo "║   100 Market Press Release Generator                      ║"
    echo "║   Phase 2: Terraform Destroy/Redeploy Cycle              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    print_info "AWS Profile: $AWS_PROFILE"
    print_info "AWS Region: $AWS_REGION"
    print_info "Expected Account: $EXPECTED_ACCOUNT"
    print_info "Project Root: $PROJECT_ROOT"
    echo ""
    
    # Run all checks
    check_docker || true
    check_aws_cli || true
    check_terraform || true
    check_ecr_repositories || true
    check_environment_files || true
    check_git_status || true
    check_local_code_version || true
    check_secrets_manager || true
    create_state_backup || true
    
    # Print summary and exit with appropriate code
    print_summary
    exit $?
}

# Run main function
main "$@"