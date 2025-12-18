#!/bin/bash

# Deploy Press Release Generator with Authentication and Redis Mode Selection
# Supports Cognito authentication (default enabled for production)

set -e

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/terraform"

# Default values
REDIS_MODE="embedded"
ENVIRONMENT="prod"
AWS_REGION="us-west-2"
DEPLOYMENT_TYPE="internal"
ENABLE_STRANDS=false
STRANDS_ORCHESTRATION_PATTERN="adaptive_hybrid"
STRANDS_PERFORMANCE_MODE="balanced"
STRANDS_VALIDATION=true
STRANDS_E2E_TESTS=false
STRANDS_MONITORING=true
SKIP_BUILD=false
SKIP_PUSH=false
SKIP_DEPLOY=false
FORCE_BUILD=false
DRY_RUN=false
VERBOSE=false

# Authentication defaults
ENABLE_AUTH=true  # ENABLED by default for production
AUTH_MODE="cognito"
ENABLE_MFA=false
DISABLE_AUTH_CONFIRMED=false
COGNITO_DOMAIN_PREFIX=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
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

log_auth() {
    echo -e "${MAGENTA}[AUTH]${NC} $1"
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Press Release Generator with authentication and Redis mode selection.

AUTHENTICATION OPTIONS:
    --enable-auth              Enable authentication (default for production)
    --disable-auth             Disable authentication (requires --confirm-no-auth)
    --confirm-no-auth          Confirm deployment without authentication
    --auth-mode MODE           Authentication mode: cognito, api-key, jwt, oauth, hybrid, none (default: cognito)
    --enable-mfa               Enable Multi-Factor Authentication for Cognito
    --cognito-domain PREFIX    Custom Cognito domain prefix (auto-generated if not specified)

REDIS OPTIONS:
    -m, --redis-mode MODE      Redis mode: 'none', 'embedded', 'elasticache' (default: embedded)

DEPLOYMENT OPTIONS:
    -e, --environment ENV      Environment: dev, staging, prod (default: prod)
    -r, --region REGION        AWS region (default: us-west-2)
    --public                   Deploy with public internet access via CloudFront
    --internal                 Deploy with internal VPC-only access (default)

STRANDS FRAMEWORK OPTIONS:
    --enable-strands           Enable Strands framework integration
    --strands-pattern PATTERN  Orchestration pattern: conditional, swarm, nested, adaptive_hybrid, parallel_hybrid, sequential_hybrid
    --strands-performance MODE Performance mode: fast, balanced, quality, comprehensive
    --strands-validation       Enable Strands deployment validation (default: enabled)
    --skip-strands-validation  Skip Strands deployment validation
    --strands-e2e-tests        Run Strands end-to-end tests
    --strands-monitoring       Enable Strands monitoring setup (default: enabled)
    --skip-strands-monitoring  Skip Strands monitoring setup

OTHER OPTIONS:
    --skip-build               Skip Docker image building
    --skip-push                Skip Docker image pushing to ECR
    --skip-deploy              Skip Terraform deployment
    --force-build              Force Docker image rebuild
    --dry-run                  Show what would be deployed without executing
    -v, --verbose              Enable verbose output
    -h, --help                 Show this help message

AUTHENTICATION MODES:
    cognito     AWS Cognito User Pools with ALB authentication (default)
                - Managed service, no code changes required
                - MFA support, social login integration
                - Cost: ~\$55/month for 10K users

    api-key     API Key authentication with AWS Secrets Manager
                - Simple implementation, granular permissions
                - Cost: ~\$10/month

    jwt         JWT tokens with Amazon Verified Permissions
                - Stateless, fine-grained authorization
                - Cost: ~\$75/month for 100K requests

    oauth       OAuth 2.0 with multiple identity providers
                - Okta, Auth0, Google, Microsoft support
                - Cost: ~\$200-500/month

    hybrid      IAM for internal + Cognito for public
                - Best of both worlds
                - Cost: ~\$55/month

    none        No authentication (requires explicit confirmation)
                - NOT RECOMMENDED for production

REDIS MODES:
    none        No Redis - \$0/month additional cost
    embedded    Redis in container - \$3-6/month additional (default)
    elasticache AWS ElastiCache - \$18-38/month additional

EXAMPLES:
    # Deploy with default settings (auth enabled, embedded Redis, internal)
    $0

    # Deploy to production with authentication (default behavior)
    $0 --environment prod --public

    # Deploy with MFA enabled
    $0 --environment prod --public --enable-mfa

    # Deploy with custom Cognito domain
    $0 --environment prod --public --cognito-domain my-company-auth

    # Deploy with API key authentication instead of Cognito
    $0 --environment prod --public --auth-mode api-key

    # Deploy to development WITHOUT authentication (requires confirmation)
    $0 --environment dev --disable-auth --confirm-no-auth

    # Deploy with Strands framework and authentication
    $0 --environment prod --public --enable-strands --enable-auth

    # Deploy with ElastiCache and authentication
    $0 --redis-mode elasticache --public --enable-auth

    # Dry run to see what would be deployed
    $0 --environment prod --public --enable-auth --dry-run

SECURITY NOTES:
    • Authentication is ENABLED by default for production deployments
    • Disabling authentication requires explicit --disable-auth --confirm-no-auth flags
    • Production deployments without auth require manual risk acknowledgment
    • Internal deployments can optionally disable auth with confirmation

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        # Authentication flags
        --enable-auth)
            ENABLE_AUTH=true
            shift
            ;;
        --disable-auth)
            ENABLE_AUTH=false
            shift
            ;;
        --confirm-no-auth)
            DISABLE_AUTH_CONFIRMED=true
            shift
            ;;
        --auth-mode)
            AUTH_MODE="$2"
            shift 2
            ;;
        --enable-mfa)
            ENABLE_MFA=true
            shift
            ;;
        --cognito-domain)
            COGNITO_DOMAIN_PREFIX="$2"
            shift 2
            ;;
        # Redis flags
        -m|--redis-mode)
            REDIS_MODE="$2"
            shift 2
            ;;
        # Deployment flags
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        --public)
            DEPLOYMENT_TYPE="public"
            shift
            ;;
        --internal)
            DEPLOYMENT_TYPE="internal"
            shift
            ;;
        # Strands flags
        --enable-strands)
            ENABLE_STRANDS=true
            shift
            ;;
        --strands-pattern)
            STRANDS_ORCHESTRATION_PATTERN="$2"
            shift 2
            ;;
        --strands-performance)
            STRANDS_PERFORMANCE_MODE="$2"
            shift 2
            ;;
        --strands-validation)
            STRANDS_VALIDATION=true
            shift
            ;;
        --skip-strands-validation)
            STRANDS_VALIDATION=false
            shift
            ;;
        --strands-e2e-tests)
            STRANDS_E2E_TESTS=true
            shift
            ;;
        --strands-monitoring)
            STRANDS_MONITORING=true
            shift
            ;;
        --skip-strands-monitoring)
            STRANDS_MONITORING=false
            shift
            ;;
        # Other flags
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-push)
            SKIP_PUSH=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --force-build)
            FORCE_BUILD=true
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
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate authentication mode
if [[ ! "$AUTH_MODE" =~ ^(cognito|api-key|jwt|oauth|hybrid|none)$ ]]; then
    log_error "Invalid auth mode: $AUTH_MODE. Must be 'cognito', 'api-key', 'jwt', 'oauth', 'hybrid', or 'none'"
    exit 1
fi

# Validate Redis mode
if [[ ! "$REDIS_MODE" =~ ^(none|embedded|elasticache)$ ]]; then
    log_error "Invalid Redis mode: $REDIS_MODE. Must be 'none', 'embedded', or 'elasticache'"
    exit 1
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Must be 'dev', 'staging', or 'prod'"
    exit 1
fi

# Validate Strands orchestration pattern
if [[ "$ENABLE_STRANDS" == "true" ]] && [[ ! "$STRANDS_ORCHESTRATION_PATTERN" =~ ^(conditional|swarm|nested|adaptive_hybrid|parallel_hybrid|sequential_hybrid)$ ]]; then
    log_error "Invalid Strands orchestration pattern: $STRANDS_ORCHESTRATION_PATTERN"
    exit 1
fi

# Validate Strands performance mode
if [[ "$ENABLE_STRANDS" == "true" ]] && [[ ! "$STRANDS_PERFORMANCE_MODE" =~ ^(fast|balanced|quality|comprehensive)$ ]]; then
    log_error "Invalid Strands performance mode: $STRANDS_PERFORMANCE_MODE"
    exit 1
fi

# Enable verbose output if requested
if [[ "$VERBOSE" == "true" ]]; then
    set -x
fi

# ============================================================================
# CRITICAL SECURITY CHECK: Authentication Validation
# ============================================================================

log_auth "=== Authentication Security Check ==="

# Check if authentication is disabled
if [[ "$ENABLE_AUTH" == "false" ]]; then
    log_warning "⚠️  Authentication is DISABLED"
    
    # For production deployments, require explicit confirmation
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        if [[ "$DISABLE_AUTH_CONFIRMED" != "true" ]]; then
            log_error "❌ ERROR: Cannot deploy to production without authentication"
            log_error "   Authentication is REQUIRED for public-facing deployments"
            log_error "   If you really want to disable auth, use: --disable-auth --confirm-no-auth"
            exit 1
        fi
        
        log_warning "⚠️  WARNING: Deploying to PRODUCTION without authentication"
        log_warning "   This is NOT recommended for public-facing deployments"
        log_warning "   Security risks:"
        log_warning "   • Unauthorized access to API endpoints"
        log_warning "   • No user tracking or audit trail"
        log_warning "   • Potential abuse and resource exhaustion"
        log_warning "   • Compliance violations (SOC2, HIPAA, etc.)"
        echo ""
        read -p "   Type 'I UNDERSTAND THE RISKS' to continue: " confirmation
        
        if [[ "$confirmation" != "I UNDERSTAND THE RISKS" ]]; then
            log_error "❌ Deployment cancelled for security reasons"
            exit 1
        fi
        
        log_warning "⚠️  Proceeding with UNAUTHENTICATED production deployment"
    else
        # For non-production, still require confirmation
        if [[ "$DISABLE_AUTH_CONFIRMED" != "true" ]]; then
            log_warning "⚠️  Authentication disabled for $ENVIRONMENT environment"
            log_warning "   Use --confirm-no-auth to proceed"
            exit 1
        fi
        log_warning "⚠️  Deploying $ENVIRONMENT environment without authentication"
    fi
else
    log_auth "✅ Authentication ENABLED"
    log_auth "   Mode: $AUTH_MODE"
    log_auth "   MFA: $ENABLE_MFA"
    if [[ -n "$COGNITO_DOMAIN_PREFIX" ]]; then
        log_auth "   Cognito Domain: $COGNITO_DOMAIN_PREFIX"
    fi
fi

echo ""

# Display deployment configuration
log_info "=== Deployment Configuration ==="
log_info "Environment: $ENVIRONMENT"
log_info "AWS Region: $AWS_REGION"
log_info "Deployment Type: $DEPLOYMENT_TYPE"
log_info "Authentication: $ENABLE_AUTH (Mode: $AUTH_MODE)"
log_info "Redis Mode: $REDIS_MODE"
log_info "Strands Framework: $ENABLE_STRANDS"
if [[ "$ENABLE_STRANDS" == "true" ]]; then
    log_info "Strands Orchestration Pattern: $STRANDS_ORCHESTRATION_PATTERN"
    log_info "Strands Performance Mode: $STRANDS_PERFORMANCE_MODE"
    log_info "Strands Validation: $STRANDS_VALIDATION"
    log_info "Strands E2E Tests: $STRANDS_E2E_TESTS"
    log_info "Strands Monitoring: $STRANDS_MONITORING"
fi
log_info "Dry Run: $DRY_RUN"
echo ""

# Estimate costs
case $REDIS_MODE in
    "none")
        REDIS_COST="$0/month"
        ;;
    "embedded")
        REDIS_COST="$3-6/month"
        ;;
    "elasticache")
        REDIS_COST="$18-38/month"
        ;;
esac

case $AUTH_MODE in
    "cognito")
        AUTH_COST="$0-55/month (free tier: 50K MAUs)"
        ;;
    "api-key")
        AUTH_COST="$10/month"
        ;;
    "jwt")
        AUTH_COST="$75/month (100K requests)"
        ;;
    "oauth")
        AUTH_COST="$200-500/month"
        ;;
    "hybrid")
        AUTH_COST="$55/month"
        ;;
    "none")
        AUTH_COST="$0/month"
        ;;
esac

log_info "=== Cost Estimates ==="
log_info "Redis: $REDIS_COST"
if [[ "$ENABLE_AUTH" == "true" ]]; then
    log_info "Authentication: $AUTH_COST"
fi
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install it first."
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    log_error "Terraform is not installed. Please install it first."
    exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

log_success "Prerequisites check passed"
echo ""

# Create terraform.tfvars based on configuration
log_info "Creating terraform.tfvars..."

# Select template based on Strands enablement
if [[ "$ENABLE_STRANDS" == "true" ]]; then
    TFVARS_TEMPLATE="$TERRAFORM_DIR/terraform.tfvars.strands.example"
    log_info "Using Strands Phase 4 template"
else
    case $REDIS_MODE in
        "embedded")
            TFVARS_TEMPLATE="$TERRAFORM_DIR/terraform.tfvars.embedded-redis.example"
            ;;
        "elasticache")
            TFVARS_TEMPLATE="$TERRAFORM_DIR/terraform.tfvars.elasticache.example"
            ;;
        "none")
            TFVARS_TEMPLATE="$TERRAFORM_DIR/terraform.tfvars.no-redis.example"
            ;;
    esac
fi

TFVARS_FILE="$TERRAFORM_DIR/terraform.tfvars"

if [[ ! -f "$TFVARS_TEMPLATE" ]]; then
    log_error "Template file not found: $TFVARS_TEMPLATE"
    exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY RUN] Would copy $TFVARS_TEMPLATE to $TFVARS_FILE"
    log_info "[DRY RUN] Would configure authentication: $ENABLE_AUTH (mode: $AUTH_MODE)"
else
    cp "$TFVARS_TEMPLATE" "$TFVARS_FILE"
    
    # Update deployment_type
    if [[ "$DEPLOYMENT_TYPE" == "internal" ]]; then
        sed -i.bak 's/deployment_type = "public"/deployment_type = "internal"/' "$TFVARS_FILE"
        sed -i.bak 's/enable_cloudfront = true/enable_cloudfront = false/' "$TFVARS_FILE"
    fi
    
    # Add or update authentication configuration
    if ! grep -q "enable_authentication" "$TFVARS_FILE"; then
        echo "" >> "$TFVARS_FILE"
        echo "# Authentication Configuration" >> "$TFVARS_FILE"
        echo "enable_authentication = $ENABLE_AUTH" >> "$TFVARS_FILE"
        echo "auth_mode = \"$AUTH_MODE\"" >> "$TFVARS_FILE"
        echo "enable_mfa = $ENABLE_MFA" >> "$TFVARS_FILE"
        if [[ -n "$COGNITO_DOMAIN_PREFIX" ]]; then
            echo "cognito_domain_prefix = \"$COGNITO_DOMAIN_PREFIX\"" >> "$TFVARS_FILE"
        fi
    else
        sed -i.bak "s/enable_authentication = .*/enable_authentication = $ENABLE_AUTH/" "$TFVARS_FILE"
        sed -i.bak "s/auth_mode = \".*\"/auth_mode = \"$AUTH_MODE\"/" "$TFVARS_FILE"
        sed -i.bak "s/enable_mfa = .*/enable_mfa = $ENABLE_MFA/" "$TFVARS_FILE"
        if [[ -n "$COGNITO_DOMAIN_PREFIX" ]]; then
            if grep -q "cognito_domain_prefix" "$TFVARS_FILE"; then
                sed -i.bak "s/cognito_domain_prefix = \".*\"/cognito_domain_prefix = \"$COGNITO_DOMAIN_PREFIX\"/" "$TFVARS_FILE"
            else
                echo "cognito_domain_prefix = \"$COGNITO_DOMAIN_PREFIX\"" >> "$TFVARS_FILE"
            fi
        fi
    fi
    
    # Update Strands configuration if enabled
    if [[ "$ENABLE_STRANDS" == "true" ]]; then
        # Clear placeholder domain name
        sed -i.bak 's/domain_name = "your-domain.com"/domain_name = ""/' "$TFVARS_FILE"
        sed -i.bak 's/frontend_url = "https:\/\/your-domain.com"/frontend_url = ""/' "$TFVARS_FILE"
        
        # Override command-line parameters
        sed -i.bak "s/redis_mode[[:space:]]*=[[:space:]]*\".*\"/redis_mode = \"$REDIS_MODE\"/" "$TFVARS_FILE"
        sed -i.bak "s/deployment_type[[:space:]]*=[[:space:]]*\".*\"/deployment_type = \"$DEPLOYMENT_TYPE\"/" "$TFVARS_FILE"
        sed -i.bak "s/environment[[:space:]]*=[[:space:]]*\".*\"/environment = \"$ENVIRONMENT\"/" "$TFVARS_FILE"
        sed -i.bak "s/aws_region[[:space:]]*=[[:space:]]*\".*\"/aws_region = \"$AWS_REGION\"/" "$TFVARS_FILE"
        
        # Add Strands configuration if not present (complete configuration from deploy-terraform.sh)
        if ! grep -q "enable_strands" "$TFVARS_FILE"; then
            echo "" >> "$TFVARS_FILE"
            echo "# Strands Framework Phase 4 Configuration" >> "$TFVARS_FILE"
            echo "enable_strands = true" >> "$TFVARS_FILE"
            echo "" >> "$TFVARS_FILE"
            echo "# Strands Runtime Configuration" >> "$TFVARS_FILE"
            echo "strands_orchestration_pattern = \"$STRANDS_ORCHESTRATION_PATTERN\"" >> "$TFVARS_FILE"
            echo "strands_performance_mode = \"$STRANDS_PERFORMANCE_MODE\"" >> "$TFVARS_FILE"
            echo "strands_log_level = \"info\"" >> "$TFVARS_FILE"
            echo "strands_node_timeout = 120000" >> "$TFVARS_FILE"
            echo "strands_graph_timeout = 600000" >> "$TFVARS_FILE"
            echo "strands_max_node_executions = 50" >> "$TFVARS_FILE"
            echo "strands_python_version = \"3.11\"" >> "$TFVARS_FILE"
            echo "" >> "$TFVARS_FILE"
            echo "# Strands Feature Flags" >> "$TFVARS_FILE"
            echo "strands_enable_hybrid_orchestration = true" >> "$TFVARS_FILE"
            echo "strands_enable_performance_optimizer = true" >> "$TFVARS_FILE"
            echo "strands_enable_enterprise_security = true" >> "$TFVARS_FILE"
        else
            sed -i.bak 's/enable_strands = false/enable_strands = true/' "$TFVARS_FILE"
            # Update orchestration pattern and performance mode
            if grep -q "strands_orchestration_pattern" "$TFVARS_FILE"; then
                sed -i.bak "s/strands_orchestration_pattern = \".*\"/strands_orchestration_pattern = \"$STRANDS_ORCHESTRATION_PATTERN\"/" "$TFVARS_FILE"
            else
                echo "" >> "$TFVARS_FILE"
                echo "strands_orchestration_pattern = \"$STRANDS_ORCHESTRATION_PATTERN\"" >> "$TFVARS_FILE"
            fi
            if grep -q "strands_performance_mode" "$TFVARS_FILE"; then
                sed -i.bak "s/strands_performance_mode = \".*\"/strands_performance_mode = \"$STRANDS_PERFORMANCE_MODE\"/" "$TFVARS_FILE"
            else
                echo "strands_performance_mode = \"$STRANDS_PERFORMANCE_MODE\"" >> "$TFVARS_FILE"
            fi
        fi
    fi
    
        else
        fi
    fi
    
    # Clean up backup files
    rm -f "$TFVARS_FILE.bak"
    
    log_success "Created terraform.tfvars with authentication=$ENABLE_AUTH, mode=$AUTH_MODE"
fi

# Deploy infrastructure (if not skipped)
if [[ "$SKIP_DEPLOY" == "false" ]]; then
    log_info "Deploying infrastructure with Terraform..."
    
    cd "$TERRAFORM_DIR"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute Terraform commands with:"
        echo "  • enable_authentication=$ENABLE_AUTH"
        echo "  • auth_mode=$AUTH_MODE"
        echo "  • redis_mode=$REDIS_MODE"
        echo "  • deployment_type=$DEPLOYMENT_TYPE"
    else
        # Initialize Terraform
        log_info "Initializing Terraform..."
        terraform init
        
        # Plan deployment
        log_info "Planning Terraform deployment..."
        terraform plan \
            -var="enable_authentication=$ENABLE_AUTH" \
            -var="auth_mode=$AUTH_MODE" \
            -var="enable_mfa=$ENABLE_MFA" \
            -var="redis_mode=$REDIS_MODE" \
            -var="deployment_type=$DEPLOYMENT_TYPE" \
            -var="enable_cloudfront=$([ "$DEPLOYMENT_TYPE" == "public" ] && [ "$ENVIRONMENT" == "prod" ] && echo "true" || echo "false")" \
            -out=tfplan
        
        # Apply deployment
        log_info "Applying Terraform deployment..."
        terraform apply tfplan
        
        # Clean up plan file
        rm -f tfplan
        
        log_success "Terraform infrastructure deployment completed"
    fi
else
    log_info "Skipping Terraform deployment (--skip-deploy specified)"
fi

# Build and push Docker images (if not skipped)
if [[ "$SKIP_BUILD" == "false" ]]; then
    log_info "Building and pushing Docker images to ECR..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: $PROJECT_ROOT/scripts/build-and-push-images.sh"
    else
        if [[ -f "$PROJECT_ROOT/scripts/build-and-push-images.sh" ]]; then
            bash "$PROJECT_ROOT/scripts/build-and-push-images.sh"
            log_success "Docker images built and pushed to ECR"
        else
            log_warning "build-and-push-images.sh not found, skipping image build"
        fi
    fi
else
    log_info "Skipping Docker image build (--skip-build specified)"
fi

# Display deployment information
if [[ "$DRY_RUN" == "false" && "$SKIP_DEPLOY" == "false" ]]; then
    log_info "=== Deployment Information ==="
    
    cd "$TERRAFORM_DIR"
    
    # Get outputs
    APPLICATION_URL=$(terraform output -raw application_url 2>/dev/null || echo "Not available")
    API_URL=$(terraform output -raw api_url 2>/dev/null || echo "Not available")
    PRIMARY_URL=$(terraform output -raw primary_url 2>/dev/null || echo "Not available")
    CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_distribution_domain_name 2>/dev/null || echo "")
    
    # Get authentication outputs
    if [[ "$ENABLE_AUTH" == "true" && "$AUTH_MODE" == "cognito" ]]; then
        COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
        COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")
        COGNITO_LOGIN_URL=$(terraform output -raw cognito_login_url 2>/dev/null || echo "")
        COGNITO_WEB_CLIENT_ID=$(terraform output -raw cognito_web_client_id 2>/dev/null || echo "")
    fi
    
    if [[ "$DEPLOYMENT_TYPE" == "public" && -n "$CLOUDFRONT_DOMAIN" ]]; then
        echo "🌐 PRIMARY URL (CloudFront): https://$CLOUDFRONT_DOMAIN"
        echo "🔗 Direct ALB URL: $APPLICATION_URL"
        echo "🔗 API URL: $API_URL"
    else
        echo "🔗 Application URL: $APPLICATION_URL"
        echo "🔗 API URL: $API_URL"
    fi
    
    echo "📦 Deployment Type: $DEPLOYMENT_TYPE"
    echo "🔧 Redis Mode: $REDIS_MODE"
    
    # Display authentication information
    if [[ "$ENABLE_AUTH" == "true" ]]; then
        echo ""
        log_auth "=== Authentication Configuration ==="
        echo "🔐 Authentication: ENABLED"
        echo "🔑 Mode: $AUTH_MODE"
        
        if [[ "$AUTH_MODE" == "cognito" && -n "$COGNITO_USER_POOL_ID" ]]; then
            echo "👤 Cognito User Pool ID: $COGNITO_USER_POOL_ID"
            echo "🌐 Cognito Domain: $COGNITO_DOMAIN"
            echo "🔗 Login URL: $COGNITO_LOGIN_URL"
            echo "📱 Web Client ID: $COGNITO_WEB_CLIENT_ID"
            echo "🔒 MFA: $ENABLE_MFA"
            echo ""
            log_auth "To create your first user:"
            echo "  aws cognito-idp admin-create-user \\"
            echo "    --user-pool-id $COGNITO_USER_POOL_ID \\"
            echo "    --username admin@example.com \\"
            echo "    --user-attributes Name=email,Value=admin@example.com Name=name,Value=\"Admin User\" \\"
            echo "    --temporary-password 'TempPass123!' \\"
            echo "    --message-action SUPPRESS"
        fi
    else
        echo ""
        log_warning "⚠️  Authentication: DISABLED"
        log_warning "   Application is accessible without authentication"
    fi
    
    echo ""
    log_success "Deployment completed successfully!"
    
    # Display next steps
    log_info "=== Next Steps ==="
    
    if [[ "$ENABLE_AUTH" == "true" && "$AUTH_MODE" == "cognito" ]]; then
        echo "1. Create your first user (see command above)"
        echo ""
        echo "2. Access the application:"
        if [[ "$DEPLOYMENT_TYPE" == "public" && -n "$CLOUDFRONT_DOMAIN" ]]; then
            echo "   https://$CLOUDFRONT_DOMAIN"
        else
            echo "   $APPLICATION_URL"
        fi
        echo "   (You will be redirected to Cognito login)"
        echo ""
        echo "3. Test API with authentication:"
        echo "   # First, get an access token by logging in via browser"
        echo "   # Then use the token in API requests:"
        echo "   curl -H \"Authorization: Bearer <YOUR_TOKEN>\" $API_URL/status"
    else
        echo "1. Test the deployment:"
        echo "   curl $APPLICATION_URL/health"
        echo "   curl $API_URL/status"
    fi
    
    echo ""
    echo "2. Monitor the deployment:"
    echo "   aws ecs describe-services --cluster ${PROJECT_NAME}-${ENVIRONMENT}-cluster --services ${PROJECT_NAME}-${ENVIRONMENT}-backend ${PROJECT_NAME}-${ENVIRONMENT}-frontend"
    echo ""
    echo "3. View logs:"
    echo "   aws logs tail /ecs/${PROJECT_NAME}-${ENVIRONMENT}-backend --follow"
    
    # Display Strands-specific information
    if [[ "$ENABLE_STRANDS" == "true" ]]; then
        echo ""
        log_info "=== Strands Framework Endpoints ==="
        echo "🔗 Strands API Endpoints:"
        echo "   • Health: $API_URL/strands/health"
        echo "   • Status: $API_URL/strands/status"
        echo "   • Patterns: $API_URL/strands/patterns"
        echo "   • Generate: $API_URL/strands/generate-strands"
        
        if [[ "$ENABLE_AUTH" == "true" ]]; then
            echo ""
            log_auth "Note: All Strands endpoints require authentication"
        fi
    fi
    
elif [[ "$DRY_RUN" == "true" ]]; then
    log_info "=== Dry Run Summary ==="
    echo "Would deploy with:"
    echo "  • Authentication: $ENABLE_AUTH (mode: $AUTH_MODE)"
    echo "  • Redis Mode: $REDIS_MODE"
    echo "  • Deployment Type: $DEPLOYMENT_TYPE"
    echo "  • Strands Framework: $ENABLE_STRANDS"
    if [[ "$ENABLE_STRANDS" == "true" ]]; then
        echo "  • Strands Pattern: $STRANDS_ORCHESTRATION_PATTERN"
        echo "  • Strands Performance: $STRANDS_PERFORMANCE_MODE"
    fi
fi

echo ""
log_info "Deployment script completed"