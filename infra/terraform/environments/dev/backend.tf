# Remote state backend (S3 + DynamoDB lock). Fill in your state bucket + lock
# table and uncomment. Kept commented so `terraform init -backend=false` works
# for local validation before the bucket exists.
#
# terraform {
#   backend "s3" {
#     bucket         = "pathways-tfstate-<account-id>"
#     key            = "api/dev/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "pathways-tf-locks"
#     encrypt        = true
#   }
# }
