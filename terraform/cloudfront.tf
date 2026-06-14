# CloudFront Distribution for Public Deployments
# This file contains CloudFront configuration for public-facing deployments

resource "aws_cloudfront_distribution" "main" {
  count = var.deployment_type == "public" && var.enable_cloudfront ? 1 : 0

  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "${local.name_prefix}-alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # Changed from https-only to avoid SSL certificate issues with ALB self-signed cert
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} ${var.environment} CloudFront Distribution"
  default_root_object = "index.html"

  # Cache behavior for API endpoints
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "${local.name_prefix}-alb-origin"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Content-Type", "Origin", "Accept"]

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
    compress               = true
  }

  # Default cache behavior for static content
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "${local.name_prefix}-alb-origin"

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # Geographic restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL Certificate configuration
  # CloudFront requires certificates in us-east-1, so we use cloudfront_default_certificate for self-signed
  viewer_certificate {
    cloudfront_default_certificate = var.ssl_certificate_arn == "" && var.domain_name == ""
    acm_certificate_arn            = var.ssl_certificate_arn != "" || var.domain_name != "" ? local.certificate_arn : null
    ssl_support_method             = var.ssl_certificate_arn != "" || var.domain_name != "" ? "sni-only" : null
    minimum_protocol_version       = var.ssl_certificate_arn != "" || var.domain_name != "" ? "TLSv1.2_2021" : "TLSv1"
  }

  # Custom error pages
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cloudfront"
    Type = "cdn"
  })
}

# CloudFront Origin Access Control for S3 (if needed in future)
resource "aws_cloudfront_origin_access_control" "main" {
  count = var.deployment_type == "public" && var.enable_cloudfront ? 1 : 0

  name                              = "${local.name_prefix}-oac"
  description                       = "Origin Access Control for ${var.project_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}