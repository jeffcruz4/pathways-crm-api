###############################################################################
# Migrator — a one-off Fargate task definition that runs the API image to apply
# DB migrations (and optionally seed) against RDS. It is NOT a long-running
# service; it's launched on demand via `aws ecs run-task` (locally or from the
# GitHub workflow).
#
# DATABASE_URL is assembled at container start from the RDS-managed master
# secret (injected as DB_USER/DB_PASSWORD) plus the non-secret host/port/db —
# so no password lives in the task definition. A tiny entrypoint shell builds
# the URL and runs the requested command (migrate | seed | migrate+seed).
###############################################################################

locals {
  tags           = merge(var.tags, { module = "migrator" })
  container_name = "migrator"
}

# ── Its own security group so RDS can allow exactly this task ──
resource "aws_security_group" "task" {
  name_prefix = "${var.name_prefix}-migrator-"
  description = "Pathways migrator one-off task"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.tags, { Name = "${var.name_prefix}-migrator-sg" })
  lifecycle { create_before_destroy = true }
}

resource "aws_cloudwatch_log_group" "migrator" {
  name              = "/ecs/${var.name_prefix}/migrator"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pull image, write logs, read the DB secret for injection.
resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-migrator-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}
resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
data "aws_iam_policy_document" "secrets_read" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_master_secret_arn]
  }
}
resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${var.name_prefix}-migrator-secrets-read"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.secrets_read.json
}

# Task role: the migrator needs no AWS API access at runtime.
resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-migrator-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_ecs_task_definition" "migrator" {
  family                   = "${var.name_prefix}-migrator"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = var.image
      essential = true
      # Build DATABASE_URL from injected creds + non-secret parts, then run the
      # command passed as MIGRATE_CMD (default "migrate"). Overridable per run
      # via containerOverrides (environment MIGRATE_CMD=seed | migrate+seed).
      entryPoint = ["/bin/sh", "-c"]
      command = [
        join(" ", [
          "export DATABASE_URL=\"postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=require\";",
          "echo \"migrator: running $MIGRATE_CMD\";",
          "if [ \"$MIGRATE_CMD\" = \"seed\" ]; then node dist/db/seed-db.js;",
          "elif [ \"$MIGRATE_CMD\" = \"migrate+seed\" ]; then node dist/db/migrate.js && node dist/db/seed-db.js;",
          "else node dist/db/migrate.js; fi",
        ])
      ]
      environment = [
        { name = "DB_HOST", value = var.db_endpoint },
        { name = "DB_PORT", value = tostring(var.db_port) },
        { name = "DB_NAME", value = var.db_name },
        { name = "MIGRATE_CMD", value = "migrate" },
      ]
      secrets = [
        { name = "DB_USER", valueFrom = "${var.db_master_secret_arn}:username::" },
        { name = "DB_PASSWORD", valueFrom = "${var.db_master_secret_arn}:password::" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.migrator.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "migrator"
        }
      }
    }
  ])

  tags = local.tags
}
