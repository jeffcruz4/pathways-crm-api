# Remote state — reuses the shared S3 bucket + DynamoDB lock table in the corvia
# account, under a SEPARATE key ("pathways-api/..."). Separate key = isolated
# state; this stack can never touch the corvia app's resources. If you later
# move the CRM to its own account/bucket, repoint these.
terraform {
  backend "s3" {
    bucket         = "corvia-tfstate-038462763287"
    key            = "pathways-api/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "corvia-tf-locks"
    encrypt        = true
  }
}
