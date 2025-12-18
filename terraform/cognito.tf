# AWS Cognito User Pool for Authentication
# Provides managed user authentication with MFA, password policies, and social login

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  count = var.enable_authentication ? 1 : 0

  name = "${var.project_name}-${var.environment}-users"

  # Username configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = var.cognito_password_policy.minimum_length
    require_lowercase                = var.cognito_password_policy.require_lowercase
    require_uppercase                = var.cognito_password_policy.require_uppercase
    require_numbers                  = var.cognito_password_policy.require_numbers
    require_symbols                  = var.cognito_password_policy.require_symbols
    temporary_password_validity_days = 7
  }

  # MFA configuration
  mfa_configuration = var.enable_mfa ? "OPTIONAL" : "OFF"

  # Software token MFA (TOTP) - only configure when MFA is enabled
  dynamic "software_token_mfa_configuration" {
    for_each = var.enable_mfa ? [1] : []

    content {
      enabled = true
    }
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # User attributes schema
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 5
      max_length = 256
    }
  }

  schema {
    name                     = "name"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Custom attribute for user tier (free, paid, enterprise)
  schema {
    name                     = "tier"
    attribute_data_type      = "String"
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  # Custom attribute for organization
  schema {
    name                     = "organization"
    attribute_data_type      = "String"
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # User pool add-ons
  user_pool_add_ons {
    advanced_security_mode = var.cognito_advanced_security_mode
  }

  # Device configuration
  device_configuration {
    challenge_required_on_new_device      = true
    device_only_remembered_on_user_prompt = true
  }

  # Verification message templates
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your verification code for ${var.project_name}"
    email_message        = "Your verification code is {####}"
  }

  # Admin create user configuration
  admin_create_user_config {
    allow_admin_create_user_only = false

    invite_message_template {
      email_subject = "Welcome to ${var.project_name}"
      email_message = "Your username is {username} and temporary password is {####}"
      sms_message   = "Your username is {username} and temporary password is {####}"
    }
  }

  # User attribute update settings
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  # Deletion protection
  deletion_protection = var.environment == "prod" ? "ACTIVE" : "INACTIVE"

  tags = merge(
    var.common_tags,
    {
      Name        = "${var.project_name}-${var.environment}-user-pool"
      Component   = "authentication"
      Description = "Cognito User Pool for user authentication"
    }
  )
}

# Cognito User Pool Client for ALB
resource "aws_cognito_user_pool_client" "alb" {
  count = var.enable_authentication ? 1 : 0

  name         = "${var.project_name}-${var.environment}-alb-client"
  user_pool_id = aws_cognito_user_pool.main[0].id

  # OAuth configuration for ALB authentication
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  # Callback URLs - ALB OAuth endpoints
  callback_urls = [
    "https://${aws_lb.main.dns_name}/oauth2/idpresponse",
    var.enable_cloudfront && var.deployment_type == "public" ? "https://${aws_cloudfront_distribution.main[0].domain_name}/oauth2/idpresponse" : null
  ]

  # Logout URLs
  logout_urls = [
    "https://${aws_lb.main.dns_name}/logout",
    var.enable_cloudfront && var.deployment_type == "public" ? "https://${aws_cloudfront_distribution.main[0].domain_name}/logout" : null
  ]

  # Token validity
  access_token_validity  = 1  # 1 hour
  id_token_validity      = 1  # 1 hour
  refresh_token_validity = 30 # 30 days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Generate client secret for ALB
  generate_secret = true

  # Read/write attributes
  read_attributes = [
    "email",
    "name",
    "email_verified",
    "custom:tier",
    "custom:organization"
  ]

  write_attributes = [
    "email",
    "name",
    "custom:organization"
  ]

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Enable token revocation
  enable_token_revocation = true

  # Explicit auth flows
  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_CUSTOM_AUTH"
  ]
}

# Cognito User Pool Client for Web Application (direct access)
resource "aws_cognito_user_pool_client" "web" {
  count = var.enable_authentication ? 1 : 0

  name         = "${var.project_name}-${var.environment}-web-client"
  user_pool_id = aws_cognito_user_pool.main[0].id

  # OAuth configuration for web app
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  # Callback URLs for web application
  callback_urls = [
    "https://${aws_lb.main.dns_name}/callback",
    var.enable_cloudfront && var.deployment_type == "public" ? "https://${aws_cloudfront_distribution.main[0].domain_name}/callback" : null,
    "http://localhost:3000/callback" # For local development
  ]

  # Logout URLs
  logout_urls = [
    "https://${aws_lb.main.dns_name}/",
    var.enable_cloudfront && var.deployment_type == "public" ? "https://${aws_cloudfront_distribution.main[0].domain_name}/" : null,
    "http://localhost:3000/" # For local development
  ]

  # Token validity
  access_token_validity  = 1  # 1 hour
  id_token_validity      = 1  # 1 hour
  refresh_token_validity = 30 # 30 days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # No client secret for web app (public client)
  generate_secret = false

  # Read/write attributes
  read_attributes = [
    "email",
    "name",
    "email_verified",
    "custom:tier",
    "custom:organization"
  ]

  write_attributes = [
    "email",
    "name",
    "custom:organization"
  ]

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Enable token revocation
  enable_token_revocation = true

  # Explicit auth flows
  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]
}

# Cognito User Pool Domain
resource "aws_cognito_user_pool_domain" "main" {
  count = var.enable_authentication ? 1 : 0

  domain       = var.cognito_domain_prefix != "" ? var.cognito_domain_prefix : "${var.project_name}-${var.environment}-${random_string.cognito_domain_suffix[0].result}"
  user_pool_id = aws_cognito_user_pool.main[0].id
}

# Random string for unique Cognito domain if not specified
resource "random_string" "cognito_domain_suffix" {
  count = var.enable_authentication && var.cognito_domain_prefix == "" ? 1 : 0

  length  = 8
  special = false
  upper   = false
}

# Cognito User Pool Groups
resource "aws_cognito_user_group" "admins" {
  count = var.enable_authentication ? 1 : 0

  name         = "Admins"
  user_pool_id = aws_cognito_user_pool.main[0].id
  description  = "Administrator users with full access"
  precedence   = 1
}

resource "aws_cognito_user_group" "users" {
  count = var.enable_authentication ? 1 : 0

  name         = "Users"
  user_pool_id = aws_cognito_user_pool.main[0].id
  description  = "Standard users with limited access"
  precedence   = 10
}

resource "aws_cognito_user_group" "enterprise" {
  count = var.enable_authentication ? 1 : 0

  name         = "Enterprise"
  user_pool_id = aws_cognito_user_pool.main[0].id
  description  = "Enterprise tier users with enhanced features"
  precedence   = 5
}

# Store Cognito client secret in Secrets Manager
resource "aws_secretsmanager_secret" "cognito_client_secret" {
  count = var.enable_authentication ? 1 : 0

  name        = "${var.project_name}-${var.environment}-cognito-client-secret"
  description = "Cognito User Pool Client Secret for ALB authentication"

  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = merge(
    var.common_tags,
    {
      Name      = "${var.project_name}-${var.environment}-cognito-client-secret"
      Component = "authentication"
    }
  )
}

resource "aws_secretsmanager_secret_version" "cognito_client_secret" {
  count = var.enable_authentication ? 1 : 0

  secret_id     = aws_secretsmanager_secret.cognito_client_secret[0].id
  secret_string = aws_cognito_user_pool_client.alb[0].client_secret
}

# CloudWatch Log Group for Cognito
resource "aws_cloudwatch_log_group" "cognito" {
  count = var.enable_authentication ? 1 : 0

  name              = "/aws/cognito/${var.project_name}-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = merge(
    var.common_tags,
    {
      Name      = "${var.project_name}-${var.environment}-cognito-logs"
      Component = "authentication"
    }
  )
}

# Cognito Outputs
output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = var.enable_authentication ? aws_cognito_user_pool.main[0].id : null
}

output "cognito_user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = var.enable_authentication ? aws_cognito_user_pool.main[0].arn : null
}

output "cognito_user_pool_endpoint" {
  description = "Endpoint of the Cognito User Pool"
  value       = var.enable_authentication ? aws_cognito_user_pool.main[0].endpoint : null
}

output "cognito_domain" {
  description = "Cognito domain for hosted UI"
  value       = var.enable_authentication ? aws_cognito_user_pool_domain.main[0].domain : null
}

output "cognito_alb_client_id" {
  description = "Client ID for ALB authentication"
  value       = var.enable_authentication ? aws_cognito_user_pool_client.alb[0].id : null
}

output "cognito_web_client_id" {
  description = "Client ID for web application"
  value       = var.enable_authentication ? aws_cognito_user_pool_client.web[0].id : null
}

output "cognito_login_url" {
  description = "URL for Cognito hosted UI login"
  value       = var.enable_authentication ? "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${var.aws_region}.amazoncognito.com/login?client_id=${aws_cognito_user_pool_client.web[0].id}&response_type=code&redirect_uri=${urlencode("https://${aws_lb.main.dns_name}/callback")}" : null
}

output "cognito_logout_url" {
  description = "URL for Cognito logout"
  value       = var.enable_authentication ? "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${var.aws_region}.amazoncognito.com/logout?client_id=${aws_cognito_user_pool_client.web[0].id}&logout_uri=${urlencode("https://${aws_lb.main.dns_name}/")}" : null
}

output "authentication_configuration" {
  description = "Authentication configuration details"
  value = var.enable_authentication ? {
    enabled             = true
    provider            = "cognito"
    user_pool_id        = aws_cognito_user_pool.main[0].id
    domain              = aws_cognito_user_pool_domain.main[0].domain
    mfa_enabled         = var.enable_mfa
    advanced_security   = var.cognito_advanced_security_mode
    password_min_length = var.cognito_password_policy.minimum_length
    groups              = ["Admins", "Users", "Enterprise"]
    login_url           = "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${var.aws_region}.amazoncognito.com/login"
    logout_url          = "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${var.aws_region}.amazoncognito.com/logout"
    } : {
    enabled             = false
    provider            = "none"
    user_pool_id        = null
    domain              = null
    mfa_enabled         = false
    advanced_security   = "OFF"
    password_min_length = 0
    groups              = []
    login_url           = null
    logout_url          = null
  }
}