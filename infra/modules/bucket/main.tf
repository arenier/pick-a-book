# Backups bucket only: pg_dump dumps and dated snapshots (ADR 0006). Strictly private —
# opposite access policy from a would-be static-site bucket, so the two are never the same
# module or the same resource (issue #12, decision comment point 2).
#
# No gcsfuse mount, no volume in any Cloud Run service: ADR 0006 moved persistence off the
# bucket onto managed Postgres. This bucket is a plain object store, written to by the SA
# provisioned in the service-account module.

resource "google_storage_bucket" "this" {
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
  # unbounded either (issue #12 point 9).
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
