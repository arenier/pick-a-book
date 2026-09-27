output "alert_policy_name" {
  description = "Fully qualified name of the alert policy, to find it in Cloud Monitoring."
  value       = google_monitoring_alert_policy.this.name
}
