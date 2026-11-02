variable "project" {
  type    = string
  default = "pathways"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name_prefix" {
  type    = string
  default = "pathways-dev"
}

# ── Network ──
# The dedicated CRM stack needs a VPC with >= 2 private subnets across AZs.
# Provide an existing VPC/subnets here (e.g. a new CRM VPC or the account's
# default VPC). Keeping this as inputs avoids baking a heavy VPC module before
# the networking decision is made.
variable "vpc_id" {
  type        = string
  description = "VPC ID to place RDS in."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs (>= 2 AZs) for the DB subnet group."
}

variable "allowed_security_group_ids" {
  type        = list(string)
  default     = []
  description = "App security groups allowed to reach Postgres (the API's ECS task SG)."
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  default     = []
  description = "Optional CIDRs allowed to reach Postgres (e.g. a bastion); prefer SG rules."
}

# ── Sizing ──
variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "deletion_protection" {
  type    = bool
  default = false
}
