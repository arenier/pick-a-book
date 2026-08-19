# Single Docker repository for both apps/api and apps/web images (docker/, build context =
# repo root). Format is fixed to DOCKER: this module has no other use in this repo.

resource "google_artifact_registry_repository" "this" {
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  description   = var.description
  format        = "DOCKER"
}
