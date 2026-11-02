###############################################################################
# ECR repository for the Pathways CRM API image (also used by the migrator,
# which is the same image run with a different command).
###############################################################################

resource "aws_ecr_repository" "this" {
  name                 = var.repository_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
  tags = merge(var.tags, { Name = var.repository_name })
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after ${var.untagged_expire_days} days"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = var.untagged_expire_days }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the most recent ${var.keep_last_images} tagged images"
        selection    = { tagStatus = "tagged", tagPrefixList = ["v", "sha-", "dev", "latest"], countType = "imageCountMoreThan", countNumber = var.keep_last_images }
        action       = { type = "expire" }
      }
    ]
  })
}
