output "user_pool_id" {
  value       = aws_cognito_user_pool.this.id
  description = "Cognito user pool id."
}

output "user_pool_client_id" {
  value       = aws_cognito_user_pool_client.web.id
  description = "Public SPA app client id → config.json auth.clientId."
}

output "issuer" {
  value       = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
  description = "OIDC issuer → config.json auth.issuer (discovery lives at <issuer>/.well-known/openid-configuration)."
}

output "hosted_ui_domain" {
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
  description = "Hosted-UI domain → config.json auth.cognitoDomain (used for authorize + /logout)."
}
