###############################################################################
# Pathways CRM API — dev environment.
#
# Provisions a DEDICATED RDS PostgreSQL instance for the CRM (independent of the
# old corvia-dev POC footprint). Networking is supplied via variables so this
# stack can sit in a new CRM VPC or an existing one without baking a VPC module
# prematurely. The API connects using DATABASE_URL built from the RDS-managed
# master secret (see README runbook).
###############################################################################

locals {
  common_tags = {
    project     = var.project
    environment = var.environment
    app         = "pathways-crm-api"
  }
}

module "rds" {
  source = "../../modules/rds"

  name_prefix = var.name_prefix
  vpc_id      = var.vpc_id
  subnet_ids  = var.subnet_ids

  allowed_security_group_ids = var.allowed_security_group_ids
  allowed_cidr_blocks        = var.allowed_cidr_blocks

  instance_class      = var.instance_class
  multi_az            = var.multi_az
  deletion_protection = var.deletion_protection

  tags = local.common_tags
}
