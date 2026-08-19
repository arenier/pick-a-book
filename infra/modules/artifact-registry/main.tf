# Single Docker repository for both apps/api and apps/web images (docker/, build context =
# repo root). Format is fixed to DOCKER: this module has no other use in this repo.

resource "google_artifact_registry_repository" "this" {
  # checkov:skip=CKV_GCP_84: Google-managed encryption (the default) is already at rest and
  # in transit; adding CMEK means provisioning and paying for a Cloud KMS key ring for a
  # personal project with "budget quasi nul" (ADR 0004), for images that are not sensitive
  # data.
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  description   = var.description
  format        = "DOCKER"
}
