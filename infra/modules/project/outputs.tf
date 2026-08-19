output "project_id" {
  description = "The GCP project ID, passed through for modules that only need this module's ordering guarantee."
  value       = var.project_id
}

output "enabled_apis" {
  description = "APIs enabled on the project, for modules that need to depend on a specific one."
  value       = [for s in google_project_service.this : s.service]
}
