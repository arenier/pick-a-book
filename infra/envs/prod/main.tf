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

# The API is the only service that touches Secret Manager and the backups bucket, so it gets
# its own dedicated, narrower service account rather than sharing one with the front — a
# service account with grants it never uses is not least privilege.
module "service_account_api" {
  source = "../../modules/service-account"

  project_id   = var.project_id
  account_id   = "pick-a-book-api"
  display_name = "pick-a-book API runtime"
  secret_ids   = module.secret_manager.secret_ids
  bucket_name  = module.bucket.bucket_name
}

# apps/api. NODE_ENV is the only plain env var: the rest of the boot contract is DATABASE_URL
# and the VLM keys, all injected as secrets below. There is no STORAGE_BUCKET — the app
# dropped the leftover object-storage config once it caught up to the "shelf photos are
# ephemeral, not stored" decision (ADR 0006), so nothing else needs wiring here.
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

  env = {
    NODE_ENV = "production"
  }

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
