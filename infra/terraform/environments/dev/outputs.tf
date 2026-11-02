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
