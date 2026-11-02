###############################################################################
# Dedicated RDS PostgreSQL for the Pathways CRM API.
#
# Low-cost dev defaults (single-AZ, db.t4g.micro, 20GB w/ autoscaling). The
# master credentials are managed by RDS and stored in Secrets Manager
# (manage_master_user_password), so no password ever lives in Terraform state
# or code. The API reads the connection via DATABASE_URL built from that secret.
###############################################################################

locals {
  tags = merge(var.tags, { module = "rds" })
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = var.subnet_ids
  tags       = merge(local.tags, { Name = "${var.name_prefix}-db-subnets" })
}

resource "aws_security_group" "db" {
  name_prefix = "${var.name_prefix}-db-"
  description = "Pathways CRM Postgres - accept :5432 from the API only"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${var.name_prefix}-db-sg" })
  lifecycle { create_before_destroy = true }
}

# Ingress from each allowed app security group (standalone rules — the
# ecosystem's deliberate pattern to avoid inline-vs-standalone churn).
resource "aws_security_group_rule" "from_app_sgs" {
  count                    = length(var.allowed_security_group_ids)
  type                     = "ingress"
  description              = "Postgres from app SG"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db.id
  source_security_group_id = var.allowed_security_group_ids[count.index]
}

resource "aws_security_group_rule" "from_cidrs" {
  count             = length(var.allowed_cidr_blocks) > 0 ? 1 : 0
  type              = "ingress"
  description       = "Postgres from allowed CIDRs"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  security_group_id = aws_security_group.db.id
  cidr_blocks       = var.allowed_cidr_blocks
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.master_username
  # RDS manages the master password + rotates it into Secrets Manager.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  multi_az                  = var.multi_az
  backup_retention_period   = var.backup_retention_days
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? "${var.name_prefix}-postgres-final" : null

  auto_minor_version_upgrade = true
  apply_immediately          = true

  tags = merge(local.tags, { Name = "${var.name_prefix}-postgres" })
}
