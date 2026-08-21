output "api_url" {
  description = "Default *.run.app URL of the API service."
  value       = module.cloud_run_api.service_url
}

output "web_url" {
  description = "Default *.run.app URL of the front service."
  value       = module.cloud_run_web.service_url
}

output "artifact_registry_url" {
  description = "Docker repository path for `docker push` / `gcloud run deploy --image`."
  value       = module.artifact_registry.repository_url
}

output "backups_bucket_name" {
  description = "Bucket the pg_dump job (out of scope here, lives in `infrastructure`) writes to."
  value       = module.bucket.bucket_name
}

output "reference_photos_bucket_name" {
  description = "Bucket holding the recognition bench's reference shelf photos (issue #10) — upload with `gsutil cp`, never committed."
  value       = module.bucket_reference_photos.bucket_name
}

output "api_service_account_email" {
  description = "Runtime identity the API service runs as — the only one with Secret Manager and bucket access."
  value       = module.service_account_api.email
}

output "web_service_account_email" {
  description = "Runtime identity the front service runs as — no grants."
  value       = module.service_account_web.email
}
