# Least-privilege Cloud Run runtime identity: read the secrets it needs, and hold on each
# bucket exactly the object roles it is handed, nothing else. No google_project_iam_member (or any
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

# Keyed by the caller's static grant names, not by bucket: a bucket name is another module's
# output, and for_each keys must be known at plan time.
resource "google_storage_bucket_iam_member" "bucket_grant" {
  for_each = var.bucket_grants

  bucket = each.value.bucket
  role   = each.value.role
  member = "serviceAccount:${google_service_account.this.email}"
}
