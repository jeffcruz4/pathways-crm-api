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

# Name prefix of the EXISTING stack whose VPC + private subnets we reuse
# (corvia-digital-services names them "corvia-dev-*"). Discovered by tag, not by
# reading that stack's Terraform state.
variable "base_name_prefix" {
  type    = string
  default = "corvia-dev"
}

# ── Network access to Postgres ──
# Prefer SG-based access: once the API's ECS task security group exists, add it
# here and re-apply so only the API can reach the DB.
variable "allowed_security_group_ids" {
  type    = list(string)
  default = []
}

# Optional CIDRs allowed to reach Postgres. When empty (default), the stack
# allows the discovered corvia VPC's own CIDR, so in-VPC hosts can reach the DB
# out of the box. Set explicitly to override/tighten.
variable "allowed_cidr_blocks" {
  type    = list(string)
  default = []
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
