output "deploy_role_arn" {
  value       = aws_iam_role.deploy.arn
  description = "Set this as the repo secret AWS_ROLE_ARN for the GitHub workflow."
}
