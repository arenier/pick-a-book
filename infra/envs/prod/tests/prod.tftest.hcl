# Root-config tests: what only the assembly can get wrong. Each module already proves its own
# behaviour in modules/*/tests — what is left, and what these cover, is the wiring between them
# (ADR 0004): names derived from variables, the secret contract the API depends on, and each
# service getting its own identity.
#
# Hermetic like every other suite here: mock_provider means no GCP project, no Neon account,
# no credentials and no cost.

mock_provider "google" {}
mock_provider "neon" {}

variables {
  project_id  = "pick-a-book-test"
  region      = "europe-west1"
  neon_org_id = "org-test-32376830"
  alert_email = "someone@example.com"
}

run "backups_bucket_is_named_after_the_project" {
  command = plan

  assert {
    condition     = output.backups_bucket_name == "pick-a-book-test-backups"
    error_message = "The backups bucket name must derive from project_id, not be hardcoded — a hardcoded name would collide the day a second environment is stood up, and GCS bucket names are globally unique"
  }
}

run "secret_manager_creates_exactly_the_secrets_the_services_consume" {
  command = plan

  assert {
    condition     = toset(module.secret_manager.secret_ids) == toset(["DATABASE_URL", "DATABASE_URL_DIRECT", "GEMINI_API_KEY", "OPENROUTER_API_KEY"])
    error_message = "Cross-module contract: cloud_run_api references DATABASE_URL and the VLM keys, the backup job DATABASE_URL_DIRECT — secret_manager must create exactly those. A secret renamed or dropped on one side only fails at deploy time, not at plan time"
  }
}

run "each_identity_reads_only_the_database_url_it_uses" {
  command = plan

  # The API goes through the pooler; only the backup job may hold the direct connection.
  assert {
    condition     = toset(local.api_secret_ids) == toset(["DATABASE_URL", "GEMINI_API_KEY", "OPENROUTER_API_KEY"])
    error_message = "The API must read the pooled DATABASE_URL and the VLM keys only — never DATABASE_URL_DIRECT"
  }

  assert {
    condition     = local.backup_secret_ids == ["DATABASE_URL_DIRECT"]
    error_message = "The backup job must read the direct database URL and nothing else"
  }
}

run "artifact_registry_is_in_the_configured_project_and_region" {
  command = plan

  assert {
    condition     = output.artifact_registry_url == "europe-west1-docker.pkg.dev/pick-a-book-test/pick-a-book"
    error_message = "The pushable repository path must be built from the configured region and project — it is what the CD pipeline pushes to, and a wrong path fails at push time, far from here"
  }
}

run "region_output_reflects_the_configured_region" {
  command = plan

  # Deploy tooling (yarn deploy:api) reads `terraform output -raw region` for `gcloud run
  # deploy --region`. A wrong value here targets the wrong region at deploy time, far from here.
  assert {
    condition     = output.region == "europe-west1"
    error_message = "The region output must echo the configured region — deploy tooling relies on it as the single source of truth"
  }
}

run "the_api_exposes_its_runtime_identity" {
  command = plan

  # The email is provider-computed, so mock_provider leaves it unknown at plan time. Pinning it
  # to a known value is what lets the assertion prove the output exposes *this* service account.
  # The backup job's service account is pinned to another value, so that swapping the two
  # identities in the wiring fails here rather than in prod.
  override_module {
    target = module.service_account_api
    outputs = {
      email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
    }
  }

  override_module {
    target = module.service_account_db_backup
    outputs = {
      email = "pick-a-book-db-backup@pick-a-book-test.iam.gserviceaccount.com"
    }
  }

  assert {
    condition     = output.api_service_account_email == "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
    error_message = "api_service_account_email must expose the API's own service account — the one holding the Secret Manager and bucket grants"
  }
}

run "the_front_is_a_public_bucket_distinct_from_the_private_backups_bucket" {
  command = plan

  # Cross-module invariant the assembly can get wrong: the front (public) and the backups
  # (private) must be two different buckets. Sharing a name would either expose the backups or
  # break the front, and GCS bucket names are globally unique so the collision is real.
  assert {
    condition     = output.web_bucket_name == "pick-a-book-test-web"
    error_message = "The static-site bucket name must derive from project_id — a hardcoded name collides the day a second environment is stood up"
  }

  assert {
    condition     = output.web_bucket_name != output.backups_bucket_name
    error_message = "The public front bucket and the private backups bucket must never be the same bucket — their access policies are opposites"
  }

  assert {
    condition     = output.web_url == "https://storage.googleapis.com/pick-a-book-test-web/index.html"
    error_message = "web_url must be the storage.googleapis.com HTTPS endpoint for the front bucket — the static-site decision serves the front there, with no CDN or load balancer"
  }
}

run "shelf_photos_have_their_own_private_bucket" {
  command = plan

  # specs/001-photo-upload keeps every submitted photo: they need a bucket of their own —
  # never the backups bucket (a dump restore must not drag user photos along, and the photos
  # must not share the backups' retention), never the public front.
  assert {
    condition     = output.shelf_photos_bucket_name == "pick-a-book-test-shelf-photos"
    error_message = "The shelf-photos bucket name must derive from project_id — GCS bucket names are globally unique"
  }

  assert {
    condition     = !contains([output.backups_bucket_name, output.web_bucket_name, output.reference_photos_bucket_name], output.shelf_photos_bucket_name)
    error_message = "Shelf photos must live in a bucket of their own, distinct from backups, the public front and the bench's reference photos"
  }
}

run "the_api_boots_with_the_photo_bucket_and_the_front_origin" {
  command = plan

  # The API's boot contract (apps/api/src/config/environment.ts): BUCKET_NAME is required, and
  # WEB_ORIGIN is the one origin CORS lets through. Without them the service fails at boot, or
  # the front gets opaque CORS errors — both only visible after a deploy.
  assert {
    condition     = local.api_env.BUCKET_NAME == output.shelf_photos_bucket_name
    error_message = "The API must be pointed at the shelf-photos bucket through BUCKET_NAME — the variable is required at boot"
  }

  assert {
    condition     = local.api_env.WEB_ORIGIN == "https://storage.googleapis.com"
    error_message = "WEB_ORIGIN must be the front's origin — scheme and host only, no bucket path: CORS compares it byte for byte with the browser's Origin header"
  }
}

run "the_api_names_its_project_so_log_lines_link_to_their_trace" {
  command = plan

  # Cloud Logging attaches a log line to a trace only through the resource name
  # `projects/{project}/traces/{id}`. The API builds it from GOOGLE_CLOUD_PROJECT (issue #45);
  # without it the trace is a bare id that Cloud Logging cannot link, and nothing fails — the
  # correlation is quietly absent.
  assert {
    condition     = local.api_env.GOOGLE_CLOUD_PROJECT == var.project_id
    error_message = "The API must be told its project through GOOGLE_CLOUD_PROJECT, or its log lines cannot be linked to their Cloud Trace"
  }
}

run "the_api_can_write_and_read_shelf_photos_and_nothing_more" {
  command = plan

  assert {
    condition = toset([
      for grant in values(local.api_bucket_grants) : "${grant.bucket}:${grant.role}" if grant.bucket == output.shelf_photos_bucket_name
      ]) == toset([
      "pick-a-book-test-shelf-photos:roles/storage.objectCreator",
      "pick-a-book-test-shelf-photos:roles/storage.objectViewer",
    ])
    error_message = "On the shelf-photos bucket the API needs exactly create (store) and read (scan) — no delete: a stored photo is never replaced (ifGenerationMatch: 0)"
  }
}

run "the_api_no_longer_touches_the_backups_bucket" {
  command = plan

  # Backups are the job's business: an API with write access to them is one more path to
  # corrupt the only copy that survives a lost database.
  assert {
    condition     = alltrue([for grant in values(local.api_bucket_grants) : grant.bucket != output.backups_bucket_name])
    error_message = "The API must hold no grant on the backups bucket"
  }
}

run "the_backup_job_prunes_its_own_bucket_and_nothing_else" {
  command = plan

  assert {
    condition = [for grant in values(local.backup_bucket_grants) : "${grant.bucket}:${grant.role}"] == [
      "pick-a-book-test-backups:roles/storage.objectUser",
    ]
    error_message = "The backup job needs create, list and delete on the backups bucket (objectUser) — and no access to any other bucket"
  }
}

run "the_backup_job_gets_its_contract" {
  command = plan

  # tools/db-backup/src/lib/configuration.ts: DATABASE_URL, BACKUP_BUCKET, BACKUP_GENERATIONS.
  assert {
    condition     = local.backup_job_env == { BACKUP_BUCKET = "pick-a-book-test-backups", BACKUP_GENERATIONS = "8" }
    error_message = "The job must be pointed at the backups bucket and keep 8 generations (issue #22)"
  }

  assert {
    condition     = local.backup_job_secret_env == { DATABASE_URL = "DATABASE_URL_DIRECT" }
    error_message = "The job's DATABASE_URL must come from the direct (unpooled) connection secret"
  }
}

run "the_backup_runs_weekly_and_alerts_past_eight_days" {
  command = plan

  assert {
    condition     = local.backup_schedule == "17 3 * * 1"
    error_message = "The backup runs weekly (issue #22): Monday 03:17, Paris time"
  }

  assert {
    condition     = local.backup_max_age == "8d"
    error_message = "The freshness alert allows one week plus a day of margin — no more, or a dead job goes unnoticed longer than a missed run"
  }

  assert {
    condition     = output.backup_job_name == "pick-a-book-db-backup"
    error_message = "backup_job_name is what yarn deploy:db-backup updates — it must name the job"
  }
}

run "the_api_receives_the_default_daily_scan_limit" {
  command = plan

  # specs/002-upload-history, FR-015: the cap on analyses a day is what bounds the bill while the
  # history is open to anyone. The API reads it from DAILY_SCAN_LIMIT and defaults to the same 50
  # (apps/api/src/config/environment.ts): passing it explicitly makes the cap visible, and
  # changeable, where production is configured — with no code deploy.
  assert {
    condition     = local.api_env["DAILY_SCAN_LIMIT"] == "50"
    error_message = "The API must be given the daily scan limit, 50 by default — left implicit, the production cap would only live in the API's code and nobody configuring the environment would see it"
  }
}

run "the_daily_scan_limit_is_configurable" {
  command = plan

  variables {
    daily_scan_limit = 12
  }

  assert {
    condition     = local.api_env["DAILY_SCAN_LIMIT"] == "12"
    error_message = "daily_scan_limit must reach the API as DAILY_SCAN_LIMIT, as a string — the cap is changed in prod.auto.tfvars, not by editing the API"
  }
}

run "the_daily_scan_limit_rejects_zero" {
  command = plan

  variables {
    daily_scan_limit = 0
  }

  # The API refuses 0 at boot (a positive integer): rejecting it here too turns a failed deploy
  # into a failed plan.
  expect_failures = [var.daily_scan_limit]
}

run "the_daily_scan_limit_rejects_a_fraction" {
  command = plan

  variables {
    daily_scan_limit = 1.5
  }

  expect_failures = [var.daily_scan_limit]
}

run "the_api_receives_the_default_daily_upload_limit" {
  command = plan

  # specs/002-upload-history, FR-017: the cap on uploads a day is what bounds the storage while the
  # API is open to anyone. The API reads it from DAILY_UPLOAD_LIMIT and defaults to the same 100
  # (apps/api/src/config/daily-upload-limit.ts): passing it explicitly makes the cap visible, and
  # changeable, where production is configured — with no code deploy.
  assert {
    condition     = local.api_env["DAILY_UPLOAD_LIMIT"] == "100"
    error_message = "The API must be given the daily upload limit, 100 by default — left implicit, the production cap would only live in the API's code and nobody configuring the environment would see it"
  }
}

run "the_daily_upload_limit_is_configurable" {
  command = plan

  variables {
    daily_upload_limit = 12
  }

  assert {
    condition     = local.api_env["DAILY_UPLOAD_LIMIT"] == "12"
    error_message = "daily_upload_limit must reach the API as DAILY_UPLOAD_LIMIT, as a string — the cap is changed in prod.auto.tfvars, not by editing the API"
  }
}

run "the_daily_upload_limit_rejects_zero" {
  command = plan

  variables {
    daily_upload_limit = 0
  }

  # The API refuses 0 at boot (a positive integer): rejecting it here too turns a failed deploy
  # into a failed plan.
  expect_failures = [var.daily_upload_limit]
}

run "the_daily_upload_limit_rejects_a_fraction" {
  command = plan

  variables {
    daily_upload_limit = 1.5
  }

  expect_failures = [var.daily_upload_limit]
}

run "the_api_env_keeps_node_env_production" {
  command = plan

  assert {
    condition     = local.api_env["NODE_ENV"] == "production"
    error_message = "The API must run with NODE_ENV=production: it is what turns on the JSON logs Cloud Logging reads and makes WEB_ORIGIN required"
  }
}

