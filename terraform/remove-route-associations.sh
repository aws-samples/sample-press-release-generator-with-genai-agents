#!/bin/bash
set -e

echo "=== Removing Route Table Associations from Terraform State ===" 

# Remove all route table associations from state
terraform state rm 'aws_route_table_association.public[0]' 2>/dev/null || echo "public[0] not in state"
terraform state rm 'aws_route_table_association.public[1]' 2>/dev/null || echo "public[1] not in state"
terraform state rm 'aws_route_table_association.private[0]' 2>/dev/null || echo "private[0] not in state"
terraform state rm 'aws_route_table_association.private[1]' 2>/dev/null || echo "private[1] not in state"

echo "=== Associations removed from state ===" 
echo "Now terraform will skip creating them since they already exist"
