output "db_instance_identifier" {
  value = aws_db_instance.this.identifier
}

output "db_endpoint" {
  value       = aws_db_instance.this.address
  description = "Postgres host."
}

output "db_port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "security_group_id" {
  value       = aws_security_group.db.id
  description = "The DB security group (reference from the API's SG rules)."
}

output "master_secret_arn" {
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
  description = "Secrets Manager ARN holding the master username/password JSON. Build DATABASE_URL from this."
}
