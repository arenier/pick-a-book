output "service_name" {
  description = "The Cloud Run service name."
  value       = google_cloud_run_v2_service.this.name
}

output "service_url" {
  description = "The service's default *.run.app URL (no custom domain)."
  value       = google_cloud_run_v2_service.this.uri
}
