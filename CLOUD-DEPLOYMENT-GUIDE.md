# Cloud Deployment Guide - Step-by-Step

**Deployment Method**: AWS ECS (Fargate) using Terraform  
**Total Time**: 15-30 minutes  
**Manual Steps**: 8-12 required

## Why Multi-Step Deployment?

Due to fundamental architectural constraints:
1. **Circular Dependency**: Terraform needs image URIs → Images need ECR → ECR created by Terraform
2. **Security**: API keys obtained externally, stored in AWS Secrets Manager
3. **Build Artifacts**: Docker images built from local source code
4. **Prerequisites**: AWS credentials configured before operations

---

## 📋 Complete Deployment Sequence

### Phase 1: Prerequisites (5-10 minutes)

#### Step 1.1: Obtain External API Keys

Get from external services **before** deployment:
- **Tavily API Key** (REQUIRED): https://tavily.com - Market research
- **Firecrawl API Key** (Optional): https://firecrawl.dev - Web scraping
- **Perplexity API Key** (Optional): https://perplexity.ai - Research

#### Step 1.2: Configure AWS Profile

```bash
# Set AWS profile for all operations
export AWS_PROFILE=brie-account

# For SSO users
mwinit -o

# Verify credentials
aws sts get-caller-identity --profile brie-account
```

#### Step 1.3: Verify Tool Installations

```bash
docker --version      # Docker 20+
aws --version         # AWS CLI 2.0+
terraform --version   # Terraform 1.0+
```

---

### Phase 2: AWS Secrets Manager Setup (2-3 minutes)

#### Step 2.1: Create Secrets

```bash
# Create Tavily API key secret (REQUIRED)
aws secretsmanager create-secret \
    --name "press-release-generator/tavily-api-key" \
    --description "Tavily API key for market research" \
    --secret-string "your-tavily-api-key-here" \
    --region us-west-2 \
    --profile brie-account
```

#### Step 2.2: Get Secret ARNs (Save These!)

```bash
# Get Tavily secret ARN
aws secretsmanager describe-secret \
    --secret-id "press-release-generator/tavily-api-key" \
    --region us-west-2 \
    --profile brie-account \
    --query 'ARN' \
    --output text
```

📝 **Save this ARN** - you'll need it in Phase 3!

---

### Phase 3: Configure Terraform (2-3 minutes)

#### Step 3.1: Copy Configuration Template

```bash
cd terraform

# For internal/corporate deployment (recommended)
cp terraform.tfvars.ia-admin terraform.tfvars
```

#### Step 3.2: Edit terraform.tfvars

Add the secret ARN from Phase 2:

```hcl
# terraform/terraform.tfvars

tavily_api_key_secret_arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:press-release-generator/tavily-api-key-AbCdEf"

aws_region = "us-west-2"
aws_profile = "brie-account"
```

#### Step 3.3: Initialize Terraform

```bash
terraform init
```

---

### Phase 4: Create ECR Repositories (1-2 minutes)

```bash
# Create ECR repositories FIRST
terraform apply \
    -target=aws_ecr_repository.backend \
    -target=aws_ecr_repository.frontend
```

**Save the repository URIs from output:**
```
backend_repository_url = "123456789012.dkr.ecr.us-west-2.amazonaws.com/press-release-backend-123456789012"
frontend_repository_url = "123456789012.dkr.ecr.us-west-2.amazonaws.com/press-release-frontend-123456789012"
```

---

### Phase 5: Build Docker Images (5-10 minutes)

#### Step 5.1: Return to Project Root

```bash
# CRITICAL: Must build from project root
cd ..  # Back to project root
```

#### Step 5.2: Build Images

```bash
# Build backend (uses project root as context)
docker build --platform linux/amd64 \
    -f backend/Dockerfile \
    -t backend:latest .

# Build frontend
docker build --platform linux/amd64 \
    -f frontend/Dockerfile \
    -t frontend:latest .
```

**Why `--platform linux/amd64`?** ECS Fargate requires AMD64 architecture

**Why project root?** Dockerfiles reference `../data/` and `../trusteddata/`

---

### Phase 6: Push Images to ECR (2-3 minutes)

#### Step 6.1: Login to ECR

```bash
aws ecr get-login-password \
    --region us-west-2 \
    --profile brie-account | \
    docker login --username AWS --password-stdin \
    <account-id>.dkr.ecr.us-west-2.amazonaws.com
```

#### Step 6.2: Tag and Push

```bash
# Tag with ECR URIs (from Phase 4)
docker tag backend:latest \
    <account>.dkr.ecr.us-west-2.amazonaws.com/<backend-repo>:latest

docker tag frontend:latest \
    <account>.dkr.ecr.us-west-2.amazonaws.com/<frontend-repo>:latest

# Push to ECR
docker push <account>.dkr.ecr.us-west-2.amazonaws.com/<backend-repo>:latest
docker push <account>.dkr.ecr.us-west-2.amazonaws.com/<frontend-repo>:latest
```

**Alternative: Automated Script**
```bash
./scripts/build-and-push-images.sh
```

---

### Phase 7: Update Terraform with Image URIs (1 minute)

Edit `terraform/terraform.tfvars` and add:

```hcl
backend_image = "123456789012.dkr.ecr.us-west-2.amazonaws.com/press-release-backend-123456789012:latest"

frontend_image = "123456789012.dkr.ecr.us-west-2.amazonaws.com/press-release-frontend-123456789012:latest"
```

---

### Phase 8: Deploy Full Infrastructure (5-10 minutes)

#### Step 8.1: Review Plan

```bash
cd terraform
terraform plan
```

Resources created (30-40 total):
- VPC, subnets, security groups
- ECS cluster, task definitions, services
- Application Load Balancer
- S3 bucket, CloudWatch logs
- IAM roles and policies

#### Step 8.2: Apply Configuration

```bash
terraform apply
# Type 'yes' when prompted
```

---

### Phase 9: Verify Deployment (2-5 minutes)

#### Step 9.1: Check ECS Services

```bash
aws ecs describe-services \
    --cluster press-release-generator-cluster \
    --services backend-service frontend-service \
    --profile brie-account
```

#### Step 9.2: Get Load Balancer URL

```bash
aws elbv2 describe-load-balancers \
    --names press-release-generator-alb \
    --profile brie-account \
    --query 'LoadBalancers[0].DNSName' \
    --output text
```

#### Step 9.3: Test Endpoints

```bash
ALB_DNS="<from-step-9.2>"

curl https://${ALB_DNS}/health
curl https://${ALB_DNS}/api/v1/status
```

#### Step 9.4: Monitor Logs

```bash
aws logs tail /ecs/press-release-generator-backend \
    --follow \
    --profile brie-account
```

---

## 🎯 Quick Reference for Experienced Users

```bash
# Prerequisites
export AWS_PROFILE=brie-account
aws sts get-caller-identity

# Create secrets (one-time)
aws secretsmanager create-secret \
    --name "press-release-generator/tavily-api-key" \
    --secret-string "YOUR_KEY" --region us-west-2

# Configure Terraform
cd terraform
cp terraform.tfvars.ia-admin terraform.tfvars
# Edit: Add secret ARNs
terraform init

# Create ECR repos
terraform apply -target=aws_ecr_repository.backend -target=aws_ecr_repository.frontend

# Build and push (automated)
cd ..
./scripts/build-and-push-images.sh

# Update terraform.tfvars with image URIs

# Deploy infrastructure
cd terraform
terraform apply

# Verify
curl https://<alb-dns>/health
```

---

## 🔄 Deployment Variants

### Internal Deployment (Default)
- **Access**: VPC-only, not internet-accessible
- **Security**: Enhanced with VPC endpoints
- **Use Case**: Corporate environments, compliance

```bash
export TF_VAR_deployment_type="internal"
```

### Public Deployment  
- **Access**: Internet-facing with public IPs
- **Security**: Standard HTTPS with ALB
- **Use Case**: Production apps, public APIs

```bash
export TF_VAR_deployment_type="public"
```

---

## 🛠️ Troubleshooting

### Issue: "Secret not found" errors
```bash
# Verify secret exists
aws secretsmanager describe-secret \
    --secret-id "press-release-generator/tavily-api-key" \
    --region us-west-2
```

### Issue: Docker image pull failures
```bash
# Check images in ECR
aws ecr describe-images \
    --repository-name press-release-generator-backend \
    --profile brie-account
```

### Issue: ECS tasks not starting
```bash
# Check ECS events
aws ecs describe-services \
    --cluster press-release-generator-cluster \
    --services backend-service \
    --profile brie-account \
    --query 'services[0].events[0:5]'
```

---

## 📊 Deployment Checklist

- [ ] **Phase 1**: Prerequisites
  - [ ] Obtained Tavily API key
  - [ ] Configured AWS profile
  - [ ] Verified tools installed

- [ ] **Phase 2**: Secrets Manager
  - [ ] Created secrets
  - [ ] Saved ARNs

- [ ] **Phase 3**: Terraform Config
  - [ ] Copied tfvars template
  - [ ] Added secret ARNs
  - [ ] Ran terraform init

- [ ] **Phase 4**: ECR Repositories
  - [ ] Created with Terraform
  - [ ] Saved URIs

- [ ] **Phase 5**: Build Images
  - [ ] Built from project root
  - [ ] Used correct platform flag

- [ ] **Phase 6**: Push to ECR
  - [ ] Logged into ECR
  - [ ] Pushed images

- [ ] **Phase 7**: Image URIs
  - [ ] Updated terraform.tfvars

- [ ] **Phase 8**: Deploy Infrastructure
  - [ ] Reviewed plan
  - [ ] Applied configuration

- [ ] **Phase 9**: Verification
  - [ ] Services running
  - [ ] Endpoints responding
  - [ ] Logs streaming

---

**Estimated Total Time**: 15-30 minutes  
**Automation Level**: 65% (infrastructure fully automated, build/push semi-automated)