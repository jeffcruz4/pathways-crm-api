variable "name_prefix" {
  type        = string
  description = "Resource name prefix, e.g. pathways-dev."
}

variable "vpc_id" {
  type        = string
  description = "VPC to place the database in."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the DB subnet group (>= 2 AZs)."
}

variable "allowed_security_group_ids" {
  type        = list(string)
  default     = []
  description = "Security groups allowed to reach Postgres :5432 (e.g. the API's ECS task SG)."
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  default     = []
  description = "Optional CIDRs allowed to reach Postgres (use sparingly; prefer SG rules)."
}

# ── Engine / sizing (dev defaults; bump for prod via vars, not redesign) ──
variable "engine_version" {
  type    = string
  default = "16.4"
}

variable "instance_class" {
  type        = string
  default     = "db.t4g.micro"
  description = "Smallest Graviton burstable for dev. Scale up for prod."
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "max_allocated_storage" {
  type        = number
  default     = 100
  description = "Storage autoscaling ceiling."
}

variable "db_name" {
  type    = string
  default = "pathways"
}

variable "master_username" {
  type    = string
  default = "pathways"
}

variable "multi_az" {
  type        = bool
  default     = false
  description = "Single-AZ for dev cost; true for prod HA."
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type        = bool
  default     = false
  description = "false in dev so the stack can be torn down; true for prod."
}

variable "tags" {
  type    = map(string)
  default = {}
}
