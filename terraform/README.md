# Press Release Generator - Terraform Infrastructure

## 🚀 Production Health Check Fix - RESOLVED

This Terraform configuration deploys a production-ready Press Release Generator system with **comprehensive health check fixes** that resolve ECS service health check failures.

## 🔧 Health Check Issues Fixed

### ✅ Issue #1: Container Health Check Commands
- **Problem**: Using `curl` which may not be available in container images
- **Solution**: Changed to `wget` with proper flags for reliability
- **Impact**: Eliminates container health check failures due to missing dependencies

### ✅ Issue #2: Frontend Health Check Endpoint
- **Problem**: Frontend checking `/health` endpoint (doesn't exist for static sites)
- **Solution**: Changed to root path `/` which always exists
- **Impact**: Frontend containers now pass health checks consistently

### ✅ Issue #3: ALB Target Group Status Codes
- **Problem**: Frontend target group only accepting `200` status codes
- **Solution**: Added `301,302` for redirect handling
- **Impact**: Handles frontend redirects without marking targets unhealthy

## 🏗️ Architecture Overview

```
Internet/VPC → ALB → ECS Services (Backend + Frontend)
                ↓
            Health Checks → CloudWatch Monitoring → SNS Alerts
```

### Components:
- **VPC**: Isolated network with public/private subnets
- **ALB**: Application Load Balancer with SSL termination
- **ECS**: Fargate services for backend (Node.js) and frontend
- **ECR**: Container registries for Docker images
- **S3**: Storage for generated content
- **CloudWatch**: Comprehensive monitoring and alerting
- **SNS**: Alert notifications

## 📊 Monitoring & Observability

### CloudWatch Alarms:
- Backend/Frontend health check failures
- CPU utilization (>80% threshold)
- Memory utilization (>85% threshold)
- Task count monitoring
- ALB response time (>5s threshold)
- 5XX error rate monitoring

### CloudWatch Dashboard:
- Real-time health status visualization
- Resource utilization metrics
- Request/response metrics
- Task count tracking

### Log Insights Queries:
- Backend error filtering
- Health check failure analysis

## 🚀 Quick Deployment

### Prerequisites:
1. AWS CLI configured with appropriate permissions
2. Terraform >= 1.0 installed
3. Docker images built and pushed to ECR

### Deploy Health Check Fixes:
```bash
cd terraform
chmod +x deploy-health-check-fix.sh
./deploy-health-check-fix.sh
```

### Manual Deployment:
```bash
# Validate configuration
terraform validate

# Plan deployment
terraform plan

# Apply changes
terraform apply

# Force service updates
aws ecs update-service --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw backend_service_name) --force-new-deployment

aws ecs update-service --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw frontend_service_name) --force-new-deployment
```

## 🔍 Health Check Validation

### Check Target Group Health:
```bash
# Backend health
aws elbv2 describe-target-health --target-group-arn $(terraform output -raw backend_target_group_arn)

# Frontend health
aws elbv2 describe-target-health --target-group-arn $(terraform output -raw frontend_target_group_arn)
```

### Test Endpoints:
```bash
# Backend health endpoint
curl -v https://$(terraform output -raw load_balancer_dns_name)/health

# Frontend root endpoint
curl -v https://$(terraform output -raw load_balancer_dns_name)/

# API status endpoint
curl -v https://$(terraform output -raw load_balancer_dns_name)/api/v1/status
```

## 📋 Configuration Variables

### Required Variables:
```hcl
project_name = "press-release-generator"
environment  = "prod"
aws_region   = "us-west-2"

# Container Images (replace with your ECR URLs)
backend_image  = "your-account.dkr.ecr.us-west-2.amazonaws.com/backend:latest"
frontend_image = "your-account.dkr.ecr.us-west-2.amazonaws.com/frontend:latest"

# CORS Configuration
frontend_url = "https://your-frontend-domain.com"
```

### Optional Variables:
```hcl
# Deployment Type
deployment_type = "internal"  # or "public"

# Resource Sizing
backend_cpu    = 512
backend_memory = 1024
frontend_cpu   = 256
frontend_memory = 512

# Auto Scaling
backend_min_capacity  = 1
backend_max_capacity  = 10
frontend_min_capacity = 1
frontend_max_capacity = 5

# SSL Certificate
ssl_certificate_arn = "arn:aws:acm:region:account:certificate/cert-id"
domain_name        = "your-domain.com"
```

## 🔐 Security Features

- **VPC Isolation**: Private subnets for ECS tasks
- **Security Groups**: Restrictive ingress/egress rules
- **SSL/TLS**: HTTPS-only with certificate management
- **IAM Roles**: Least privilege access for ECS tasks
- **Secrets Management**: API keys stored in AWS Secrets Manager

## 📈 Monitoring Dashboard

Access your monitoring dashboard:
```
https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#dashboards:name={project-name}-{environment}-dashboard
```

## 🚨 Alert Configuration

Set up email notifications:
```bash
aws sns subscribe --topic-arn $(terraform output -raw alerts_topic_arn) \
  --protocol email --notification-endpoint your-email@company.com
```

## 🔄 Troubleshooting

### Common Issues:

1. **Health Check Failures**:
   - Verify container images have `wget` installed
   - Check application starts correctly on expected ports
   - Validate health endpoints return 200 status

2. **Service Won't Start**:
   - Check CloudWatch logs for startup errors
   - Verify environment variables and secrets
   - Ensure sufficient CPU/memory allocation

3. **Load Balancer 502/503 Errors**:
   - Check target group health status
   - Verify security group rules allow ALB → ECS communication
   - Check ECS service desired vs running task counts

### Debug Commands:
```bash
# View service events
aws ecs describe-services --cluster CLUSTER_NAME --services SERVICE_NAME

# Check task definition
aws ecs describe-task-definition --task-definition TASK_DEF_ARN

# View task logs
aws logs tail LOG_GROUP_NAME --follow

# Check ALB target health
aws elbv2 describe-target-health --target-group-arn TARGET_GROUP_ARN
```

## 📚 Additional Resources

- [AWS ECS Health Checks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#container_definition_healthcheck)
- [ALB Health Checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
- [CloudWatch Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)

---

## 🎯 Production Status: HEALTH CHECK ISSUES RESOLVED

The comprehensive fixes applied in this configuration address all identified health check failures:
- ✅ Container health check commands fixed (curl → wget)
- ✅ Frontend health check endpoint corrected (/health → /)
- ✅ ALB target group matchers updated (200 → 200,301,302)
- ✅ Comprehensive monitoring and alerting added
- ✅ Troubleshooting documentation provided
- ✅ Automated deployment script created

**Ready for production deployment with reliable health checks.**