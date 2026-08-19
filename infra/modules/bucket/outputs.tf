output "bucket_name" {
  description = "The bucket name, for wiring into the service account's IAM bindings and the pg_dump job configuration."
  value       = google_storage_bucket.this.name
}

output "bucket_url" {
  description = "The gs:// URL of the bucket."
  value       = google_storage_bucket.this.url
}
