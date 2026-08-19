# Only the root config wires modules together (README of docs/adr, issue #12): a module
# never depends on another module directly. Order follows the routine's build order —
# project first, everything else depends on its APIs being enabled.

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

# Backups only — pg_dump dumps and dated snapshots (ADR 0006). Strictly private, opposite
# access policy from a would-be static-site bucket (issue #12 point 2): the two are never
# the same bucket, and this repo does not provision a static-site bucket at all — the front
# is a second Cloud Run service instead (ADR 0004 revision note).
module "bucket" {
  source = "../../modules/bucket"

  project_id = var.project_id
  name       = "${var.project_id}-backups"
  location   = var.region

  depends_on = [module.project]
}

module "secret_manager" {
  source = "../../modules/secret-manager"

  project_id = var.project_id

  depends_on = [module.project]
}

module "service_account" {
  source = "../../modules/service-account"

  project_id   = var.project_id
  account_id   = "pick-a-book-api"
  display_name = "pick-a-book Cloud Run runtime"
  secret_ids   = module.secret_manager.secret_ids
  bucket_name  = module.bucket.bucket_name
}

# apps/api. env is intentionally minimal: the application code has not yet caught up to
# ADR 0006 (Postgres/Neon) or to the "shelf photos are ephemeral, not stored" decision
# (issue #12) — .env.example and docker-compose.yml still describe the earlier
# SQLite-on-bucket shape at the time of this PR. Wiring more than NODE_ENV here would mean
# inventing a contract the code doesn't have yet.
module "cloud_run_api" {
  source = "../../modules/cloud-run-service"

  project_id            = var.project_id
  region                = var.region
  name                  = "pick-a-book-api"
  service_account_email = module.service_account.email

  env = {
    NODE_ENV = "production"
  }

  secret_env = {
    DATABASE_URL       = "DATABASE_URL"
    GEMINI_API_KEY     = "GEMINI_API_KEY"
    OPENROUTER_API_KEY = "OPENROUTER_API_KEY"
  }
}

# apps/web. No production image or Dockerfile exists yet for the front (docker/web.Dockerfile
# is explicitly the *development* image — see its header comment); this service is created
# now, pointed at the public placeholder, so the URL and the deployment target exist ahead of
# that follow-up work (see the PR notes for the full gap list).
module "cloud_run_web" {
  source = "../../modules/cloud-run-service"

  project_id            = var.project_id
  region                = var.region
  name                  = "pick-a-book-web"
  service_account_email = module.service_account.email
}
