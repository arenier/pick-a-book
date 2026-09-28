output "alert_policy_names" {
  description = "Fully qualified names of the two alert policies, to find them in Cloud Monitoring."
  value = {
    stale  = google_monitoring_alert_policy.stale.name
    failed = google_monitoring_alert_policy.failed.name
  }
}
