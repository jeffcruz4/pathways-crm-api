output "task_family" {
  value       = aws_ecs_task_definition.migrator.family
  description = "Run with: aws ecs run-task --task-definition <family> …"
}

output "security_group_id" {
  value       = aws_security_group.task.id
  description = "Allow this SG into the DB SG so the migrator can reach Postgres."
}

output "log_group" {
  value = aws_cloudwatch_log_group.migrator.name
}

output "container_name" {
  value = local.container_name
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}
