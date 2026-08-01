output "project_id" {
  description = "GCP project ID created for pick-a-book."
  value       = google_project.this.project_id
}

output "project_number" {
  description = "GCP project number."
  value       = google_project.this.number
}

output "experiment_bucket_name" {
  description = "Name of the GCS bucket holding experimentation photos."
  value       = google_storage_bucket.experiments.name
}

output "experiment_bucket_url" {
  description = "gs:// URL of the experimentation bucket."
  value       = google_storage_bucket.experiments.url
}

output "uploaded_experiment_photos" {
  description = "Object names uploaded to the experimentation bucket."
  value       = [for obj in google_storage_bucket_object.experiment_photos : obj.name]
}
