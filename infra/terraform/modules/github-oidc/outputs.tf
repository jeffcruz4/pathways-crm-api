output "deploy_role_arn" {
  value       = var.create ? aws_iam_role.deploy[0].arn : null
  description = "ARN of the created deploy role, or null when reusing an existing role. Set as the repo secret AWS_ROLE_ARN for the GitHub workflow."
}
