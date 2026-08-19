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

output "service_account_email" {
  description = "Runtime identity both Cloud Run services run as."
  value       = module.service_account.email
}
