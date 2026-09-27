# Only the root config wires modules together: a module never depends on another module
# directly. Project first, everything else depends on its APIs being enabled.

module "project" {
  source = "../../modules/project"

  project_id = var.project_id
}

module "artifact_registry" {
  source = "../../modules/artifact-registry"

  project_id = var.project_id
  region     = var.region

  depends_on = [module.project]
}

# Backups only — pg_dump dumps and dated snapshots. Strictly private, the exact opposite
# access policy from module.static_site (the public front): the two are never the same bucket
# and never share the `bucket`/`static-site` module.
module "bucket" {
  source = "../../modules/bucket"

  project_id = var.project_id
  name       = "${var.project_id}-backups"
  location   = var.region

  depends_on = [module.project]
}

# Reference photos for the recognition bench (issue #10): real shelf photos plus their
# ground truth, used to evaluate the VLM adapters offline. CLAUDE.md forbids committing them,
# so this bucket is the shared alternative to a gitignored local `fixtures/reference-photos/`
# folder. Personal, low-volume, no CI or runtime service ever touches it — accessed directly
# via the operator's own gcloud ADC (infra/README.md), so no dedicated service account.
module "bucket_reference_photos" {
  source = "../../modules/bucket"

  project_id = var.project_id
  name       = "${var.project_id}-reference-photos"
  location   = var.region

  depends_on = [module.project]
}

# Shelf photos (specs/001-photo-upload): every submitted photo is kept, keyed
# `{ownerId}/shelf_photo/{id}`. A bucket of its own rather than a prefix in the backups one:
# the photos are user data read back by the API, not dumps, and must share neither the backups'
# retention nor their restore.
module "bucket_shelf_photos" {
  source = "../../modules/bucket"

  project_id = var.project_id
  name       = "${var.project_id}-shelf-photos"
  location   = var.region

  depends_on = [module.project]
}

# Independent of the GCP project: Neon is a separate provider/account entirely, provisioned
# in parallel rather than depending on module.project.
module "neon" {
  source = "../../modules/neon"

  org_id = var.neon_org_id
}

module "secret_manager" {
  source = "../../modules/secret-manager"

  project_id = var.project_id

  # DATABASE_URL is the one secret Terraform fills directly: it's a Neon-managed resource
  # output, not a hand-entered secret, so letting it transit the state is the accepted
  # exception (issue #12, decisions comment, point 4). GEMINI_API_KEY and OPENROUTER_API_KEY
  # stay empty, filled out-of-band with `gcloud secrets versions add`.
  secret_values = {
    DATABASE_URL = module.neon.database_url
  }

  depends_on = [module.project]
}

locals {
  # On the shelf-photos bucket, create (store) and read (scan), no delete: a stored photo is
  # never replaced — the adapter writes with ifGenerationMatch: 0.
  api_bucket_grants = {
    backups_write = { bucket = module.bucket.bucket_name, role = "roles/storage.objectCreator" }
    photos_write  = { bucket = module.bucket_shelf_photos.bucket_name, role = "roles/storage.objectCreator" }
    photos_read   = { bucket = module.bucket_shelf_photos.bucket_name, role = "roles/storage.objectViewer" }
  }

  # The API's plain (non-secret) boot contract — apps/api/src/config/environment.ts. OWNER_ID
  # is left to its default until there are user accounts. WEB_ORIGIN is the front's origin
  # only (scheme + host): CORS compares it byte for byte with the browser's Origin header,
  # which never carries the bucket path of public_base_url.
  api_env = {
    NODE_ENV    = "production"
    BUCKET_NAME = module.bucket_shelf_photos.bucket_name
    WEB_ORIGIN  = regex("^https://[^/]+", module.static_site.public_base_url)
  }
}

# The API is the only service that touches Secret Manager and the buckets, so it gets its own
# dedicated, narrower service account rather than sharing one with the front — a service
# account with grants it never uses is not least privilege.
module "service_account_api" {
  source = "../../modules/service-account"

  project_id    = var.project_id
  account_id    = "pick-a-book-api"
  display_name  = "pick-a-book API runtime"
  secret_ids    = module.secret_manager.secret_ids
  bucket_grants = local.api_bucket_grants
}

# The backups grant predates bucket_grants. Without this, Terraform would destroy the old
# address and create the new one — the same IAM binding under two addresses, in no guaranteed
# order: a create that lands first is then undone by the destroy.
moved {
  from = module.service_account_api.google_storage_bucket_iam_member.bucket_writer[0]
  to   = module.service_account_api.google_storage_bucket_iam_member.bucket_grant["backups_write"]
}

# apps/api. Plain variables in local.api_env; DATABASE_URL and the VLM keys are injected as
# secrets below.
module "cloud_run_api" {
  source = "../../modules/cloud-run-service"

  project_id            = var.project_id
  region                = var.region
  name                  = "pick-a-book-api"
  service_account_email = module.service_account_api.email

  # The default startup probe budget (~9s) is too tight here: boot fail-fasts on
  # DATABASE_URL, and a cold Neon resume can stack on top of NestJS's own startup time on
  # the first request after scale-to-zero.
  startup_probe_failure_threshold = 10

  env = local.api_env

  secret_env = {
    DATABASE_URL       = "DATABASE_URL"
    GEMINI_API_KEY     = "GEMINI_API_KEY"
    OPENROUTER_API_KEY = "OPENROUTER_API_KEY"
  }
}

# apps/web. Served as a static site straight from a public GCS bucket, not a second Cloud Run
# service (issue #12, static-site reconciliation): the built Vite bundle is world-readable
# static files, so a container runtime buys nothing. Reached over Google's shared
# https://storage.googleapis.com/<bucket>/ endpoint — free HTTPS, no CDN and no load balancer,
# whose fixed monthly cost a custom domain would add for no benefit at this volume (ADR 0004).
# No service account: a public object store has no runtime identity; the built bundle is
# uploaded with the operator's own ADC, like the reference-photos bucket.
module "static_site" {
  source = "../../modules/static-site"

  project_id = var.project_id
  name       = "${var.project_id}-web"
  location   = var.region

  depends_on = [module.project]
}
