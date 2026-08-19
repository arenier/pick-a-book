# Single Docker repository for both apps/api and apps/web images (docker/, build context =
# repo root). Format is fixed to DOCKER: this module has no other use in this repo.

resource "google_artifact_registry_repository" "this" {
  # checkov:skip=CKV_GCP_84: Google-managed encryption (the default) is already at rest and
  # in transit; adding CMEK means provisioning and paying for a Cloud KMS key ring for a
  # personal project with a near-zero budget, for images that are not sensitive
  # data.
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  description   = var.description
  format        = "DOCKER"

  # On-demand vulnerability (CVE) scanning is billed per scan and not worth it for a personal
  # project's own images — disabled explicitly rather than left on the account-wide default.
  vulnerability_scanning_config {
    enablement_config = "DISABLED"
  }
}
