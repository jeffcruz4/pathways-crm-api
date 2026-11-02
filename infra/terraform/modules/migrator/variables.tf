variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnets to run the one-off task in."
}

variable "image" {
  type        = string
  description = "Full image ref (ECR repo URL : tag) for the API/migrator image."
}

# ── Database connection ──
variable "db_endpoint" {
  type = string
}
variable "db_port" {
  type    = number
  default = 5432
}
variable "db_name" {
  type = string
}
variable "db_master_secret_arn" {
  type        = string
  description = "RDS-managed master secret ARN (JSON username/password)."
}

variable "task_cpu" {
  type    = number
  default = 256
}
variable "task_memory" {
  type    = number
  default = 512
}
variable "log_retention_days" {
  type    = number
  default = 14
}

variable "tags" {
  type    = map(string)
  default = {}
}
