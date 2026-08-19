# Least-privilege Cloud Run runtime identity (issue #12): read the secrets it needs, write
# pg_dump snapshots to the backups bucket, nothing else. No google_project_iam_member (or any
# project-wide binding) is declared here, deliberately — a project-level role would grant more
# than this service account needs project-wide, which is exactly what least privilege rules
# out.

resource "google_service_account" "this" {
  project      = var.project_id
  account_id   = var.account_id
  display_name = var.display_name
}

resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  for_each = toset(var.secret_ids)

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.this.email}"
}

resource "google_storage_bucket_iam_member" "bucket_writer" {
  bucket = var.bucket_name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.this.email}"
}
