output "email" {
  description = "The service account's email, to wire into the Cloud Run service's identity."
  value       = google_service_account.this.email
}
