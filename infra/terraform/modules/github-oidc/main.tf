###############################################################################
# GitHub OIDC deploy role for the pathways-crm-api repo.
#
# Lets the repo's GitHub Actions workflow assume an AWS role via OIDC (no
# long-lived keys) to: push images to ECR and run the one-off migrator ECS task.
# Scoped to this repo + the allowed refs/environments. Least-privilege: only the
# ECR repos and ECS/PassRole it needs — NOT PowerUser.
###############################################################################

locals {
  tags = merge(var.tags, { module = "github-oidc" })
  subject_claims = concat(
    [for r in var.allowed_refs : "repo:${var.github_org}/${var.github_repo}:ref:${r}"],
    [for e in var.allowed_environments : "repo:${var.github_org}/${var.github_repo}:environment:${e}"],
  )
}

# Reuse the account's existing OIDC provider by default; optionally create one.
resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.tags
}

locals {
  provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : var.existing_provider_arn
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.subject_claims
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${var.name_prefix}-gha-deploy"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  tags               = local.tags
}

# ECR: auth token is account-wide; push/pull scoped to our repos.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = var.ecr_repository_arns
  }
  # Run + observe the one-off migrator task on the shared cluster.
  statement {
    sid       = "EcsRunTask"
    actions   = ["ecs:RunTask", "ecs:DescribeTasks", "ecs:ListTasks"]
    resources = ["*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.cluster_arn]
    }
  }
  # PassRole only for the migrator's exec/task roles, only to ECS tasks.
  statement {
    sid       = "PassMigratorRoles"
    actions   = ["iam:PassRole"]
    resources = [var.task_execution_role_arn, var.task_role_arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
  # Read migrator logs (for the workflow to tail results).
  statement {
    sid       = "ReadLogs"
    actions   = ["logs:GetLogEvents", "logs:DescribeLogStreams", "logs:FilterLogEvents"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.name_prefix}-gha-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
