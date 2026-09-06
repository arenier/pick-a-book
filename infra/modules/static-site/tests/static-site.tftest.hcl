mock_provider "google" {}

variables {
  project_id = "pick-a-book-test"
  name       = "pick-a-book-web-test"
  location   = "europe-west1"
}

run "bucket_is_publicly_readable" {
  command = plan

  # The whole reason this module is separate from `bucket`: the front has to be world-readable.
  assert {
    condition     = google_storage_bucket_iam_member.public_read.role == "roles/storage.objectViewer"
    error_message = "The public grant must be objectViewer (read only) — allUsers must never be able to write or delete site assets"
  }

  assert {
    condition     = google_storage_bucket_iam_member.public_read.member == "allUsers"
    error_message = "A static site is served to the public: allUsers must hold the read grant, otherwise every visitor gets a 403"
  }
}

run "public_access_prevention_is_not_enforced" {
  command = plan

  # The inverse invariant of the backups bucket. Enforced prevention would override the allUsers
  # grant and 403 every visitor — a silent way to break the front on the next apply.
  assert {
    condition     = google_storage_bucket.this.public_access_prevention == "inherited"
    error_message = "Public access prevention must be 'inherited', not 'enforced' — this is the public static-site bucket, not the private backups bucket"
  }

  assert {
    condition     = google_storage_bucket.this.uniform_bucket_level_access == true
    error_message = "Uniform bucket-level access must stay on: the public read grant is expressed once in IAM, never through per-object ACLs"
  }
}

run "serves_a_website_entry_point" {
  command = plan

  assert {
    condition     = one(google_storage_bucket.this.website).main_page_suffix == "index.html"
    error_message = "The bucket must declare index.html as its main page so the site root resolves to the app entry point"
  }
}

run "versioning_enabled_with_short_rollback_window" {
  command = plan

  assert {
    condition     = google_storage_bucket.this.versioning[0].enabled == true
    error_message = "Versioning must be on so a botched deploy can be rolled back object by object"
  }

  assert {
    condition     = one(google_storage_bucket.this.lifecycle_rule[0].condition).with_state == "ARCHIVED"
    error_message = "The lifecycle rule must prune noncurrent (archived) versions only — the live site assets are never auto-deleted"
  }

  assert {
    condition     = one(google_storage_bucket.this.lifecycle_rule[0].condition).days_since_noncurrent_time == 7
    error_message = "Default rollback window for the static site is 7 days — a built bundle is cheaply rebuilt, so it is shorter than the backups bucket's"
  }
}

run "public_base_url_is_the_google_shared_endpoint" {
  command = plan

  # No custom domain, no CDN, no load balancer (issue #12): the front is reached over Google's
  # shared HTTPS endpoint. A wrong URL here is what the operator would hand out as the site.
  assert {
    condition     = output.public_base_url == "https://storage.googleapis.com/pick-a-book-web-test/index.html"
    error_message = "public_base_url must be the storage.googleapis.com HTTPS endpoint for this bucket — free HTTPS with no load balancer, per the static-site decision"
  }
}

run "location_is_the_given_region" {
  command = plan

  assert {
    condition     = google_storage_bucket.this.location == var.location
    error_message = "Bucket location must match the region passed in — kept identical across the infra"
  }
}
