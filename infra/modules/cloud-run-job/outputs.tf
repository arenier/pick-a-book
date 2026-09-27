output "name" {
  description = "Job name — what `gcloud run jobs execute|update` and the freshness alert refer to."
  value       = google_cloud_run_v2_job.this.name
}
