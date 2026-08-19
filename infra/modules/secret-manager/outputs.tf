output "secret_ids" {
  description = "The secret IDs created, for the service-account module to grant read access to."
  value       = [for s in google_secret_manager_secret.this : s.secret_id]
}

output "secret_names" {
  description = "Map of secret_id to the secret's fully qualified resource name, for wiring into Cloud Run secret references."
  value       = { for id, s in google_secret_manager_secret.this : id => s.name }
}
