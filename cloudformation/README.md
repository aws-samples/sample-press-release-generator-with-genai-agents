# CloudFormation Deployment Guide

This directory contains AWS CloudFormation templates for deploying the Press Release Generator application with comprehensive CORS support.

## Architecture Overview

The CloudFormation deployment creates a production-ready, scalable infrastructure using:

- **ECS Fargate**: Containerized application deployment
- **Application Load Balancer**: Traffic distribution with CORS headers
- **VPC**: Isolated network environment with public/private subnets
- **Auto Scaling**: Automatic scaling based on CPU utilization
- **CloudWatch**: Comprehensive monitoring and logging
- **IAM**: Least-privilege security roles and policies
- **Secrets Manager**: Secure API key management

## Templates

### 1. main-infrastructure.yaml
Core infrastructure components:
- VPC with public and private subnets across 2 AZs
- Internet Gateway and NAT Gateways
- Application Load Balancer with CORS-enabled target groups
- Security Groups with proper ingress/egress rules
- CloudWatch Log Groups
- IAM roles and policies

### 2. ecs-services.yaml
Application services:
- ECS Cluster with Fargate capacity providers
- Backend and Frontend ECS Services
- Task Definitions with environment variables
- Auto Scaling configurations
- Service discovery and load balancer integration

## CORS Configuration

The deployment includes comprehensive CORS support:

### Backend CORS Features
- **Pattern-based Origin Matching**: Supports CloudFront and ELB domains
- **Dynamic Origin Detection**: Automatically allows ALB and CloudFront URLs
- **Configurable Origins**: Custom CORS origins via parameters
- **Credentials Support**: Enables cookies and authentication headers
- **Preflight Handling**: Proper OPTIONS request handling

### Frontend Configuration
- **Dynamic API Detection**: Automatically detects backend endpoints
- **Environment Injection**: Runtime configuration via environment variables
- **Fallback Support**: Multiple endpoint detection strategies
- **CORS Mode**: Configurable CORS handling

### Load Balancer CORS
- **Response Headers**: Automatic CORS header injection
- **Origin Validation**: Pattern-based origin validation
- **Method Support**: All HTTP methods with proper preflight
- **Header Allowlist**: Comprehensive allowed headers

## Deployment Options

### Quick Deploy
```bash
# Deploy to production with defaults
./scripts/deploy-cloudformation.sh deploy

# Deploy to staging
./scripts/deploy-cloudformation.sh -e staging deploy
```

### Custom Configuration
```bash
# Deploy with custom CORS settings
./scripts/deploy-cloudformation.sh \
  --frontend-url https://myapp.example.com \
  --cors-origins "https://myapp.example.com,https://admin.example.com" \
  deploy
```

### With API Secrets
```bash
# Deploy with API key secrets
./scripts/deploy-cloudformation.sh \
  --firecrawl-secret arn:aws:secretsmanager:us-west-2:123456789012:secret:firecrawl-api-key \
  --perplexity-secret arn:aws:secretsmanager:us-west-2:123456789012:secret:perplexity-api-key \
  deploy
```

## Parameters

### Infrastructure Parameters
- **ProjectName**: Project identifier (default: press-release-generator)
- **Environment**: Deployment environment (dev/staging/prod)
- **VpcCidr**: VPC CIDR block (default: 10.0.0.0/16)
- **FrontendUrl**: Custom frontend URL for CORS
- **CorsAllowedOrigins**: Comma-separated CORS origins
- **CorsDomainPattern**: Regex pattern for allowed domains

### Service Parameters
- **BackendImage**: Backend Docker image URI
- **FrontendImage**: Frontend Docker image URI
- **BackendCpu/Memory**: Resource allocation for backend
- **FrontendCpu/Memory**: Resource allocation for frontend
- **BackendDesiredCount**: Number of backend tasks
- **FrontendDesiredCount**: Number of frontend tasks

### Security Parameters
- **FirecrawlApiKeySecretArn**: Firecrawl API key secret ARN
- **PerplexityApiKeySecretArn**: Perplexity API key secret ARN
- **BedrockModelId**: AWS Bedrock model identifier

## Prerequisites

### AWS CLI Configuration
```bash
# Configure AWS CLI
aws configure

# Or use environment variables
export AWS_PROFILE=your-profile
export AWS_REGION=us-west-2
```

### Docker Setup
```bash
# Ensure Docker is running
docker info

# Login to ECR (handled automatically by script)
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-west-2.amazonaws.com
```

### API Secrets (Optional)
Create secrets in AWS Secrets Manager:
```bash
# Firecrawl API key
aws secretsmanager create-secret \
  --name "press-release-generator/firecrawl-api-key" \
  --secret-string "your-firecrawl-api-key"

# Perplexity API key
aws secretsmanager create-secret \
  --name "press-release-generator/perplexity-api-key" \
  --secret-string "your-perplexity-api-key"
```

## Deployment Commands

### Deploy Infrastructure
```bash
# Full deployment
./scripts/deploy-cloudformation.sh deploy

# Validate templates only
./scripts/deploy-cloudformation.sh validate

# Check deployment status
./scripts/deploy-cloudformation.sh status

# Update existing deployment
./scripts/deploy-cloudformation.sh update
```

### Environment-Specific Deployments
```bash
# Development environment
./scripts/deploy-cloudformation.sh -e dev deploy

# Staging environment
./scripts/deploy-cloudformation.sh -e staging deploy

# Production environment (default)
./scripts/deploy-cloudformation.sh -e prod deploy
```

### Advanced Options
```bash
# Dry run (show what would be deployed)
./scripts/deploy-cloudformation.sh --dry-run deploy

# Skip Docker image build
./scripts/deploy-cloudformation.sh --skip-build deploy

# Verbose output
./scripts/deploy-cloudformation.sh --verbose deploy

# Custom region
./scripts/deploy-cloudformation.sh --region us-east-1 deploy
```

## Monitoring and Troubleshooting

### CloudWatch Logs
- Backend logs: `/ecs/press-release-generator-prod-backend`
- Frontend logs: `/ecs/press-release-generator-prod-frontend`

### Health Checks
- Backend health: `https://your-alb-url/health`
- Frontend health: `https://your-alb-url/health` (frontend)

### Common Issues

#### CORS Errors
1. **Symptoms**: Browser console shows CORS errors
2. **Solutions**:
   - Verify `CorsAllowedOrigins` parameter includes your domain
   - Check `CorsDomainPattern` regex matches your domain
   - Ensure frontend URL is correctly configured

#### Service Startup Issues
1. **Symptoms**: ECS tasks fail to start
2. **Solutions**:
   - Check CloudWatch logs for container errors
   - Verify Docker images are accessible in ECR
   - Check IAM permissions for task execution role

#### Load Balancer Issues
1. **Symptoms**: 502/503 errors from ALB
2. **Solutions**:
   - Verify target group health checks
   - Check security group rules
   - Ensure services are running in correct subnets

### Debugging Commands
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name press-release-generator-prod-infrastructure

# View stack events
aws cloudformation describe-stack-events --stack-name press-release-generator-prod-infrastructure

# Check ECS service status
aws ecs describe-services --cluster press-release-generator-prod-cluster --services press-release-generator-prod-backend

# View container logs
aws logs tail /ecs/press-release-generator-prod-backend --follow
```

## Cleanup

### Destroy Infrastructure
```bash
# Destroy all resources (CAUTION: This is irreversible)
./scripts/deploy-cloudformation.sh destroy

# Dry run destruction
./scripts/deploy-cloudformation.sh --dry-run destroy
```

### Manual Cleanup
If automated cleanup fails:
1. Delete ECS services first
2. Delete load balancer target groups
3. Delete the CloudFormation stacks
4. Clean up any remaining resources manually

## Security Considerations

### Network Security
- Private subnets for application containers
- Security groups with minimal required access
- NAT Gateways for outbound internet access only

### Application Security
- Secrets stored in AWS Secrets Manager
- IAM roles with least-privilege access
- Container images scanned for vulnerabilities

### CORS Security
- Origin validation using regex patterns
- Configurable allowed origins
- Proper preflight request handling
- Credential support only for trusted origins

## Cost Optimization

### Resource Sizing
- Start with minimal CPU/memory allocations
- Use auto-scaling to handle traffic spikes
- Monitor CloudWatch metrics for right-sizing

### Fargate Spot
- Uses Fargate Spot instances (80% of capacity)
- Significant cost savings for non-critical workloads
- Automatic failover to regular Fargate if needed

### Monitoring Costs
- Set up CloudWatch billing alarms
- Monitor ECS service utilization
- Review and optimize resource allocations regularly

## Support

For issues or questions:
1. Check CloudWatch logs for error details
2. Review CloudFormation stack events
3. Validate template syntax with `aws cloudformation validate-template`
4. Use `--verbose` flag for detailed deployment output

## Version History

- **v1.0**: Initial CloudFormation templates with CORS support
- **v1.1**: Added comprehensive CORS configuration options
- **v1.2**: Enhanced security and monitoring capabilities