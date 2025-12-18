# Variables for Press Release Generator Terraform Infrastructure

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "press-release-generator"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-west-2"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# CORS Configuration Variables
variable "frontend_url" {
  description = "Frontend URL for CORS configuration"
  type        = string
  default     = ""
}

variable "cors_allowed_origins" {
  description = "Comma-separated list of allowed CORS origins"
  type        = string
  default     = "https://*.cloudfront.net,https://*.elb.amazonaws.com,https://*.execute-api.amazonaws.com"
}

variable "cors_domain_pattern" {
  description = "Regex pattern for allowed CORS domains"
  type        = string
  default     = "^https://[a-z0-9-]+\\.(cloudfront\\.net|elb\\.[a-z0-9-]+\\.amazonaws\\.com|execute-api\\.[a-z0-9-]+\\.amazonaws\\.com)$"
}

variable "cors_credentials" {
  description = "Whether to allow credentials in CORS requests"
  type        = bool
  default     = true
}

variable "cors_max_age" {
  description = "Maximum age for CORS preflight cache (seconds)"
  type        = number
  default     = 86400
}

# Application Configuration
variable "backend_image" {
  description = "Docker image for backend service (will be replaced with ECR URL after deployment)"
  type        = string
  default     = "nginx:alpine" # Placeholder - will be replaced with ECR repository URL
}

variable "frontend_image" {
  description = "Docker image for frontend service (will be replaced with ECR URL after deployment)"
  type        = string
  default     = "nginx:alpine" # Placeholder - will be replaced with ECR repository URL
}

variable "ecr_image_tag" {
  description = "Tag for ECR images"
  type        = string
  default     = "latest"
}

variable "ecr_lifecycle_policy" {
  description = "Lifecycle policy for ECR repositories"
  type        = string
  default     = <<EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    },
    {
      "rulePriority": 2,
      "description": "Delete untagged images older than 1 day",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 1
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF
}

variable "backend_cpu" {
  description = "CPU units for backend service"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Memory (MB) for backend service"
  type        = number
  default     = 1024
}

variable "frontend_cpu" {
  description = "CPU units for frontend service"
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Memory (MB) for frontend service"
  type        = number
  default     = 512
}

variable "backend_desired_count" {
  description = "Desired number of backend tasks"
  type        = number
  default     = 2
}

variable "frontend_desired_count" {
  description = "Desired number of frontend tasks"
  type        = number
  default     = 2
}

# Auto Scaling Configuration
variable "backend_min_capacity" {
  description = "Minimum number of backend tasks"
  type        = number
  default     = 1
}

variable "backend_max_capacity" {
  description = "Maximum number of backend tasks"
  type        = number
  default     = 10
}

variable "frontend_min_capacity" {
  description = "Minimum number of frontend tasks"
  type        = number
  default     = 1
}

variable "frontend_max_capacity" {
  description = "Maximum number of frontend tasks"
  type        = number
  default     = 5
}

# Database Configuration
variable "enable_dynamodb" {
  description = "Whether to create DynamoDB tables"
  type        = bool
  default     = true
}

# Redis Configuration Variables
variable "redis_mode" {
  description = "Redis deployment mode: 'none' (no Redis), 'embedded' (Redis in container), 'elasticache' (AWS ElastiCache)"
  type        = string
  default     = "embedded"

  validation {
    condition     = contains(["none", "embedded", "elasticache"], var.redis_mode)
    error_message = "Redis mode must be one of: none, embedded, elasticache."
  }
}

variable "redis_node_type" {
  description = "ElastiCache node type (only used when redis_mode = 'elasticache')"
  type        = string
  default     = "cache.t3.micro"

  validation {
    condition     = can(regex("^cache\\.(t3|t4g|m6g|r6g|r7g)\\.(micro|small|medium|large|xlarge|2xlarge)$", var.redis_node_type))
    error_message = "Redis node type must be a valid ElastiCache instance type."
  }
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the Redis cluster"
  type        = number
  default     = 1

  validation {
    condition     = var.redis_num_cache_nodes >= 1 && var.redis_num_cache_nodes <= 6
    error_message = "Number of cache nodes must be between 1 and 6."
  }
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "redis_snapshot_retention_limit" {
  description = "Number of days to retain Redis snapshots"
  type        = number
  default     = 1

  validation {
    condition     = var.redis_snapshot_retention_limit >= 0 && var.redis_snapshot_retention_limit <= 35
    error_message = "Snapshot retention limit must be between 0 and 35 days."
  }
}

variable "redis_snapshot_window" {
  description = "Daily time range for Redis snapshots (UTC)"
  type        = string
  default     = "03:00-05:00"

  validation {
    condition     = can(regex("^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$", var.redis_snapshot_window))
    error_message = "Snapshot window must be in format HH:MM-HH:MM (24-hour UTC)."
  }
}

variable "redis_maintenance_window" {
  description = "Weekly maintenance window for Redis (UTC)"
  type        = string
  default     = "sun:05:00-sun:06:00"

  validation {
    condition     = can(regex("^(sun|mon|tue|wed|thu|fri|sat):[0-2][0-9]:[0-5][0-9]-(sun|mon|tue|wed|thu|fri|sat):[0-2][0-9]:[0-5][0-9]$", var.redis_maintenance_window))
    error_message = "Maintenance window must be in format ddd:HH:MM-ddd:HH:MM (24-hour UTC)."
  }
}

variable "redis_encryption_at_rest" {
  description = "Enable encryption at rest for Redis"
  type        = bool
  default     = true
}

variable "redis_encryption_in_transit" {
  description = "Enable encryption in transit for Redis"
  type        = bool
  default     = true
}

variable "redis_auth_token" {
  description = "Auth token for Redis (leave empty for no auth)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "redis_connection_timeout" {
  description = "Redis connection timeout in milliseconds"
  type        = number
  default     = 5000

  validation {
    condition     = var.redis_connection_timeout >= 1000 && var.redis_connection_timeout <= 30000
    error_message = "Connection timeout must be between 1000 and 30000 milliseconds."
  }
}

variable "redis_command_timeout" {
  description = "Redis command timeout in milliseconds"
  type        = number
  default     = 3000

  validation {
    condition     = var.redis_command_timeout >= 1000 && var.redis_command_timeout <= 30000
    error_message = "Command timeout must be between 1000 and 30000 milliseconds."
  }
}

variable "redis_retry_attempts" {
  description = "Number of retry attempts for Redis operations"
  type        = number
  default     = 3

  validation {
    condition     = var.redis_retry_attempts >= 1 && var.redis_retry_attempts <= 10
    error_message = "Retry attempts must be between 1 and 10."
  }
}

variable "redis_retry_delay" {
  description = "Delay between Redis retry attempts in milliseconds"
  type        = number
  default     = 1000

  validation {
    condition     = var.redis_retry_delay >= 100 && var.redis_retry_delay <= 10000
    error_message = "Retry delay must be between 100 and 10000 milliseconds."
  }
}

# Cost Tracking Variables
variable "cost_center" {
  description = "Cost center for resource billing and tracking"
  type        = string
  default     = "engineering"
}

variable "owner" {
  description = "Owner of the resources for cost tracking and management"
  type        = string
  default     = "devops-team"
}

variable "business_unit" {
  description = "Business unit responsible for the resources"
  type        = string
  default     = "product-engineering"
}

variable "application" {
  description = "Application name for resource grouping"
  type        = string
  default     = "press-release-generator"
}

variable "team" {
  description = "Team responsible for maintaining the resources"
  type        = string
  default     = "platform-team"
}

variable "backup_required" {
  description = "Whether resources require backup (for cost optimization)"
  type        = string
  default     = "yes"

  validation {
    condition     = contains(["yes", "no"], var.backup_required)
    error_message = "Backup required must be either 'yes' or 'no'."
  }
}

variable "monitoring_level" {
  description = "Level of monitoring required (basic, standard, enhanced)"
  type        = string
  default     = "standard"

  validation {
    condition     = contains(["basic", "standard", "enhanced"], var.monitoring_level)
    error_message = "Monitoring level must be one of: basic, standard, enhanced."
  }
}

variable "data_classification" {
  description = "Data classification level (public, internal, confidential, restricted)"
  type        = string
  default     = "internal"

  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "Data classification must be one of: public, internal, confidential, restricted."
  }
}

variable "auto_shutdown" {
  description = "Whether resources can be automatically shut down for cost savings"
  type        = string
  default     = "no"

  validation {
    condition     = contains(["yes", "no"], var.auto_shutdown)
    error_message = "Auto shutdown must be either 'yes' or 'no'."
  }
}

# Legacy variable for backward compatibility
variable "enable_redis" {
  description = "DEPRECATED: Use redis_mode instead. Whether to create Redis cluster"
  type        = bool
  default     = null
}
variable "redis_auto_minor_version_upgrade" {
  description = "Specifies whether minor version engine upgrades will be applied automatically to the underlying Cache Cluster instances during the maintenance window"
  type        = bool
  default     = true
}

# Additional variables referenced in terraform.tfvars.ia-admin
variable "use_spot_instances" {
  description = "Whether to use spot instances for ECS tasks"
  type        = bool
  default     = false
}

variable "enable_cloudwatch_dashboard" {
  description = "Whether to create CloudWatch dashboard"
  type        = bool
  default     = true
}


# Storage Configuration
variable "s3_bucket_prefix" {
  description = "Prefix for S3 bucket names"
  type        = string
  default     = ""
}

variable "enable_s3_versioning" {
  description = "Whether to enable S3 versioning"
  type        = bool
  default     = true
}

# CloudFront Configuration
variable "enable_cloudfront" {
  description = "Whether to create CloudFront distribution"
  type        = bool
  default     = true
}

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.cloudfront_price_class)
    error_message = "CloudFront price class must be one of: PriceClass_All, PriceClass_200, PriceClass_100."
  }
}

# Deployment Configuration
variable "deployment_type" {
  description = "Deployment type: 'internal' for VPC-only access (default) or 'public' for internet-facing"
  type        = string
  default     = "internal"

  validation {
    condition     = contains(["public", "internal"], var.deployment_type)
    error_message = "Deployment type must be either 'public' or 'internal'."
  }
}

variable "allowed_cidr_blocks_internal" {
  description = "CIDR blocks allowed to access internal deployment (e.g., VPC CIDR, office IPs)"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

# SSL/TLS Configuration
variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate for HTTPS"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Custom domain name for the application"
  type        = string
  default     = ""
}

# Monitoring Configuration
variable "enable_monitoring" {
  description = "Whether to enable CloudWatch monitoring"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

# Security Configuration
variable "enable_waf" {
  description = "Whether to enable AWS WAF"
  type        = bool
  default     = false
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the application"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# Environment Variables for Applications
variable "backend_environment_variables" {
  description = "Additional environment variables for backend"
  type        = map(string)
  default     = {}
}

variable "frontend_environment_variables" {
  description = "Additional environment variables for frontend"
  type        = map(string)
  default     = {}
}

# Secrets Configuration
variable "firecrawl_api_key_secret_arn" {
  description = "ARN of secret containing Firecrawl API key"
  type        = string
  default     = ""
}

variable "perplexity_api_key_secret_arn" {
  description = "ARN of secret containing Perplexity API key"
  type        = string
  default     = ""
}

variable "tavily_api_key_secret_arn" {
  description = "ARN of secret containing Tavily API key"
  type        = string
  default     = ""
}

variable "aws_bedrock_model_id" {
  description = "AWS Bedrock Claude Sonnet 4.5 model ID"
  type        = string
  default     = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "bedrock_max_input_tokens" {
  description = "Maximum input tokens for Bedrock model (Claude Sonnet 4.5: 1M)"
  type        = number
  default     = 1000000

  validation {
    condition     = var.bedrock_max_input_tokens >= 100000 && var.bedrock_max_input_tokens <= 1000000
    error_message = "Bedrock max input tokens must be between 100000 and 1000000."
  }
}

variable "bedrock_max_output_tokens" {
  description = "Maximum output tokens for Bedrock model (Claude Sonnet 4.5: 64k)"
  type        = number
  default     = 64000

  validation {
    condition     = var.bedrock_max_output_tokens >= 1000 && var.bedrock_max_output_tokens <= 64000
    error_message = "Bedrock max output tokens must be between 1000 and 64000."
  }
}

# Strands Framework Configuration
variable "enable_strands" {
  description = "Whether to enable Strands framework integration"
  type        = bool
  default     = true # Changed from false to true - STRANDS now mandatory
}

variable "strands_api_key_secret_arn" {
  description = "ARN of secret containing Strands API key"
  type        = string
  default     = ""
}

variable "strands_log_level" {
  description = "Log level for Strands framework"
  type        = string
  default     = "info"

  validation {
    condition     = contains(["debug", "info", "warn", "error"], var.strands_log_level)
    error_message = "Strands log level must be one of: debug, info, warn, error."
  }
}

variable "strands_node_timeout" {
  description = "Timeout for individual Strands nodes in milliseconds"
  type        = number
  default     = 120000

  validation {
    condition     = var.strands_node_timeout >= 30000 && var.strands_node_timeout <= 600000
    error_message = "Strands node timeout must be between 30000 and 600000 milliseconds."
  }
}

variable "strands_graph_timeout" {
  description = "Timeout for complete Strands graph execution in milliseconds"
  type        = number
  default     = 600000

  validation {
    condition     = var.strands_graph_timeout >= 120000 && var.strands_graph_timeout <= 1800000
    error_message = "Strands graph timeout must be between 120000 and 1800000 milliseconds."
  }
}

variable "strands_max_node_executions" {
  description = "Maximum number of node executions in Strands graph"
  type        = number
  default     = 50

  validation {
    condition     = var.strands_max_node_executions >= 10 && var.strands_max_node_executions <= 200
    error_message = "Strands max node executions must be between 10 and 200."
  }
}

variable "strands_python_version" {
  description = "Python version for Strands SDK"
  type        = string
  default     = "3.11"

  validation {
    condition     = contains(["3.9", "3.10", "3.11", "3.12"], var.strands_python_version)
    error_message = "Strands Python version must be one of: 3.9, 3.10, 3.11, 3.12."
  }
}

variable "strands_orchestration_pattern" {
  description = "Default Strands orchestration pattern"
  type        = string
  default     = "adaptive_hybrid"

  validation {
    condition     = contains(["conditional", "swarm", "nested", "adaptive_hybrid", "parallel_hybrid", "sequential_hybrid"], var.strands_orchestration_pattern)
    error_message = "Strands orchestration pattern must be one of: conditional, swarm, nested, adaptive_hybrid, parallel_hybrid, sequential_hybrid."
  }
}

variable "strands_performance_mode" {
  description = "Default Strands performance mode"
  type        = string
  default     = "balanced"

  validation {
    condition     = contains(["fast", "balanced", "quality", "comprehensive"], var.strands_performance_mode)
    error_message = "Strands performance mode must be one of: fast, balanced, quality, comprehensive."
  }
}

variable "strands_enable_hybrid_orchestration" {
  description = "Enable Strands hybrid orchestration capabilities"
  type        = bool
  default     = true
}

variable "strands_enable_performance_optimizer" {
  description = "Enable Strands performance optimizer"
  type        = bool
  default     = true
}

variable "strands_enable_enterprise_security" {
  description = "Enable Strands enterprise security features"
  type        = bool
  default     = true
}

# Performance Comparison Configuration - REMOVED
# Comparison feature removed as only sequential_hybrid pattern was implemented

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}



# VPC Endpoints Configuration
variable "enable_vpc_endpoints" {
  description = "Whether to enable VPC endpoints"
  type        = bool
  default     = false
}


# Additional missing variables for ia-admin deployment
variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "enable_alerting" {
  description = "Enable CloudWatch alerting"
  type        = bool
  default     = true
}

variable "enable_auto_scaling" {
  description = "Enable auto scaling for ECS services"
  type        = bool
  default     = true
}

variable "enable_backup" {
  description = "Enable backup functionality"
  type        = bool
  default     = true
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for databases"
  type        = bool
  default     = true
}

variable "enable_scheduled_scaling" {
  description = "Enable scheduled scaling for ECS services"
  type        = bool
  default     = false
}

variable "health_check_grace_period" {
  description = "Health check grace period in seconds"
  type        = number
  default     = 300
}

variable "health_check_healthy_threshold" {
  description = "Number of consecutive health checks successes required"
  type        = number
  default     = 2
}

variable "health_check_interval" {
  description = "Health check interval in seconds"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Health check timeout in seconds"
  type        = number
  default     = 5
}

variable "health_check_unhealthy_threshold" {
  description = "Number of consecutive health check failures required"
  type        = number
  default     = 3
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "redis_parameter_group_name" {
  description = "Redis parameter group name"
  type        = string
  default     = "default.redis7"
}

variable "redis_port" {
  description = "Redis port number"
  type        = number
  default     = 6379
}

variable "scale_down_threshold" {
  description = "CPU threshold for scaling down"
  type        = number
  default     = 30
}

variable "scale_up_threshold" {
  description = "CPU threshold for scaling up"
  type        = number
  default     = 70
}

variable "scaling_cooldown" {
  description = "Scaling cooldown period in seconds"
  type        = number
  default     = 300
}

# ============================================================================
# Authentication Configuration Variables
# ============================================================================

variable "enable_authentication" {
  description = "Enable authentication for the application (default: true for production)"
  type        = bool
  default     = true
}

variable "auth_mode" {
  description = "Authentication mode: cognito, api-key, jwt, oauth, hybrid, none"
  type        = string
  default     = "cognito"

  validation {
    condition     = contains(["cognito", "api-key", "jwt", "oauth", "hybrid", "none"], var.auth_mode)
    error_message = "Auth mode must be one of: cognito, api-key, jwt, oauth, hybrid, none."
  }
}

variable "require_auth_override_confirmation" {
  description = "Require explicit confirmation to disable authentication in production"
  type        = bool
  default     = true
}

# Cognito Configuration
variable "cognito_domain_prefix" {
  description = "Domain prefix for Cognito hosted UI (leave empty for auto-generated)"
  type        = string
  default     = ""
}

variable "enable_mfa" {
  description = "Enable Multi-Factor Authentication for Cognito"
  type        = bool
  default     = false
}

variable "cognito_password_policy" {
  description = "Password policy for Cognito User Pool"
  type = object({
    minimum_length    = number
    require_lowercase = bool
    require_uppercase = bool
    require_numbers   = bool
    require_symbols   = bool
  })
  default = {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
}

variable "cognito_advanced_security_mode" {
  description = "Advanced security mode for Cognito: OFF, AUDIT, ENFORCED"
  type        = string
  default     = "AUDIT"

  validation {
    condition     = contains(["OFF", "AUDIT", "ENFORCED"], var.cognito_advanced_security_mode)
    error_message = "Cognito advanced security mode must be one of: OFF, AUDIT, ENFORCED."
  }
}

# Common tags variable (if not already defined)
variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
