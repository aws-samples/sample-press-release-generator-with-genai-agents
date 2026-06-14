# Press Release Generator - Terraform Outputs
# CORS-enabled deployment outputs

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

# Load Balancer Outputs
output "load_balancer_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "load_balancer_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "load_balancer_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.main.zone_id
}

# ECS Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

# ECS Services
output "backend_service_name" {
  description = "Name of the backend ECS service"
  value       = aws_ecs_service.backend.name
}

output "frontend_service_name" {
  description = "Name of the frontend ECS service"
  value       = aws_ecs_service.frontend.name
}

output "backend_task_definition_arn" {
  description = "ARN of the backend task definition"
  value       = aws_ecs_task_definition.backend.arn
}

output "frontend_task_definition_arn" {
  description = "ARN of the frontend task definition"
  value       = aws_ecs_task_definition.frontend.arn
}

# S3 Outputs
output "storage_bucket_name" {
  description = "Name of the storage S3 bucket"
  value       = aws_s3_bucket.storage.bucket
}

output "storage_bucket_arn" {
  description = "ARN of the storage S3 bucket"
  value       = aws_s3_bucket.storage.arn
}

output "storage_bucket_domain_name" {
  description = "Domain name of the storage S3 bucket"
  value       = aws_s3_bucket.storage.bucket_domain_name
}

# ECR Outputs
output "backend_ecr_repository_url" {
  description = "URL of the backend ECR repository"
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_ecr_repository_url" {
  description = "URL of the frontend ECR repository"
  value       = aws_ecr_repository.frontend.repository_url
}

output "backend_ecr_repository_arn" {
  description = "ARN of the backend ECR repository"
  value       = aws_ecr_repository.backend.arn
}

output "frontend_ecr_repository_arn" {
  description = "ARN of the frontend ECR repository"
  value       = aws_ecr_repository.frontend.arn
}

# Application URLs
output "application_url" {
  description = "URL to access the application"
  value       = "https://${aws_lb.main.dns_name}"
}

output "api_url" {
  description = "URL to access the API"
  value       = "https://${aws_lb.main.dns_name}/api/v1"
}

output "deployment_type" {
  description = "Type of deployment (public or internal)"
  value       = var.deployment_type
}

output "load_balancer_type" {
  description = "Load balancer accessibility"
  value       = var.deployment_type == "internal" ? "Internal (VPC-only)" : (var.enable_cloudfront ? "CloudFront-fronted" : "Internet-facing")
}

# CloudFront Outputs (conditional)
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = var.deployment_type == "public" && var.enable_cloudfront ? aws_cloudfront_distribution.main[0].id : null
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name"
  value       = var.deployment_type == "public" && var.enable_cloudfront ? aws_cloudfront_distribution.main[0].domain_name : null
}

output "cloudfront_distribution_hosted_zone_id" {
  description = "CloudFront distribution hosted zone ID"
  value       = var.deployment_type == "public" && var.enable_cloudfront ? aws_cloudfront_distribution.main[0].hosted_zone_id : null
}

output "primary_url" {
  description = "Primary URL for accessing the application"
  value       = var.deployment_type == "public" && var.enable_cloudfront ? "https://${aws_cloudfront_distribution.main[0].domain_name}" : "https://${aws_lb.main.dns_name}"
}

# CORS Configuration
output "cors_configuration" {
  description = "CORS configuration details"
  value = {
    allowed_origins = join(",", [
      var.frontend_url,
      "https://${aws_lb.main.dns_name}"
    ])
    domain_pattern = var.cors_domain_pattern
    credentials    = "true"
    max_age        = "86400"
  }
}

# Security Groups
output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

# Target Groups
output "backend_target_group_arn" {
  description = "ARN of the backend target group"
  value       = aws_lb_target_group.backend.arn
}

output "frontend_target_group_arn" {
  description = "ARN of the frontend target group"
  value       = aws_lb_target_group.frontend.arn
}

# Environment Variables
output "environment_variables" {
  description = "Environment variables for deployment"
  value = {
    backend = {
      NODE_ENV             = var.environment
      PORT                 = "3001"
      FRONTEND_URL         = var.frontend_url
      CORS_ORIGIN          = var.frontend_url
      CORS_ALLOWED_ORIGINS = join(",", [var.frontend_url, "https://${aws_lb.main.dns_name}"])
      CORS_DOMAIN_PATTERN  = var.cors_domain_pattern
      CORS_CREDENTIALS     = "true"
      CORS_MAX_AGE         = "86400"
      AWS_REGION           = var.aws_region
    }
    frontend = {
      NODE_ENV     = var.environment
      API_BASE_URL = "https://${aws_lb.main.dns_name}/api/v1"
      BACKEND_URL  = "https://${aws_lb.main.dns_name}"
      CORS_MODE    = "cors"
    }
  }
}

# Deployment Information
output "deployment_info" {
  description = "Information about the deployment"
  value = {
    project_name    = var.project_name
    environment     = var.environment
    aws_region      = var.aws_region
    deployment_type = var.deployment_type
    deployment_url  = "https://${aws_lb.main.dns_name}"
    access_level    = var.deployment_type == "internal" ? "VPC-only access" : "Public internet access"

    # Useful commands
    commands = {
      check_alb_health        = "aws elbv2 describe-target-health --target-group-arn ${aws_lb_target_group.backend.arn}"
      check_ecs_cluster       = "aws ecs describe-clusters --clusters ${aws_ecs_cluster.main.name}"
      list_ecs_services       = "aws ecs list-services --cluster ${aws_ecs_cluster.main.name}"
      update_backend          = "aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.backend.name} --force-new-deployment"
      update_frontend         = "aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.frontend.name} --force-new-deployment"
      view_backend_logs       = "aws logs tail ${aws_cloudwatch_log_group.backend.name} --follow"
      view_frontend_logs      = "aws logs tail ${aws_cloudwatch_log_group.frontend.name} --follow"
      check_service_health    = "aws ecs describe-services --cluster ${aws_ecs_cluster.main.name} --services ${aws_ecs_service.backend.name} ${aws_ecs_service.frontend.name}"
      build_and_push_backend  = "docker build -t ${aws_ecr_repository.backend.repository_url}:latest ./backend && docker push ${aws_ecr_repository.backend.repository_url}:latest"
      build_and_push_frontend = "docker build -t ${aws_ecr_repository.frontend.repository_url}:latest ./frontend && docker push ${aws_ecr_repository.frontend.repository_url}:latest"
      ecr_login               = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${split("/", aws_ecr_repository.backend.repository_url)[0]}"
    }
  }
}

# Resource ARNs
output "resource_arns" {
  description = "ARNs of created resources"
  value = {
    vpc                   = aws_vpc.main.arn
    load_balancer         = aws_lb.main.arn
    ecs_cluster           = aws_ecs_cluster.main.arn
    storage_bucket        = aws_s3_bucket.storage.arn
    backend_target_group  = aws_lb_target_group.backend.arn
    frontend_target_group = aws_lb_target_group.frontend.arn
    backend_service       = aws_ecs_service.backend.id
    frontend_service      = aws_ecs_service.frontend.id
    backend_task_def      = aws_ecs_task_definition.backend.arn
    frontend_task_def     = aws_ecs_task_definition.frontend.arn
    backend_ecr_repo      = aws_ecr_repository.backend.arn
    frontend_ecr_repo     = aws_ecr_repository.frontend.arn
  }
}

# Networking Details
output "networking" {
  description = "Networking configuration details"
  value = {
    vpc_cidr           = aws_vpc.main.cidr_block
    public_subnets     = aws_subnet.public[*].cidr_block
    private_subnets    = aws_subnet.private[*].cidr_block
    availability_zones = aws_subnet.public[*].availability_zone
    nat_gateway_ips    = [] # NAT gateways removed - ECS tasks use public IPs
  }
}

# Tags
output "common_tags" {
  description = "Common tags applied to resources"
  value = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Monitoring Outputs
output "alerts_topic_arn" {
  description = "ARN of the SNS alerts topic"
  value       = aws_sns_topic.alerts.arn
}

output "backend_log_group_name" {
  description = "Name of the backend CloudWatch log group"
  value       = aws_cloudwatch_log_group.backend.name
}

output "frontend_log_group_name" {
  description = "Name of the frontend CloudWatch log group"
  value       = aws_cloudwatch_log_group.frontend.name
}

output "cloudwatch_dashboard_url" {
  description = "URL to access the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

# Health Check Troubleshooting Commands
output "troubleshooting_commands" {
  description = "Commands for troubleshooting health check issues"
  value = {
    check_backend_health    = "aws elbv2 describe-target-health --target-group-arn ${aws_lb_target_group.backend.arn}"
    check_frontend_health   = "aws elbv2 describe-target-health --target-group-arn ${aws_lb_target_group.frontend.arn}"
    test_backend_endpoint   = "curl -v https://${aws_lb.main.dns_name}/health"
    test_frontend_endpoint  = "curl -v https://${aws_lb.main.dns_name}/"
    test_api_endpoint       = "curl -v https://${aws_lb.main.dns_name}/api/v1/status"
    view_backend_logs       = "aws logs tail ${aws_cloudwatch_log_group.backend.name} --follow"
    view_frontend_logs      = "aws logs tail ${aws_cloudwatch_log_group.frontend.name} --follow"
    force_backend_redeploy  = "aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.backend.name} --force-new-deployment"
    force_frontend_redeploy = "aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.frontend.name} --force-new-deployment"
  }
}

# Redis Configuration Outputs
output "redis_configuration" {
  description = "Redis configuration details"
  value = {
    mode               = var.redis_mode
    host               = local.redis_config.host
    port               = local.redis_config.port
    auth_enabled       = local.redis_config.auth != ""
    tls_enabled        = local.redis_config.tls
    connection_timeout = var.redis_connection_timeout
    command_timeout    = var.redis_command_timeout
    retry_attempts     = var.redis_retry_attempts
    retry_delay        = var.redis_retry_delay
  }
  sensitive = true
}

# ElastiCache Outputs (only when ElastiCache mode is enabled)
output "elasticache_cluster_id" {
  description = "ID of the ElastiCache Redis cluster"
  value       = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].replication_group_id : null
}

output "elasticache_primary_endpoint" {
  description = "Primary endpoint of the ElastiCache Redis cluster"
  value       = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].primary_endpoint_address : null
}

output "elasticache_configuration_endpoint" {
  description = "Configuration endpoint of the ElastiCache Redis cluster"
  value       = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].configuration_endpoint_address : null
}

output "elasticache_port" {
  description = "Port of the ElastiCache Redis cluster"
  value       = var.redis_mode == "elasticache" ? aws_elasticache_replication_group.main[0].port : null
}

# Redis Connection Information for Applications
output "redis_connection_info" {
  description = "Redis connection information for applications"
  value = {
    connection_string = var.redis_mode == "elasticache" ? "redis://${local.redis_config.host}:${local.redis_config.port}" : var.redis_mode == "embedded" ? "redis://localhost:6379" : "redis://disabled"
    environment_vars = {
      REDIS_MODE               = var.redis_mode
      REDIS_HOST               = local.redis_config.host
      REDIS_PORT               = tostring(local.redis_config.port)
      REDIS_TLS_ENABLED        = tostring(local.redis_config.tls)
      REDIS_CONNECTION_TIMEOUT = tostring(var.redis_connection_timeout)
      REDIS_COMMAND_TIMEOUT    = tostring(var.redis_command_timeout)
      REDIS_RETRY_ATTEMPTS     = tostring(var.redis_retry_attempts)
      REDIS_RETRY_DELAY        = tostring(var.redis_retry_delay)
    }
  }
  sensitive = true
}

# Cost Tracking Information
output "cost_tracking_tags" {
  description = "Cost tracking tags applied to all resources"
  value = {
    CostCenter  = var.cost_center
    Owner       = var.owner
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Redis Cost Estimation
output "redis_cost_estimation" {
  description = "Estimated monthly costs for Redis deployment"
  value = {
    mode = var.redis_mode
    estimated_monthly_cost = var.redis_mode == "elasticache" ? (
      var.redis_node_type == "cache.t3.micro" ? "$12-25" :
      var.redis_node_type == "cache.t3.small" ? "$25-38" :
      var.redis_node_type == "cache.t3.medium" ? "$49-62" :
      "Contact AWS for pricing"
    ) : var.redis_mode == "embedded" ? "$3-6" : "$0"
    cost_components = var.redis_mode == "elasticache" ? [
      "ElastiCache instance cost",
      "Data transfer (Cross-AZ)",
      "Backup storage",
      "CloudWatch metrics"
      ] : var.redis_mode == "embedded" ? [
      "ECS container resource allocation"
    ] : []
  }
}