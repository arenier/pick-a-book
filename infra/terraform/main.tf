provider "google" {
  region = var.region
}

resource "google_project" "this" {
  project_id      = var.project_id
  name            = var.project_display_name
  billing_account = var.billing_account
  org_id          = var.org_id
  folder_id       = var.folder_id
}

resource "google_project_service" "storage" {
  project = google_project.this.project_id
  service = "storage.googleapis.com"

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_storage_bucket" "experiments" {
  project  = google_project.this.project_id
  name     = local.experiment_bucket_name
  location = var.region

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  depends_on = [google_project_service.storage]
}

resource "google_storage_bucket_object" "experiment_photos" {
  for_each = local.experiment_photos

  bucket = google_storage_bucket.experiments.name
  name   = "experiment-photos/${each.value}"
  source = "${local.experiment_photos_dir}/${each.value}"
}
