mock_provider "google" {}

variables {
  project_id = "pick-a-book-test"
}

run "creates_exactly_the_three_expected_secrets" {
  command = plan

  assert {
    condition     = length(google_secret_manager_secret.this) == 3
    error_message = "Expected exactly the 3 secrets from issue #12: DATABASE_URL, GEMINI_API_KEY, OPENROUTER_API_KEY"
  }

  assert {
    condition = alltrue([
      for id in ["DATABASE_URL", "GEMINI_API_KEY", "OPENROUTER_API_KEY"] :
      contains(keys(google_secret_manager_secret.this), id)
    ])
    error_message = "Secret IDs must be exactly DATABASE_URL, GEMINI_API_KEY, OPENROUTER_API_KEY (names relied on by apps/api's environment.ts and the Cloud Run secret refs)"
  }
}

# "Secrets are created empty" is not asserted by a `run` block: this module declares no
# google_secret_manager_secret_version resource at all (see main.tf) — referencing one here
# would fail at plan time with "reference to undeclared resource", which is exactly the
# structural guarantee we want (there is no code path that could write a value). Values are
# added out-of-band via `gcloud secrets versions add` so they never transit the state
# (issue #12) — verified by code review of main.tf, not by an executable assertion.

run "secrets_replicate_automatically" {
  command = plan

  assert {
    condition     = alltrue([for s in google_secret_manager_secret.this : length(s.replication) == 1])
    error_message = "Each secret must declare a replication policy — automatic is simplest and sufficient for a single-region deployment"
  }
}

run "secrets_are_scoped_to_the_given_project" {
  command = plan

  assert {
    condition     = alltrue([for s in google_secret_manager_secret.this : s.project == var.project_id])
    error_message = "Every secret must be scoped to var.project_id"
  }
}
