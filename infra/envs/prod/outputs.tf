output "api_url" {
  description = "Default *.run.app URL of the API service."
  value       = module.cloud_run_api.service_url
}

output "web_url" {
  description = "Public HTTPS URL of the front — Google's shared storage.googleapis.com endpoint for the static-site bucket, no custom domain or CDN."
  value       = module.static_site.public_base_url
}

output "web_bucket_name" {
  description = "Static-site bucket the built front is uploaded to (`gsutil rsync ./dist gs://<name>`)."
  value       = module.static_site.bucket_name
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
  description = "Runtime identity the API service runs as — the only service account in this env, holding the Secret Manager and bucket grants."
  value       = module.service_account_api.email
}
