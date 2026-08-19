mock_provider "google" {}

variables {
  project_id = "pick-a-book-test"
  name       = "pick-a-book-backups-test"
  location   = "europe-west1"
}

run "versioning_is_enabled" {
  command = plan

  assert {
    condition     = google_storage_bucket.this.versioning[0].enabled == true
    error_message = "Object versioning must be enabled — the bucket holds pg_dump backups and dated snapshots, and a botched upload must not silently overwrite the last good dump"
  }
}

run "bucket_is_strictly_private" {
  command = plan

  assert {
    condition     = google_storage_bucket.this.uniform_bucket_level_access == true
    error_message = "Uniform bucket-level access must be on: no per-object ACL can leak a backup outside IAM"
  }

  assert {
    condition     = google_storage_bucket.this.public_access_prevention == "enforced"
    error_message = "Backups (pg_dump dumps, database contents) must never be reachable publicly — this bucket is not the static-site bucket"
  }
}

run "noncurrent_versions_expire_after_30_days_by_default" {
  command = plan

  assert {
    condition     = length(google_storage_bucket.this.lifecycle_rule) == 1
    error_message = "Exactly one lifecycle rule is expected: delete noncurrent versions after retention_days"
  }

  assert {
    condition     = one(google_storage_bucket.this.lifecycle_rule[0].action).type == "Delete"
    error_message = "The lifecycle rule must delete, not archive or change storage class"
  }

  assert {
    condition     = one(google_storage_bucket.this.lifecycle_rule[0].condition).with_state == "ARCHIVED"
    error_message = "The rule must target noncurrent (archived) versions only — current snapshots are kept indefinitely"
  }

  assert {
    condition     = one(google_storage_bucket.this.lifecycle_rule[0].condition).days_since_noncurrent_time == 30
    error_message = "Default retention for noncurrent versions is 30 days — a reasonable default, not a settled arbitration"
  }
}

run "no_deletion_rule_on_current_objects" {
  command = plan

  assert {
    condition     = alltrue([for r in google_storage_bucket.this.lifecycle_rule : one(r.condition).with_state != "LIVE" && one(r.condition).with_state != "ANY"])
    error_message = "Current (live) snapshots must never be auto-deleted — only noncurrent versions are pruned"
  }
}

run "retention_days_is_configurable" {
  command = plan

  variables {
    project_id                        = "pick-a-book-test"
    name                              = "pick-a-book-backups-test"
    location                          = "europe-west1"
    noncurrent_version_retention_days = 7
  }

  assert {
    condition     = one(google_storage_bucket.this.lifecycle_rule[0].condition).days_since_noncurrent_time == 7
    error_message = "The retention period must be overridable via the module variable"
  }
}

run "location_is_the_given_region" {
  command = plan

  assert {
    condition     = google_storage_bucket.this.location == var.location
    error_message = "Bucket location must match the region passed in"
  }
}
