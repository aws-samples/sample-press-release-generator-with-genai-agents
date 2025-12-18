# Press Release Generator - Terraform Infrastructure
# CORS-enabled deployment configuration

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local values
locals {
  name_prefix = "${substr(var.project_name, 0, 10)}-${var.environment}"

  # Certificate ARN selection logic
  certificate_arn = var.ssl_certificate_arn != "" ? var.ssl_certificate_arn : (
    var.domain_name != "" ? aws_acm_certificate.main[0].arn : aws_acm_certificate.self_signed[0].arn
  )

  # CORS configuration
  cors_origins = [
    var.frontend_url,
    "https://${aws_lb.main.dns_name}"
  ]

  # S3 configuration defaults
  s3_key_prefix            = "jobs/"
  presigned_url_expiration = 3600

  # Data Lineage configuration defaults
  data_lineage_config = {
    enabled          = true
    log_level        = "info"
    max_log_files    = 10
    max_log_size     = 10485760 # 10MB
    persist_events   = true
    retention_days   = 30
    error_threshold  = 100
    cleanup_interval = 86400 # 24 hours
  }

  # Redis configuration defaults
  redis_connection_config = {
    db                 = 0
    connection_timeout = 5000
    command_timeout    = 5000
    retry_attempts     = 3
    retry_delay        = 1000
  }

  # Environment variables for ECS tasks
  backend_environment = [
    {
      name  = "NODE_ENV"
      value = var.environment
    },
    {
      name  = "AWS_REGION"
      value = var.aws_region
    },
    {
      name  = "S3_CONTENT_BUCKET"
      value = aws_s3_bucket.storage.id
    },
    {
      name  = "PORT"
      value = "3001"
    },
    {
      name  = "FRONTEND_URL"
      value = var.frontend_url
    },
    {
      name  = "CORS_ORIGIN"
      value = var.frontend_url
    },
    {
      name  = "CORS_ALLOWED_ORIGINS"
      value = join(",", local.cors_origins)
    },
    {
      name  = "CORS_DOMAIN_PATTERN"
      value = var.cors_domain_pattern
    },
    {
      name  = "CORS_CREDENTIALS"
      value = "true"
    },
    {
      name  = "CORS_MAX_AGE"
      value = "86400"
    },
    {
      name  = "AWS_REGION"
      value = var.aws_region
    },
    {
      name  = "AWS_BEDROCK_MODEL_ID"
      value = var.aws_bedrock_model_id
    },
    {
      name  = "BEDROCK_MAX_INPUT_TOKENS"
      value = tostring(var.bedrock_max_input_tokens)
    },
    {
      name  = "BEDROCK_MAX_OUTPUT_TOKENS"
      value = tostring(var.bedrock_max_output_tokens)
    },
    {
      name  = "LOG_LEVEL"
      value = "info"
    },
    {
      name  = "TRUSTED_DATA_PATH"
      value = "/app/trusteddata"
    },
    {
      name  = "STRANDS_ENABLED"
      value = tostring(var.enable_strands)
    },
    {
      name  = "ENABLE_AUTHENTICATION"
      value = tostring(var.enable_authentication)
    },
    {
      name  = "AUTH_MODE"
      value = var.auth_mode
    },
    {
      name  = "STORAGE_TYPE"
      value = "cloud"
    },
    # S3 Configuration (CRITICAL for job storage and lineage dashboard)
    {
      name  = "S3_KEY_PREFIX"
      value = local.s3_key_prefix
    },
    {
      name  = "PRESIGNED_URL_EXPIRATION"
      value = tostring(local.presigned_url_expiration)
    },
    # Data Lineage Configuration (CRITICAL for job tracking and auditing)
    {
      name  = "DATA_LINEAGE_ENABLED"
      value = tostring(local.data_lineage_config.enabled)
    },
    {
      name  = "DATA_LINEAGE_LOG_LEVEL"
      value = local.data_lineage_config.log_level
    },
    {
      name  = "DATA_LINEAGE_MAX_LOG_FILES"
      value = tostring(local.data_lineage_config.max_log_files)
    },
    {
      name  = "DATA_LINEAGE_MAX_LOG_SIZE"
      value = tostring(local.data_lineage_config.max_log_size)
    },
    {
      name  = "DATA_LINEAGE_PERSIST_EVENTS"
      value = tostring(local.data_lineage_config.persist_events)
    },
    {
      name  = "DATA_LINEAGE_RETENTION_DAYS"
      value = tostring(local.data_lineage_config.retention_days)
    },
    {
      name  = "DATA_LINEAGE_ERROR_THRESHOLD"
      value = tostring(local.data_lineage_config.error_threshold)
    },
    {
      name  = "DATA_LINEAGE_CLEANUP_INTERVAL"
      value = tostring(local.data_lineage_config.cleanup_interval)
    }
  ]

  # Secrets for ECS tasks
  backend_secrets = concat(
    var.firecrawl_api_key_secret_arn != "" ? [{
      name      = "FIRECRAWL_API_KEY"
      valueFrom = var.firecrawl_api_key_secret_arn
    }] : [],
    var.perplexity_api_key_secret_arn != "" ? [{
      name      = "PERPLEXITY_API_KEY"
      valueFrom = var.perplexity_api_key_secret_arn
    }] : [],
    var.tavily_api_key_secret_arn != "" ? [{
      name      = "TAVILY_API_KEY"
      valueFrom = var.tavily_api_key_secret_arn
    }] : []
  )

  frontend_environment = [
    {
      name  = "NODE_ENV"
      value = var.environment
    },
    {
      name  = "PORT"
      value = "80"
    },
    {
      name  = "API_BASE_URL"
      value = "https://${aws_lb.main.dns_name}/api/v1"
    },
    {
      name  = "BACKEND_URL"
      value = "https://${aws_lb.main.dns_name}"
    },
    {
      name  = "DEBUG"
      value = "false"
    },
    {
      name  = "CORS_MODE"
      value = "cors"
    }
  ]
  # Performance Comparison Configuration - REMOVED
  # Comparison feature removed as only sequential_hybrid pattern was implemented

  # Enhanced backend environment (includes Redis configuration)
  enhanced_backend_environment = concat(local.backend_environment, [
    {
      name  = "REDIS_HOST"
      value = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].primary_endpoint_address : "localhost"
    },
    {
      name  = "REDIS_PORT"
      value = var.redis_mode == "elasticache" ? tostring(aws_elasticache_replication_group.main[0].port) : "6379"
    },
    {
      name  = "REDIS_TLS_ENABLED"
      value = var.redis_mode == "elasticache" ? "true" : "false"
    },
    {
      name  = "REDIS_MODE"
      value = var.redis_mode
    },
    # Additional Redis Configuration (CRITICAL for connection management)
    {
      name  = "REDIS_DB"
      value = tostring(local.redis_connection_config.db)
    },
    {
      name  = "REDIS_CONNECTION_TIMEOUT"
      value = tostring(local.redis_connection_config.connection_timeout)
    },
    {
      name  = "REDIS_COMMAND_TIMEOUT"
      value = tostring(local.redis_connection_config.command_timeout)
    },
    {
      name  = "REDIS_RETRY_ATTEMPTS"
      value = tostring(local.redis_connection_config.retry_attempts)
    },
    {
      name  = "REDIS_RETRY_DELAY"
      value = tostring(local.redis_connection_config.retry_delay)
    }
  ])

  # Redis configuration
  redis_config = {
    host = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].primary_endpoint_address : "localhost"
    port = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].port : 6379
    auth = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].auth_token : ""
    tls  = var.redis_mode == "elasticache" ? true : false
  }

  # Common tags for all resources
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "ia-admin"
    CostCenter  = "infrastructure"
  }
}

# VPC
# VPC Configuration
# CRITICAL: DNS settings MUST be enabled for VPC endpoint private DNS to function
# Without these settings, ECS tasks will resolve ECR hostnames to public IPs
# causing i/o timeout errors in private subnets without NAT Gateway
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true # Required for VPC endpoint private DNS
  enable_dns_support   = true # Required for VPC endpoint private DNS

  # Lifecycle rules to detect configuration drift
  lifecycle {
    # Prevent accidental destruction of VPC
    prevent_destroy = false

    # Alert on any changes to critical DNS settings
    # If these change, validate via:
    # aws ec2 describe-vpc-attribute --vpc-id <VPC_ID> --attribute enableDnsSupport
    ignore_changes = []
  }

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-igw"
  }
}

# Public Subnets
resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name_prefix}-public-subnet-${count.index + 1}"
    Type = "public"
  }
}

# Private Subnets
resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${local.name_prefix}-private-subnet-${count.index + 1}"
    Type = "private"
  }
}

# NAT Gateways
# NAT Gateway resources removed - ECS tasks now run in public subnets with public IPs
# This eliminates NAT gateway requirement and avoids EIP limit issues (account has 6/5 EIPs in use)

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${local.name_prefix}-public-rt"
  }
}

# Private subnets kept but no longer used by ECS - may be useful for future resources
resource "aws_route_table" "private" {
  count = 2

  vpc_id = aws_vpc.main.id

  # No routes - private subnets isolated without NAT gateway

  tags = {
    Name = "${local.name_prefix}-private-rt-${count.index + 1}"
  }
}

# Route Table Associations
# CRITICAL: Route table associations MUST be managed by Terraform
# Without these associations, subnets use the default VPC route table
# which has no internet gateway route, causing ECS tasks to fail
resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Endpoints for Internal Deployments (optional but recommended)
resource "aws_vpc_endpoint" "s3" {
  count = var.deployment_type == "internal" ? 1 : 0

  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.s3"

  tags = {
    Name = "${local.name_prefix}-s3-endpoint"
  }
}

resource "aws_vpc_endpoint" "bedrock" {
  count = var.deployment_type == "internal" ? 1 : 0

  vpc_id             = aws_vpc.main.id
  service_name       = "com.amazonaws.${var.aws_region}.bedrock-runtime"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.vpc_endpoint[0].id]

  tags = {
    Name = "${local.name_prefix}-bedrock-endpoint"
  }
}

# Security Group for VPC Endpoints
resource "aws_security_group" "vpc_endpoint" {
  count = var.deployment_type == "internal" ? 1 : 0

  name_prefix = "${local.name_prefix}-vpc-endpoint-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-vpc-endpoint-sg"
  }
}

# Security Group for ECR VPC Endpoints (always needed for ECS)
resource "aws_security_group" "vpc_endpoints_ecr" {
  name        = "${local.name_prefix}-vpc-endpoints-sg"
  description = "Security group for VPC endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-vpc-endpoints-sg"
  }
}

# ECR API VPC Endpoint (required for ECS to pull images)
# CRITICAL FIX: VPC endpoints MUST be in same subnets as ECS tasks
# ECS tasks run in PUBLIC subnets, so endpoints must also be in PUBLIC subnets
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.public[*].id # Changed from private to public
  security_group_ids  = [aws_security_group.vpc_endpoints_ecr.id]
  private_dns_enabled = true

  tags = {
    Name = "${local.name_prefix}-ecr-api-endpoint"
  }
}

# ECR Docker VPC Endpoint (required for ECS to pull images)
# CRITICAL FIX: VPC endpoints MUST be in same subnets as ECS tasks
# ECS tasks run in PUBLIC subnets, so endpoints must also be in PUBLIC subnets
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.public[*].id # Changed from private to public
  security_group_ids  = [aws_security_group.vpc_endpoints_ecr.id]
  private_dns_enabled = true

  tags = {
    Name = "${local.name_prefix}-ecr-dkr-endpoint"
  }
}

# S3 Gateway VPC Endpoint (required for ECR to access Docker image layers)
resource "aws_vpc_endpoint" "s3_gateway" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = {
    Name = "${local.name_prefix}-s3-gateway-endpoint"
  }
}

# CloudWatch Logs VPC Endpoint (required for ECS task logging)
# CRITICAL FIX: VPC endpoints MUST be in same subnets as ECS tasks
# ECS tasks run in PUBLIC subnets, so endpoints must also be in PUBLIC subnets
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.public[*].id # Changed from private to public
  security_group_ids  = [aws_security_group.vpc_endpoints_ecr.id]
  private_dns_enabled = true

  tags = {
    Name = "${local.name_prefix}-logs-endpoint"
  }
}
# VPC Endpoint for AWS Secrets Manager (CRITICAL for ECS tasks to access secrets)
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.public[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints_ecr.id]
  private_dns_enabled = true

  tags = {
    Name = "${local.name_prefix}-secretsmanager-endpoint"
  }
}


# S3 Bucket for storage (globally unique name)
resource "aws_s3_bucket" "storage" {
  bucket = "${local.name_prefix}-storage-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${local.name_prefix}-storage"
  }
}

resource "aws_s3_bucket_cors_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "POST", "PUT", "DELETE", "HEAD"]
    allowed_origins = [
      var.frontend_url,
      "https://${aws_lb.main.dns_name}"
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ECR Repositories for Docker Images (account-scoped for uniqueness)
resource "aws_ecr_repository" "backend" {
  name                 = "${local.name_prefix}-backend-${data.aws_caller_identity.current.account_id}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.name_prefix}-backend-repo"
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${local.name_prefix}-frontend-${data.aws_caller_identity.current.account_id}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.name_prefix}-frontend-repo"
  }
}

# ECR Lifecycle Policies
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images older than 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images older than 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

# ECS Cluster Capacity Providers
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }

  default_capacity_provider_strategy {
    base              = 0
    weight            = 4
    capacity_provider = "FARGATE_SPOT"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = var.deployment_type == "internal"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.deployment_type == "internal" ? aws_subnet.private[*].id : aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name = "${local.name_prefix}-alb"
    Type = var.deployment_type
  }
}

# ALB Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  vpc_id      = aws_vpc.main.id

  # HTTP ingress rules - different for public vs internal
  dynamic "ingress" {
    for_each = var.deployment_type == "public" ? [1] : []
    content {
      description = "HTTP - Public Access"
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  dynamic "ingress" {
    for_each = var.deployment_type == "internal" ? [1] : []
    content {
      description = "HTTP - Internal Access"
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      cidr_blocks = var.allowed_cidr_blocks_internal
    }
  }

  # HTTPS ingress rules - different for public vs internal
  dynamic "ingress" {
    for_each = var.deployment_type == "public" ? [1] : []
    content {
      description = "HTTPS - Public Access"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  dynamic "ingress" {
    for_each = var.deployment_type == "internal" ? [1] : []
    content {
      description = "HTTPS - Internal Access"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.allowed_cidr_blocks_internal
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-alb-sg"
    Type = var.deployment_type
  }
}

# ALB Target Group for Backend
resource "aws_lb_target_group" "backend" {
  name        = "${local.name_prefix}-be-tg"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${local.name_prefix}-backend-tg"
  }
}

# SSL Certificate for ALB
# Note: For production, provide a valid certificate ARN via ssl_certificate_arn variable
# This creates a self-signed certificate approach for internal deployments
resource "aws_acm_certificate" "main" {
  count = var.ssl_certificate_arn == "" && var.domain_name != "" ? 1 : 0

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name_prefix}-ssl-cert"
  }
}

# Certificate validation (optional - requires DNS control)
resource "aws_acm_certificate_validation" "main" {
  count = var.ssl_certificate_arn == "" && var.domain_name != "" ? 1 : 0

  certificate_arn = aws_acm_certificate.main[0].arn

  timeouts {
    create = "10m"
  }
}

# Self-signed certificate for internal deployments without custom domain
resource "tls_private_key" "main" {
  count = var.ssl_certificate_arn == "" && var.domain_name == "" ? 1 : 0

  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "main" {
  count = var.ssl_certificate_arn == "" && var.domain_name == "" ? 1 : 0

  private_key_pem = tls_private_key.main[0].private_key_pem

  subject {
    common_name  = "*.${var.aws_region}.elb.amazonaws.com"
    organization = var.project_name
  }

  validity_period_hours = 8760 # 1 year

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

# Import self-signed certificate to ACM
resource "aws_acm_certificate" "self_signed" {
  count = var.ssl_certificate_arn == "" && var.domain_name == "" ? 1 : 0

  private_key      = tls_private_key.main[0].private_key_pem
  certificate_body = tls_self_signed_cert.main[0].cert_pem

  tags = {
    Name = "${local.name_prefix}-self-signed-cert"
  }
}

# ALB HTTP Listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ALB HTTPS Listener with Optional Cognito Authentication
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = local.certificate_arn

  # Default action: Authenticate with Cognito if enabled, otherwise forward directly
  default_action {
    type  = var.enable_authentication && var.auth_mode == "cognito" ? "authenticate-cognito" : "forward"
    order = var.enable_authentication && var.auth_mode == "cognito" ? 1 : null

    # Cognito authentication configuration (only when enabled)
    dynamic "authenticate_cognito" {
      for_each = var.enable_authentication && var.auth_mode == "cognito" ? [1] : []

      content {
        user_pool_arn       = aws_cognito_user_pool.main[0].arn
        user_pool_client_id = aws_cognito_user_pool_client.alb[0].id
        user_pool_domain    = aws_cognito_user_pool_domain.main[0].domain

        # Behavior on unauthenticated request
        on_unauthenticated_request = "authenticate"

        # Session configuration
        session_cookie_name = "AWSELBAuthSessionCookie"
        session_timeout     = 3600 # 1 hour

        # OAuth scopes
        scope = "openid email profile"
      }
    }

    # Forward action (always present, but after auth if enabled)
    dynamic "forward" {
      for_each = var.enable_authentication && var.auth_mode == "cognito" ? [] : [1]

      content {
        target_group {
          arn = aws_lb_target_group.backend.arn
        }
      }
    }
  }

  # Second action: Forward to backend (only when authentication is enabled)
  dynamic "default_action" {
    for_each = var.enable_authentication && var.auth_mode == "cognito" ? [1] : []

    content {
      type  = "forward"
      order = 2

      forward {
        target_group {
          arn = aws_lb_target_group.backend.arn
        }
      }
    }
  }
}

# ECS Security Group
resource "aws_security_group" "ecs" {
  name_prefix = "${local.name_prefix}-ecs-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "Frontend from ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-ecs-sg"
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}-backend"
  retention_in_days = 30

  tags = {
    Name = "${local.name_prefix}-backend-logs"
  }
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.name_prefix}-frontend"
  retention_in_days = 30

  tags = {
    Name = "${local.name_prefix}-frontend-logs"
  }
}

# IAM Roles
resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-ecs-task-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Policy for Secrets Manager Access (for API keys and Cognito secrets)
resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "${local.name_prefix}-ecs-secrets-policy"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = compact([
          var.firecrawl_api_key_secret_arn,
          var.perplexity_api_key_secret_arn,
          var.tavily_api_key_secret_arn,
          var.enable_authentication ? aws_secretsmanager_secret.cognito_client_secret[0].arn : ""
        ])
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-ecs-task-role"
  }
}

resource "aws_iam_role_policy" "ecs_task" {
  name = "${local.name_prefix}-ecs-task-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # AWS Bedrock - AI model invocation for content generation
        # CRITICAL: Multi-region support for inference profiles
        Sid    = "BedrockModelAccess"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws:bedrock:us-east-1::foundation-model/*",
          "arn:aws:bedrock:us-east-2::foundation-model/*",
          "arn:aws:bedrock:us-west-1::foundation-model/*",
          "arn:aws:bedrock:us-west-2::foundation-model/*",
          "arn:aws:bedrock:us-east-1:*:inference-profile/*",
          "arn:aws:bedrock:us-east-2:*:inference-profile/*",
          "arn:aws:bedrock:us-west-1:*:inference-profile/*",
          "arn:aws:bedrock:us-west-2:*:inference-profile/*"
        ]
      },
      {
        # CloudWatch Logs - Application logging
        # CRITICAL: Explicit permissions for auditability and debugging
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream", # Create log streams for new containers
          "logs:PutLogEvents"     # Write log events to streams
        ]
        Resource = "${aws_cloudwatch_log_group.backend.arn}:*"
      },
      {
        # S3 Bucket - Job directory listing and metadata
        # CRITICAL: ListBucket needed for job status and lineage dashboard
        Sid    = "S3BucketAccess"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",        # List job directories
          "s3:GetBucketLocation", # Multi-region support
          "s3:ListBucketVersions" # Versioning support
        ]
        Resource = aws_s3_bucket.storage.arn
      },
      {
        # S3 Objects - Job file operations
        # CRITICAL: Full CRUD operations for job storage and lineage tracking
        Sid    = "S3ObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",   # Read job files and generated content
          "s3:PutObject",   # Write job files and lineage data
          "s3:DeleteObject" # Clean up old jobs
        ]
        Resource = "${aws_s3_bucket.storage.arn}/*"
      }
    ]
  })
}

# Backend Task Definition
resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = var.backend_image
      essential = true

      portMappings = [
        {
          containerPort = 3001
          protocol      = "tcp"
        }
      ]

      environment = [
        for env in local.enhanced_backend_environment : {
          name  = env.name
          value = env.value
        }
      ]

      secrets = length(local.backend_secrets) > 0 ? [
        for secret in local.backend_secrets : {
          name      = secret.name
          valueFrom = secret.valueFrom
        }
      ] : null

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${local.name_prefix}-backend-task"
  }
}

# Frontend Task Definition
resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name_prefix}-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = var.frontend_image
      essential = true

      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        for env in local.frontend_environment : {
          name  = env.name
          value = env.value
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = {
    Name = "${local.name_prefix}-frontend-task"
  }
}

# Backend ECS Service
resource "aws_ecs_service" "backend" {
  name            = "${local.name_prefix}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs.id]
    subnets          = aws_subnet.public[*].id # Public subnets with internet access
    assign_public_ip = true                    # Enable public IP for ECR access via Internet Gateway
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3001
  }

  health_check_grace_period_seconds = 300


  depends_on = [aws_lb_listener.https]

  tags = {
    Name = "${local.name_prefix}-backend-service"
  }
}

# Frontend Target Group
resource "aws_lb_target_group" "frontend" {
  name        = "${local.name_prefix}-fe-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200,301,302"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${local.name_prefix}-frontend-tg"
  }
}

# Frontend ECS Service
resource "aws_ecs_service" "frontend" {
  name            = "${local.name_prefix}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs.id]
    subnets          = aws_subnet.public[*].id # Public subnets with internet access
    assign_public_ip = true                    # Enable public IP for ECR access via Internet Gateway
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 8080
  }

  health_check_grace_period_seconds = 300


  depends_on = [aws_lb_listener.https]

  tags = {
    Name = "${local.name_prefix}-frontend-service"
  }
}

# Frontend ALB Listener Rule (with optional authentication)
resource "aws_lb_listener_rule" "frontend" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 200

  # First action: Authenticate if enabled
  dynamic "action" {
    for_each = var.enable_authentication && var.auth_mode == "cognito" ? [1] : []

    content {
      type  = "authenticate-cognito"
      order = 1

      authenticate_cognito {
        user_pool_arn       = aws_cognito_user_pool.main[0].arn
        user_pool_client_id = aws_cognito_user_pool_client.alb[0].id
        user_pool_domain    = aws_cognito_user_pool_domain.main[0].domain

        on_unauthenticated_request = "authenticate"
        session_cookie_name        = "AWSELBAuthSessionCookie"
        session_timeout            = 3600
        scope                      = "openid email profile"
      }
    }
  }

  # Second action: Forward to frontend
  action {
    type  = "forward"
    order = var.enable_authentication && var.auth_mode == "cognito" ? 2 : 1

    forward {
      target_group {
        arn = aws_lb_target_group.frontend.arn
      }
    }
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }
}

# Auto Scaling for Backend
resource "aws_appautoscaling_target" "backend" {
  max_capacity       = var.backend_max_capacity
  min_capacity       = var.backend_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "backend_up" {
  name               = "${local.name_prefix}-backend-scale-up"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Auto Scaling for Frontend
resource "aws_appautoscaling_target" "frontend" {
  max_capacity       = var.frontend_max_capacity
  min_capacity       = var.frontend_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.frontend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "frontend_up" {
  name               = "${local.name_prefix}-frontend-scale-up"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.frontend.resource_id
  scalable_dimension = aws_appautoscaling_target.frontend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.frontend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# ALB Listener Rule for API (with optional authentication)
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  # First action: Authenticate if enabled
  dynamic "action" {
    for_each = var.enable_authentication && var.auth_mode == "cognito" ? [1] : []

    content {
      type  = "authenticate-cognito"
      order = 1

      authenticate_cognito {
        user_pool_arn       = aws_cognito_user_pool.main[0].arn
        user_pool_client_id = aws_cognito_user_pool_client.alb[0].id
        user_pool_domain    = aws_cognito_user_pool_domain.main[0].domain

        on_unauthenticated_request = "authenticate"
        session_cookie_name        = "AWSELBAuthSessionCookie"
        session_timeout            = 3600
        scope                      = "openid email profile"
      }
    }
  }

  # Second action: Forward to backend
  action {
    type  = "forward"
    order = var.enable_authentication && var.auth_mode == "cognito" ? 2 : 1

    forward {
      target_group {
        arn = aws_lb_target_group.backend.arn
      }
    }
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}