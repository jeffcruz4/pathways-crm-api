variable "name_prefix" {
  type        = string
  description = "Resource name prefix, e.g. pathways-dev."
}

variable "hosted_ui_domain_prefix" {
  type        = string
  description = "Cognito hosted-UI domain prefix (globally unique), e.g. pathways-cdp-dev. The full domain becomes https://<prefix>.auth.<region>.amazoncognito.com."
}

variable "callback_urls" {
  type        = list(string)
  description = "Allowed OAuth redirect (callback) URLs, e.g. http://localhost:5173/callback and the deployed app's /callback."
  default     = ["http://localhost:5173/callback"]
}

variable "logout_urls" {
  type        = list(string)
  description = "Allowed sign-out URLs (where Cognito returns after /logout), e.g. http://localhost:5173/."
  default     = ["http://localhost:5173/"]
}

variable "mfa_configuration" {
  type        = string
  default     = "OFF"
  description = "OFF | OPTIONAL | ON. Use OPTIONAL or ON (with TOTP) for prod."
  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration must be one of OFF, OPTIONAL, ON."
  }
}

variable "admin_create_user_only" {
  type        = bool
  default     = false
  description = "true to disable self sign-up (admins invite users). Good for an internal tool."
}

variable "tags" {
  type    = map(string)
  default = {}
}
