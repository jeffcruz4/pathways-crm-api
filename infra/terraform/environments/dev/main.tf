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

# Reuse the existing corvia ECS cluster to run the one-off migrator task.
data "aws_ecs_cluster" "this" {
  cluster_name = "${var.base_name_prefix}-cluster"
}

# ── Dedicated RDS instance (in the discovered corvia VPC) ──
module "rds" {
  source = "../../modules/rds"

  name_prefix = var.name_prefix
  vpc_id      = data.aws_vpc.this.id
  subnet_ids  = data.aws_subnets.private.ids

  # Allow the migrator task's SG, plus any app SGs the user supplies. Also allow
  # the VPC CIDR by default so in-VPC hosts can reach it out of the box.
  allowed_security_group_ids = concat([module.migrator.security_group_id], var.allowed_security_group_ids)
  allowed_cidr_blocks        = length(var.allowed_cidr_blocks) > 0 ? var.allowed_cidr_blocks : [data.aws_vpc.this.cidr_block]

  instance_class      = var.instance_class
  multi_az            = var.multi_az
  deletion_protection = var.deletion_protection

  tags = local.common_tags
}

# ── ECR for the API/migrator image ──
module "ecr" {
  source          = "../../modules/ecr"
  repository_name = var.ecr_repository_name
  tags            = local.common_tags
}

# ── One-off migrator task (same image, runs db:migrate / db:seed) ──
module "migrator" {
  source      = "../../modules/migrator"
  name_prefix = var.name_prefix
  region      = var.region
  vpc_id      = data.aws_vpc.this.id
  subnet_ids  = data.aws_subnets.private.ids
  image       = "${module.ecr.repository_url}:${var.image_tag}"

  db_endpoint          = module.rds.db_endpoint
  db_port              = module.rds.db_port
  db_name              = module.rds.db_name
  db_master_secret_arn = module.rds.master_secret_arn

  tags = local.common_tags
}

# ── GitHub OIDC deploy role (push image + run migrator from CI) ──
module "github_oidc" {
  source                  = "../../modules/github-oidc"
  name_prefix             = var.name_prefix
  create_oidc_provider    = var.create_github_oidc_provider
  existing_provider_arn   = var.existing_github_oidc_provider_arn
  ecr_repository_arns     = [module.ecr.repository_arn]
  cluster_arn             = data.aws_ecs_cluster.this.arn
  task_execution_role_arn = module.migrator.execution_role_arn
  task_role_arn           = module.migrator.task_role_arn
  tags                    = local.common_tags
}
