###############################################################################
# Cognito user pool + public SPA app client + hosted-UI domain for Pathways CDP.
#
# The web app is a public client (no secret) using Authorization Code + PKCE,
# which is exactly what packages/auth's OidcClient implements. The outputs map
# 1:1 to apps/web/public/config.json:
#   issuer        = output issuer
#   clientId      = output user_pool_client_id
#   cognitoDomain = output hosted_ui_domain
###############################################################################

data "aws_region" "current" {}

resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"

  # Email is the username; users sign in with their email address.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # MFA optional by default (dev); set to "ON" + a software token for prod.
  mfa_configuration = var.mfa_configuration
  dynamic "software_token_mfa_configuration" {
    for_each = var.mfa_configuration == "OFF" ? [] : [1]
    content {
      enabled = true
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = var.admin_create_user_only
  }

  # Standard attributes the app reads from the ID token (name, email).
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }
  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true
    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }
  # Custom role claim (maps to the app's UserRole via roleFromClaims). Cognito
  # groups also work; this is a simpler single-value alternative.
  schema {
    name                = "role"
    attribute_data_type = "String"
    required            = false
    mutable             = true
    string_attribute_constraints {
      min_length = 0
      max_length = 32
    }
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-users" })
}

# ── Role groups (map to the app's UserRole set) ──
resource "aws_cognito_user_group" "roles" {
  for_each     = toset(["System Admin", "Team Member", "Partner", "Customer"])
  name         = each.key
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Pathways role: ${each.key}"
}

# ── Public SPA app client (no secret; Authorization Code + PKCE) ──
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false # public client — PKCE, no secret

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Token lifetimes.
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Don't reveal whether an account exists on failed auth.
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  read_attributes  = ["email", "name", "custom:role"]
  write_attributes = ["email", "name"]
}

# ── Hosted-UI domain (used for the authorize + /logout endpoints) ──
resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.hosted_ui_domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}
