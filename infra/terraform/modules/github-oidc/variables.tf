variable "name_prefix" {
  type = string
}

variable "github_org" {
  type    = string
  default = "jeffcruz4"
}

variable "github_repo" {
  type    = string
  default = "pathways-crm-api"
}

variable "allowed_refs" {
  type    = list(string)
  default = ["refs/heads/main"]
}

variable "allowed_environments" {
  type        = list(string)
  default     = ["production"]
  description = "GitHub Environments allowed to assume the role (for approval-gated jobs)."
}

# Most AWS accounts already have ONE GitHub OIDC provider. If the corvia account
# already created it (it did — corvia-digital-services manages one), set
# create_oidc_provider=false and pass its ARN to avoid a conflict.
variable "create_oidc_provider" {
  type    = bool
  default = false
}

variable "existing_provider_arn" {
  type        = string
  default     = ""
  description = "Required when create_oidc_provider=false."
}

# ECR repos this role may push to, and the ECS resources it may run/describe
# (migrator task). Passed from the environment.
variable "ecr_repository_arns" {
  type    = list(string)
  default = []
}

variable "cluster_arn" {
  type = string
}

variable "task_execution_role_arn" {
  type        = string
  description = "Execution role the migrator task uses (for iam:PassRole)."
}

variable "task_role_arn" {
  type        = string
  description = "Task role the migrator task uses (for iam:PassRole)."
}

variable "tags" {
  type    = map(string)
  default = {}
}
