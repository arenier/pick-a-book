output "repository_id" {
  description = "The Artifact Registry repository ID."
  value       = google_artifact_registry_repository.this.repository_id
}

output "repository_url" {
  description = "Full pushable Docker repository path, e.g. for `docker push` or `gcloud run deploy --image`."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.this.repository_id}"
}
