###############################################################################
# Pathways CRM API — dev environment.
#
# Provisions a DEDICATED RDS PostgreSQL instance for the CRM, but REUSES the
# existing corvia VPC + private subnets (from corvia-digital-services) rather
# than standing up new networking. The VPC/subnets are DISCOVERED by the tags
# that stack assigns (VPC Name = "<base_name_prefix>-vpc"; private subnets
# tagged tier=private) — this stack does NOT read the other stack's state.
#
# The RDS instance, its subnet group, and its security group are all created
# here under the pathways-dev prefix, so it's isolated from the corvia app.
###############################################################################

locals {
  common_tags = {
    project     = var.project
    environment = var.environment
    app         = "pathways-crm-api"
  }
}

# ── Discover the existing corvia VPC + private subnets ──
data "aws_vpc" "this" {
  filter {
    name   = "tag:Name"
    values = ["${var.base_name_prefix}-vpc"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.this.id]
  }
  filter {
    name   = "tag:tier"
    values = ["private"]
  }
}

module "rds" {
  source = "../../modules/rds"

  name_prefix = var.name_prefix
  vpc_id      = data.aws_vpc.this.id
  subnet_ids  = data.aws_subnets.private.ids

  allowed_security_group_ids = var.allowed_security_group_ids
  # Default: allow the corvia VPC's own CIDR so in-VPC hosts (the API task, a
  # one-off migrate task, an SSM port-forward) can reach Postgres out of the
  # box. Override with var.allowed_cidr_blocks to tighten. Prefer moving to
  # allowed_security_group_ids once the API's task SG exists.
  allowed_cidr_blocks = length(var.allowed_cidr_blocks) > 0 ? var.allowed_cidr_blocks : [data.aws_vpc.this.cidr_block]

  instance_class      = var.instance_class
  multi_az            = var.multi_az
  deletion_protection = var.deletion_protection

  tags = local.common_tags
}
