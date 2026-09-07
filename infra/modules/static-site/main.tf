# Public static-site bucket for apps/web — the built Vite bundle is uploaded here and served
# directly by GCS. This is the exact opposite access policy from the `bucket` module (which is
# strictly private): a static site has to be world-readable, so the two never share a module.
#
# Deliberately no CDN and no HTTP(S) load balancer (issue #12, static-site reconciliation): the
# front is reached over Google's shared https://storage.googleapis.com/<bucket>/ endpoint, which
# gives free HTTPS with no fixed monthly cost — the load balancer a custom domain or Cloud CDN
# would require carries an hourly charge even at zero traffic, incompatible with "budget quasi
# nul" (ADR 0004). Accepted trade-off: a long default URL, no edge cache, and no server-side
# 404 -> index.html rewrite over that endpoint (the website{} block below only applies to the
# HTTP website endpoint), so apps/web owns SPA routing (hash routing, or an entry that is always
# index.html).

resource "google_storage_bucket" "this" {
  # checkov:skip=CKV_GCP_114: Public access prevention is intentionally NOT enforced — this is a
  # public static-site bucket by design (see the allUsers objectViewer binding below). Enforcing
  # it would make the front unreachable, which is the whole point of the bucket.
  # checkov:skip=CKV_GCP_62: Access logging needs a second bucket to hold the logs, adding cost
  # for a personal project. The bucket serves a public, reproducible build artifact — there is no
  # confidential access pattern for logs to protect.
  project                     = var.project_id
  name                        = var.name
  location                    = var.location
  uniform_bucket_level_access = true

  # Must be "inherited", not "enforced": a static site is public, and enforced public access
  # prevention would override the allUsers grant and 403 every visitor.
  public_access_prevention = "inherited"

  website {
    main_page_suffix = var.main_page
    not_found_page   = var.not_found_page
  }

  # Rollback safety net: an overwritten asset keeps its previous version, so a bad deploy can be
  # rolled back object by object. Noncurrent versions are pruned so storage does not grow
  # unbounded — the same shape as the backups bucket, tuned shorter since a static build is
  # cheaply rebuilt from source.
  versioning {
    enabled = true
  }

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

# World-readable objects: this is what makes the bucket a public website. Scoped to
# objectViewer (read only) — allUsers can read the assets, never list bucket metadata beyond
# the objects or write anything.
resource "google_storage_bucket_iam_member" "public_read" {
  # checkov:skip=CKV_GCP_28: Anonymous public read is the intended state — this bucket IS the
  # public front. The grant is scoped to objectViewer (read only), and only the built, public
  # web bundle is ever uploaded here; nothing private lives in this bucket by construction.
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
