#!/bin/bash
# Pre-Deployment Validation Script
# Validates Terraform configuration before deployment
# Prevents deployment issues by checking critical environment variables and IAM permissions

set -e

echo "🔍 Terraform Pre-Deployment Validation"
echo "======================================"

# Check 1: Critical environment variables present
echo ""
echo "📋 Checking critical environment variables..."
CRITICAL_VARS=(
  "STORAGE_TYPE"
  "S3_CONTENT_BUCKET"
  "S3_KEY_PREFIX"
  "PRESIGNED_URL_EXPIRATION"
  "AWS_REGION"
  "DATA_LINEAGE_ENABLED"
  "DATA_LINEAGE_LOG_LEVEL"
  "DATA_LINEAGE_MAX_LOG_FILES"
  "DATA_LINEAGE_MAX_LOG_SIZE"
  "DATA_LINEAGE_PERSIST_EVENTS"
  "DATA_LINEAGE_RETENTION_DAYS"
  "DATA_LINEAGE_ERROR_THRESHOLD"
  "DATA_LINEAGE_CLEANUP_INTERVAL"
)
MISSING_VARS=()

for var in "${CRITICAL_VARS[@]}"; do
  if ! grep -q "name.*=.*\"$var\"" terraform/main.tf; then
    echo "❌ MISSING: $var"
    MISSING_VARS+=("$var")
  else
    echo "✅ Found: $var"
  fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
  echo ""
  echo "❌ VALIDATION FAILED: ${#MISSING_VARS[@]} critical variables missing"
  exit 1
fi

# Check 2: S3 IAM permissions
echo ""
echo "🔐 Checking S3 IAM permissions..."
S3_PERMS=("s3:ListBucket" "s3:GetObject" "s3:PutObject" "s3:GetBucketLocation" "s3:ListBucketVersions")
MISSING_PERMS=()

for perm in "${S3_PERMS[@]}"; do
  if ! grep -q "$perm" terraform/main.tf; then
    echo "❌ MISSING: $perm"
    MISSING_PERMS+=("$perm")
  else
    echo "✅ Found: $perm"
  fi
done

if [ ${#MISSING_PERMS[@]} -ne 0 ]; then
  echo ""
  echo "❌ VALIDATION FAILED: ${#MISSING_PERMS[@]} S3 permissions missing"
  exit 1
fi

# Check 3: CloudWatch Logs IAM permissions
echo ""
echo "📊 Checking CloudWatch Logs IAM permissions..."
LOGS_PERMS=("logs:CreateLogStream" "logs:PutLogEvents")
MISSING_LOGS_PERMS=()

for perm in "${LOGS_PERMS[@]}"; do
  if ! grep -q "$perm" terraform/main.tf; then
    echo "❌ MISSING: $perm"
    MISSING_LOGS_PERMS+=("$perm")
  else
    echo "✅ Found: $perm"
  fi
done

if [ ${#MISSING_LOGS_PERMS[@]} -ne 0 ]; then
  echo ""
  echo "❌ VALIDATION FAILED: ${#MISSING_LOGS_PERMS[@]} CloudWatch Logs permissions missing"
  exit 1
fi

# Check 4: Redis configuration variables (if Redis is enabled)
echo ""
echo "🔄 Checking Redis configuration variables..."
REDIS_VARS=(
  "REDIS_HOST"
  "REDIS_PORT"
  "REDIS_DB"
  "REDIS_CONNECTION_TIMEOUT"
  "REDIS_COMMAND_TIMEOUT"
  "REDIS_RETRY_ATTEMPTS"
  "REDIS_RETRY_DELAY"
)
MISSING_REDIS_VARS=()

for var in "${REDIS_VARS[@]}"; do
  if ! grep -q "name.*=.*\"$var\"" terraform/main.tf; then
    echo "⚠️  MISSING: $var (may be optional depending on redis_mode)"
    MISSING_REDIS_VARS+=("$var")
  else
    echo "✅ Found: $var"
  fi
done

# Redis vars are optional, so just warn but don't fail
if [ ${#MISSING_REDIS_VARS[@]} -ne 0 ]; then
  echo ""
  echo "⚠️  WARNING: ${#MISSING_REDIS_VARS[@]} Redis variables missing (acceptable if redis_mode=none)"
fi

# Check 5: Terraform validation
echo ""
echo "🏗️  Running terraform validate..."
cd terraform
terraform fmt -check || (echo "⚠️  Running terraform fmt..." && terraform fmt)
terraform validate

if [ $? -ne 0 ]; then
  echo "❌ Terraform validation failed"
  exit 1
fi

cd ..

echo ""
echo "✅ All pre-deployment validation checks passed!"
echo "✅ Safe to proceed with terraform apply"
echo ""
echo "Next steps:"
echo "  1. cd terraform"
echo "  2. AWS_PROFILE=your-aws-profile terraform plan -out=tfplan"
echo "  3. Review the plan carefully"
echo "  4. AWS_PROFILE=your-aws-profile terraform apply tfplan"