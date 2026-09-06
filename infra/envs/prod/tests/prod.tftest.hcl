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
}

run "backups_bucket_is_named_after_the_project" {
  command = plan

  assert {
    condition     = output.backups_bucket_name == "pick-a-book-test-backups"
    error_message = "The backups bucket name must derive from project_id, not be hardcoded — a hardcoded name would collide the day a second environment is stood up, and GCS bucket names are globally unique"
  }
}

run "secret_manager_creates_exactly_the_secrets_the_api_consumes" {
  command = plan

  assert {
    condition     = toset(module.secret_manager.secret_ids) == toset(["DATABASE_URL", "GEMINI_API_KEY", "OPENROUTER_API_KEY"])
    error_message = "Cross-module contract: cloud_run_api references DATABASE_URL, GEMINI_API_KEY and OPENROUTER_API_KEY in its secret_env, so secret_manager must create exactly those. A secret renamed or dropped on one side only fails at deploy time, not at plan time — Cloud Run rejects a secret reference it cannot resolve"
  }
}

run "artifact_registry_is_in_the_configured_project_and_region" {
  command = plan

  assert {
    condition     = output.artifact_registry_url == "europe-west1-docker.pkg.dev/pick-a-book-test/pick-a-book"
    error_message = "The pushable repository path must be built from the configured region and project — it is what the CD pipeline pushes to, and a wrong path fails at push time, far from here"
  }
}

run "the_api_exposes_its_runtime_identity" {
  command = plan

  # The email is provider-computed, so mock_provider leaves it unknown at plan time. Pinning it
  # to a known value is what lets the assertion prove the output exposes *this* service account.
  # It is also the only service account in the env now: the front is a public static bucket with
  # no runtime identity, so there is no second SA to accidentally swap it with.
  override_module {
    target = module.service_account_api
    outputs = {
      email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
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
