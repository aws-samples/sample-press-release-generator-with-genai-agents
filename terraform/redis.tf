# Redis/ElastiCache Infrastructure with Deployment-Time Choice
# Supports both embedded Redis (default) and ElastiCache modes

# ElastiCache Subnet Group (only created when ElastiCache mode is enabled)
resource "aws_elasticache_subnet_group" "main" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(
    {
      Name       = "${local.name_prefix}-redis-subnet-group"
      Component  = "redis"
      RedisMode  = "elasticache"
      CostCenter = var.cost_center
      Owner      = var.owner
      Purpose    = "redis-caching"
    },
    var.additional_tags
  )
}

# ElastiCache Security Group (only created when ElastiCache mode is enabled)
resource "aws_security_group" "elasticache" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  name_prefix = "${local.name_prefix}-elasticache-"
  vpc_id      = aws_vpc.main.id
  description = "Security group for ElastiCache Redis cluster"

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    {
      Name       = "${local.name_prefix}-elasticache-sg"
      Component  = "redis"
      RedisMode  = "elasticache"
      CostCenter = var.cost_center
      Owner      = var.owner
      Purpose    = "redis-security"
    },
    var.additional_tags
  )
}

# ElastiCache Parameter Group (only created when ElastiCache mode is enabled)
resource "aws_elasticache_parameter_group" "main" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  family = "redis7"
  name   = "${local.name_prefix}-redis-params"

  # Optimized parameters for press release generation workload
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "60"
  }

  tags = merge(
    {
      Name       = "${local.name_prefix}-redis-params"
      Component  = "redis"
      RedisMode  = "elasticache"
      CostCenter = var.cost_center
      Owner      = var.owner
      Purpose    = "redis-configuration"
    },
    var.additional_tags
  )
}

# ElastiCache Redis Cluster (only created when ElastiCache mode is enabled)
resource "aws_elasticache_replication_group" "main" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  replication_group_id = "${local.name_prefix}-redis"
  description          = "Redis cluster for ${var.project_name} ${var.environment}"

  # Instance configuration
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.main[0].name

  # Cluster configuration
  num_cache_clusters = var.redis_num_cache_nodes

  # Network configuration
  subnet_group_name  = aws_elasticache_subnet_group.main[0].name
  security_group_ids = [aws_security_group.elasticache[0].id]

  # Backup and maintenance
  snapshot_retention_limit = var.redis_snapshot_retention_limit
  snapshot_window          = var.redis_snapshot_window
  maintenance_window       = var.redis_maintenance_window

  # Security
  at_rest_encryption_enabled = var.redis_encryption_at_rest
  transit_encryption_enabled = var.redis_encryption_in_transit
  auth_token                 = var.redis_auth_token != "" ? var.redis_auth_token : null

  # Engine configuration
  engine_version             = var.redis_engine_version
  auto_minor_version_upgrade = var.redis_auto_minor_version_upgrade

  # Notification
  notification_topic_arn = aws_sns_topic.alerts.arn

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis[0].name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  # Custom timeouts for ElastiCache operations (ElastiCache takes 10-15 minutes to create)
  timeouts {
    create = "20m" # 20 minutes for creation
    update = "20m" # 20 minutes for updates
    delete = "15m" # 15 minutes for deletion
  }

  tags = merge(
    {
      Name        = "${local.name_prefix}-redis-cluster"
      Component   = "redis"
      RedisMode   = "elasticache"
      CostCenter  = var.cost_center
      Owner       = var.owner
      Purpose     = "redis-caching"
      Environment = var.environment
      Project     = var.project_name
    },
    var.additional_tags
  )
}

# CloudWatch Log Group for Redis (only created when ElastiCache mode is enabled)
resource "aws_cloudwatch_log_group" "redis" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  name              = "/aws/elasticache/${local.name_prefix}-redis"
  retention_in_days = var.log_retention_days

  tags = merge(
    {
      Name       = "${local.name_prefix}-redis-logs"
      Component  = "redis"
      RedisMode  = "elasticache"
      CostCenter = var.cost_center
      Owner      = var.owner
      Purpose    = "redis-logging"
    },
    var.additional_tags
  )
}

# ElastiCache CloudWatch Alarms (only created when ElastiCache mode is enabled)
resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main[0].replication_group_id}-001"
  }

  tags = merge(
    {
      Name       = "${local.name_prefix}-redis-cpu-alarm"
      Component  = "redis"
      RedisMode  = "elasticache"
      CostCenter = var.cost_center
      Owner      = var.owner
      Purpose    = "redis-monitoring"
    },
    var.additional_tags
  )
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_high" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "85"
  alarm_description   = "This metric monitors Redis memory utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main[0].replication_group_id}-001"
  }

  tags = merge(
    {
      Name       = "${local.name_prefix}-redis-memory-alarm"
      Component  = "redis"
      RedisMode  = "elasticache"
      CostCenter = var.cost_center
      Owner      = var.owner
      Purpose    = "redis-monitoring"
    },
    var.additional_tags
  )
}

resource "aws_cloudwatch_metric_alarm" "redis_connections_high" {
  count = var.redis_mode == "elasticache" ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "50"
  alarm_description   = "This metric monitors Redis connection count"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main[0].replication_group_id}-001"
  }

  tags = merge(
    {
      Name       = "${local.name_prefix}-redis-connections-alarm"
      Component  = "redis"
      RedisMode  = "elasticache"
      CostCenter = var.cost_center
      Owner      = var.owner
      Purpose    = "redis-monitoring"
    },
    var.additional_tags
  )
}

# Note: redis_config local value is defined in main.tf to avoid duplication
# Enhanced backend environment variables are also defined in main.tf