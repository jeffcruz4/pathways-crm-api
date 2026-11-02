variable "repository_name" {
  type        = string
  description = "ECR repository name, e.g. pathways/api."
}

variable "untagged_expire_days" {
  type    = number
  default = 7
}

variable "keep_last_images" {
  type    = number
  default = 15
}

variable "tags" {
  type    = map(string)
  default = {}
}
