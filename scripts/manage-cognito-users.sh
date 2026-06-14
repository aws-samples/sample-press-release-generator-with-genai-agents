#!/bin/bash

# Cognito User Management Utility
# Manage users in AWS Cognito User Pool

set -e

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/terraform"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get Cognito User Pool ID from Terraform output
get_user_pool_id() {
    cd "$TERRAFORM_DIR"
    USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null)
    
    if [[ -z "$USER_POOL_ID" || "$USER_POOL_ID" == "null" ]]; then
        log_error "Could not retrieve Cognito User Pool ID from Terraform"
        log_error "Make sure authentication is enabled and infrastructure is deployed"
        exit 1
    fi
    
    echo "$USER_POOL_ID"
}

# Usage function
usage() {
    cat << EOF
Usage: $0 COMMAND [OPTIONS]

Manage users in AWS Cognito User Pool for Press Release Generator

COMMANDS:
    create-user EMAIL NAME [TIER]     Create a new user
    delete-user EMAIL                 Delete a user
    list-users                        List all users
    enable-user EMAIL                 Enable a user account
    disable-user EMAIL                Disable a user account
    reset-password EMAIL              Reset user password
    add-to-group EMAIL GROUP          Add user to a group
    remove-from-group EMAIL GROUP     Remove user from a group
    set-tier EMAIL TIER               Set user tier (free, paid, enterprise)
    get-user EMAIL                    Get user details

GROUPS:
    Admins       Administrator users with full access
    Users        Standard users with limited access
    Enterprise   Enterprise tier users with enhanced features

TIERS:
    free         Free tier (10 requests per 15 minutes)
    paid         Paid tier (100 requests per 15 minutes)
    enterprise   Enterprise tier (1000 requests per 15 minutes)

EXAMPLES:
    # Create a new admin user
    $0 create-user admin@example.com "Admin User" enterprise
    $0 add-to-group admin@example.com Admins

    # Create a standard user
    $0 create-user user@example.com "John Doe" paid
    $0 add-to-group user@example.com Users

    # List all users
    $0 list-users

    # Reset a user's password
    $0 reset-password user@example.com

    # Disable a user account
    $0 disable-user user@example.com

    # Set user tier
    $0 set-tier user@example.com enterprise

EOF
}

# Create user
create_user() {
    local email=$1
    local name=$2
    local tier=${3:-free}
    
    if [[ -z "$email" || -z "$name" ]]; then
        log_error "Email and name are required"
        usage
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    local temp_password="TempPass$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-8)!"
    
    log_info "Creating user: $email"
    
    aws cognito-idp admin-create-user \
        --user-pool-id "$user_pool_id" \
        --username "$email" \
        --user-attributes \
            Name=email,Value="$email" \
            Name=name,Value="$name" \
            Name=email_verified,Value=true \
            Name=custom:tier,Value="$tier" \
        --temporary-password "$temp_password" \
        --message-action SUPPRESS
    
    log_success "User created successfully"
    echo ""
    echo "📧 Email: $email"
    echo "👤 Name: $name"
    echo "🎫 Tier: $tier"
    echo "🔑 Temporary Password: $temp_password"
    echo ""
    log_warning "User must change password on first login"
}

# Delete user
delete_user() {
    local email=$1
    
    if [[ -z "$email" ]]; then
        log_error "Email is required"
        usage
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    
    log_warning "Deleting user: $email"
    read -p "Are you sure? (yes/no): " confirmation
    
    if [[ "$confirmation" != "yes" ]]; then
        log_info "Deletion cancelled"
        exit 0
    fi
    
    aws cognito-idp admin-delete-user \
        --user-pool-id "$user_pool_id" \
        --username "$email"
    
    log_success "User deleted successfully"
}

# List users
list_users() {
    local user_pool_id=$(get_user_pool_id)
    
    log_info "Listing users in User Pool: $user_pool_id"
    echo ""
    
    aws cognito-idp list-users \
        --user-pool-id "$user_pool_id" \
        --query 'Users[*].[Username, Attributes[?Name==`email`].Value | [0], Attributes[?Name==`name`].Value | [0], UserStatus, Enabled]' \
        --output table
}

# Enable user
enable_user() {
    local email=$1
    
    if [[ -z "$email" ]]; then
        log_error "Email is required"
        usage
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    
    log_info "Enabling user: $email"
    
    aws cognito-idp admin-enable-user \
        --user-pool-id "$user_pool_id" \
        --username "$email"
    
    log_success "User enabled successfully"
}

# Disable user
disable_user() {
    local email=$1
    
    if [[ -z "$email" ]]; then
        log_error "Email is required"
        usage
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    
    log_warning "Disabling user: $email"
    
    aws cognito-idp admin-disable-user \
        --user-pool-id "$user_pool_id" \
        --username "$email"
    
    log_success "User disabled successfully"
}

# Reset password
reset_password() {
    local email=$1
    
    if [[ -z "$email" ]]; then
        log_error "Email is required"
        usage
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    local temp_password="TempPass$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-8)!"
    
    log_info "Resetting password for: $email"
    
    aws cognito-idp admin-set-user-password \
        --user-pool-id "$user_pool_id" \
        --username "$email" \
        --password "$temp_password" \
        --permanent false
    
    log_success "Password reset successfully"
    echo ""
    echo "🔑 Temporary Password: $temp_password"
    echo ""
    log_warning "User must change password on next login"
}

# Add user to group
add_to_group() {
    local email=$1
    local group=$2
    
    if [[ -z "$email" || -z "$group" ]]; then
        log_error "Email and group are required"
        usage
        exit 1
    fi
    
    if [[ ! "$group" =~ ^(Admins|Users|Enterprise)$ ]]; then
        log_error "Invalid group: $group. Must be Admins, Users, or Enterprise"
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    
    log_info "Adding $email to group: $group"
    
    aws cognito-idp admin-add-user-to-group \
        --user-pool-id "$user_pool_id" \
        --username "$email" \
        --group-name "$group"
    
    log_success "User added to group successfully"
}

# Remove user from group
remove_from_group() {
    local email=$1
    local group=$2
    
    if [[ -z "$email" || -z "$group" ]]; then
        log_error "Email and group are required"
        usage
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    
    log_info "Removing $email from group: $group"
    
    aws cognito-idp admin-remove-user-from-group \
        --user-pool-id "$user_pool_id" \
        --username "$email" \
        --group-name "$group"
    
    log_success "User removed from group successfully"
}

# Set user tier
set_tier() {
    local email=$1
    local tier=$2
    
    if [[ -z "$email" || -z "$tier" ]]; then
        log_error "Email and tier are required"
        usage
        exit 1
    fi
    
    if [[ ! "$tier" =~ ^(free|paid|enterprise)$ ]]; then
        log_error "Invalid tier: $tier. Must be free, paid, or enterprise"
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    
    log_info "Setting tier for $email to: $tier"
    
    aws cognito-idp admin-update-user-attributes \
        --user-pool-id "$user_pool_id" \
        --username "$email" \
        --user-attributes Name=custom:tier,Value="$tier"
    
    log_success "User tier updated successfully"
}

# Get user details
get_user() {
    local email=$1
    
    if [[ -z "$email" ]]; then
        log_error "Email is required"
        usage
        exit 1
    fi
    
    local user_pool_id=$(get_user_pool_id)
    
    log_info "Getting user details for: $email"
    echo ""
    
    aws cognito-idp admin-get-user \
        --user-pool-id "$user_pool_id" \
        --username "$email"
}

# Main command dispatcher
COMMAND=$1
shift || true

case $COMMAND in
    create-user)
        create_user "$@"
        ;;
    delete-user)
        delete_user "$@"
        ;;
    list-users)
        list_users
        ;;
    enable-user)
        enable_user "$@"
        ;;
    disable-user)
        disable_user "$@"
        ;;
    reset-password)
        reset_password "$@"
        ;;
    add-to-group)
        add_to_group "$@"
        ;;
    remove-from-group)
        remove_from_group "$@"
        ;;
    set-tier)
        set_tier "$@"
        ;;
    get-user)
        get_user "$@"
        ;;
    -h|--help|help|"")
        usage
        exit 0
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        usage
        exit 1
        ;;
esac