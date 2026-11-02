output "db_endpoint" {
  value       = module.rds.db_endpoint
  description = "Postgres host — part of DATABASE_URL."
}

output "db_port" {
  value = module.rds.db_port
}

output "db_name" {
  value = module.rds.db_name
}

output "db_security_group_id" {
  value       = module.rds.security_group_id
  description = "Add the API's task SG to this DB SG's allowed_security_group_ids."
}

output "master_secret_arn" {
  value       = module.rds.master_secret_arn
  description = "Secrets Manager ARN with the master username/password. Build DATABASE_URL from this (see README)."
}

# ── Image / migrator / CI ──
output "ecr_repository_url" {
  value       = module.ecr.repository_url
  description = "Push the API image here (the migrator runs this image)."
}

output "cluster_name" {
  value       = data.aws_ecs_cluster.this.cluster_name
  description = "ECS cluster the migrator task runs on."
}

output "migrator_task_family" {
  value       = module.migrator.task_family
  description = "Run with: aws ecs run-task --task-definition <this> …"
}

output "migrator_security_group_id" {
  value = module.migrator.security_group_id
}

output "migrator_subnet_ids" {
  value = data.aws_subnets.private.ids
}

output "gha_deploy_role_arn" {
  value       = module.github_oidc.deploy_role_arn
  description = "ARN of the stack-created deploy role, or null when create_github_oidc_role=false (you're reusing an existing role — set its ARN as AWS_ROLE_ARN yourself)."
}
