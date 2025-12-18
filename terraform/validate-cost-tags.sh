#!/bin/bash

# Terraform Cost Tracking Tags Validation Script
# Validates that all AWS resources have proper cost tracking tags

set -e

echo "🏷️  Validating Cost Tracking Tags for Press Release Generator"
echo "============================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if terraform is available
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Terraform not found. Please install Terraform first.${NC}"
    exit 1
fi

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install AWS CLI first.${NC}"
    exit 1
fi

# Check if we're in the terraform directory
if [ ! -f "main.tf" ]; then
    echo -e "${RED}❌ Please run this script from the terraform directory.${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Checking Terraform configuration...${NC}"

# Validate terraform configuration
if ! terraform validate > /dev/null 2>&1; then
    echo -e "${RED}❌ Terraform configuration is invalid. Please fix errors first.${NC}"
    terraform validate
    exit 1
fi

echo -e "${GREEN}✅ Terraform configuration is valid${NC}"

# Check if terraform.tfvars exists
if [ ! -f "terraform.tfvars" ]; then
    echo -e "${YELLOW}⚠️  terraform.tfvars not found. Using default values.${NC}"
    echo -e "${BLUE}💡 Consider copying terraform.tfvars.cost-tracking.example to terraform.tfvars${NC}"
fi

echo -e "${BLUE}🔍 Analyzing resource tags...${NC}"

# Generate terraform plan to analyze tags
echo -e "${BLUE}📊 Generating Terraform plan...${NC}"
terraform plan -out=tagcheck.tfplan > /dev/null 2>&1

# Show terraform plan for tag analysis
terraform show -json tagcheck.tfplan > tagcheck.json

# Check for required cost tracking tags
echo -e "${BLUE}🏷️  Checking for required cost tracking tags...${NC}"

REQUIRED_TAGS=(
    "Project"
    "Environment" 
    "CostCenter"
    "Owner"
    "BusinessUnit"
    "Application"
    "Team"
    "ManagedBy"
    "DataClassification"
    "BackupRequired"
    "MonitoringLevel"
    "AutoShutdown"
)

# Count resources and tags
TOTAL_RESOURCES=0
TAGGED_RESOURCES=0
MISSING_TAGS=0

echo -e "${BLUE}📈 Resource Tag Summary:${NC}"
echo "========================"

# Extract resource information from plan
python3 -c "
import json
import sys

try:
    with open('tagcheck.json', 'r') as f:
        plan = json.load(f)
    
    resources = []
    if 'planned_values' in plan and 'root_module' in plan['planned_values']:
        if 'resources' in plan['planned_values']['root_module']:
            resources = plan['planned_values']['root_module']['resources']
    
    required_tags = ['Project', 'Environment', 'CostCenter', 'Owner', 'BusinessUnit', 'Application', 'Team', 'ManagedBy', 'DataClassification', 'BackupRequired', 'MonitoringLevel', 'AutoShutdown']
    
    total_resources = 0
    tagged_resources = 0
    missing_tags_count = 0
    
    for resource in resources:
        if resource.get('type', '').startswith('aws_'):
            total_resources += 1
            resource_name = f\"{resource.get('type', 'unknown')} {resource.get('name', 'unknown')}\"
            
            tags = resource.get('values', {}).get('tags', {})
            
            if tags:
                tagged_resources += 1
                missing_required = []
                for tag in required_tags:
                    if tag not in tags:
                        missing_required.append(tag)
                
                if missing_required:
                    missing_tags_count += 1
                    print(f'⚠️  {resource_name}: Missing tags: {', '.join(missing_required)}')
                else:
                    print(f'✅ {resource_name}: All required tags present')
            else:
                missing_tags_count += 1
                print(f'❌ {resource_name}: No tags found')
    
    print(f'\\n📊 Summary:')
    print(f'Total AWS Resources: {total_resources}')
    print(f'Resources with Tags: {tagged_resources}')
    print(f'Resources Missing Required Tags: {missing_tags_count}')
    
    if missing_tags_count == 0:
        print('\\n🎉 All resources have proper cost tracking tags!')
        sys.exit(0)
    else:
        print(f'\\n⚠️  {missing_tags_count} resources need tag improvements')
        sys.exit(1)

except Exception as e:
    print(f'Error analyzing tags: {e}')
    sys.exit(1)
" || TAG_CHECK_FAILED=1

# Clean up temporary files
rm -f tagcheck.tfplan tagcheck.json

if [ "$TAG_CHECK_FAILED" = "1" ]; then
    echo -e "${YELLOW}⚠️  Some resources are missing required cost tracking tags${NC}"
    echo -e "${BLUE}💡 Recommendations:${NC}"
    echo "   1. Ensure all resources use merge(local.common_tags, {...}) pattern"
    echo "   2. Update terraform.tfvars with your cost tracking values"
    echo "   3. Review TAGGING_STRATEGY.md for complete guidance"
    echo "   4. Run 'terraform plan' to see tag changes before applying"
    exit 1
else
    echo -e "${GREEN}🎉 All AWS resources have proper cost tracking tags!${NC}"
    echo -e "${BLUE}💰 Cost tracking benefits:${NC}"
    echo "   ✅ Complete cost allocation by team and environment"
    echo "   ✅ Automated compliance and governance tracking"
    echo "   ✅ Cost optimization through auto-shutdown and backup policies"
    echo "   ✅ Detailed cost reporting and chargeback capabilities"
fi

echo -e "${BLUE}📚 Next Steps:${NC}"
echo "   1. Deploy with: terraform apply"
echo "   2. Set up cost alerts in AWS Cost Explorer"
echo "   3. Configure automated cost reports"
echo "   4. Review monthly cost allocation by tags"

echo -e "${GREEN}✅ Cost tracking validation complete!${NC}"