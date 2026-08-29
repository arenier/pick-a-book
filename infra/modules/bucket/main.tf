# Generic private object store — one instantiation per use (backups, bench reference photos,
# …), never the shared module of a would-be public/static-site bucket: that access policy is
# the opposite of this one and belongs in a separate module entirely.
#
# No gcsfuse mount, no volume in any Cloud Run service: this bucket is a plain object store.

resource "google_storage_bucket" "this" {
  # checkov:skip=CKV_GCP_62: Access logging needs a second bucket to hold the logs, adding
  # cost and complexity for a personal project. Each instantiation's set of principals is
  # small and known ahead of time — either the dedicated, least-privilege service account
  # from the service-account module (objectCreator only), or, for a bucket with no runtime
  # consumer, the project owner's own ADC — so there is no unexpected actor for access logs
  # to catch here. See each instantiation's comment in envs/prod/main.tf for its actual writer.
  project                     = var.project_id
  name                        = var.name
  location                    = var.location
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Current objects (the dated snapshots pg_dump writes) are kept indefinitely. Only
  # noncurrent versions — created when a snapshot name is overwritten — are pruned, so an
  # accidental overwrite doesn't erase the last good dump forever, without storage growing
  # unbounded either.
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      with_state                 = "ARCHIVED"
      days_since_noncurrent_time = var.noncurrent_version_retention_days
    }
  }
}
