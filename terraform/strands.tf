# Strands Framework Infrastructure Configuration
# STRANDS is now mandatory - always deployed

# CloudWatch Log Group for Strands Framework (mandatory)
resource "aws_cloudwatch_log_group" "strands" {
  name              = "/aws/ecs/${local.name_prefix}-strands"
  retention_in_days = 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-strands-logs"
    Type = "logging"
  })
}

# Strands Framework IAM Policy for ECS Tasks (mandatory)
resource "aws_iam_role_policy" "ecs_task_strands" {
  name = "${local.name_prefix}-ecs-task-strands-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          aws_cloudwatch_log_group.strands.arn,
          "${aws_cloudwatch_log_group.strands.arn}:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "Custom/StrandsFramework"
          }
        }
      }
    ]
  })
}

# Strands Framework Custom Metrics Dashboard Widget (mandatory)
locals {
  strands_dashboard_widget = [
    {
      type   = "metric"
      x      = 0
      y      = 30
      width  = 6
      height = 6

      properties = {
        metrics = [
          ["Custom/StrandsFramework", "StrandsNodeExecutions"],
          [".", "StrandsNodeTimeouts"],
          [".", "StrandsNodeSuccesses"],
          [".", "StrandsNodeFailures"]
        ]
        view    = "timeSeries"
        stacked = false
        region  = var.aws_region
        title   = "Strands Node Performance"
        period  = 300
      }
    },
    {
      type   = "metric"
      x      = 6
      y      = 30
      width  = 6
      height = 6

      properties = {
        metrics = [
          ["Custom/StrandsFramework", "StrandsGraphExecutions"],
          [".", "StrandsGraphFailures"],
          [".", "StrandsGraphExecutionTime"]
        ]
        view    = "timeSeries"
        stacked = false
        region  = var.aws_region
        title   = "Strands Graph Performance"
        period  = 300
      }
    }
  ]
}

# Strands Framework Log Insights Queries (mandatory)
# resource "aws_cloudwatch_query_definition" "strands_node_performance" {
#   name = "${local.name_prefix}-strands-node-performance"
# 
#   log_group_names = [
#     aws_cloudwatch_log_group.strands.name
#   ]
# 
#   query_string = <<EOF
# fields @timestamp, @message
# | filter @message like /StrandsNode/ or @message like /NodeExecution/
# | stats count() by bin(5m), @message
# | sort @timestamp desc
# | limit 100
# EOF
# }

# resource "aws_cloudwatch_query_definition" "strands_graph_execution" {
#   name = "${local.name_prefix}-strands-graph-execution"
# 
#   log_group_names = [
#     aws_cloudwatch_log_group.strands.name
#   ]
# 
#   query_string = <<EOF
# fields @timestamp, @message
# | filter @message like /StrandsGraph/ or @message like /GraphExecution/
# | stats avg(duration) by bin(5m)
# | sort @timestamp desc
# | limit 50
# EOF
# }

# Strands Framework Configuration Validation (mandatory)
resource "aws_cloudwatch_metric_alarm" "strands_configuration_errors" {
  alarm_name          = "${local.name_prefix}-strands-config-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "StrandsConfigurationErrors"
  namespace           = "Custom/StrandsFramework"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors Strands configuration errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-strands-config-alarm"
    Component = "strands"
    Purpose   = "strands-configuration-monitoring"
  })
}

# Output Strands configuration for reference (mandatory)
output "strands_configuration" {
  description = "Strands framework configuration summary"
  value = {
    enabled             = var.enable_strands
    log_level           = var.strands_log_level
    node_timeout        = var.strands_node_timeout
    graph_timeout       = var.strands_graph_timeout
    max_node_executions = var.strands_max_node_executions
    python_version      = var.strands_python_version
    log_group_name      = aws_cloudwatch_log_group.strands.name
    monitoring_enabled  = true
  }
}