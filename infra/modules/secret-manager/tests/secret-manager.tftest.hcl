mock_provider "google" {}

variables {
  project_id = "pick-a-book-test"
}

run "creates_exactly_the_three_expected_secrets" {
  command = plan

  assert {
    condition     = length(google_secret_manager_secret.this) == 3
    error_message = "Expected exactly the 3 secrets: DATABASE_URL, GEMINI_API_KEY, OPENROUTER_API_KEY"
  }

  assert {
    condition = alltrue([
      for id in ["DATABASE_URL", "GEMINI_API_KEY", "OPENROUTER_API_KEY"] :
      contains(keys(google_secret_manager_secret.this), id)
    ])
    error_message = "Secret IDs must be exactly DATABASE_URL, GEMINI_API_KEY, OPENROUTER_API_KEY (names relied on by apps/api's environment.ts and the Cloud Run secret refs)"
  }
}

# Secrets stay empty by default: with no secret_values entry, no
# google_secret_manager_secret_version is created for that secret — verified by
# "no_version_created_for_secrets_without_a_value" below. Values are added out-of-band via
# `gcloud secrets versions add` for GEMINI_API_KEY and OPENROUTER_API_KEY, so they never
# transit the state. DATABASE_URL is the sole exception: it is a Neon-managed resource
# output, not a hand-entered secret, so it is allowed to transit the state via secret_values
# (issue #12, decisions comment, point 4).

run "secret_values_creates_a_version_only_for_the_given_keys" {
  command = plan

  variables {
    project_id    = "pick-a-book-test"
    secret_values = { DATABASE_URL = "postgresql://user:pass@host/db" }
  }

  assert {
    condition     = length(google_secret_manager_secret_version.this) == 1
    error_message = "Exactly one secret version must be created — only for the key present in secret_values"
  }

  assert {
    condition     = contains(keys(google_secret_manager_secret_version.this), "DATABASE_URL")
    error_message = "The version created must be for DATABASE_URL, the key passed in secret_values"
  }
}

run "no_version_created_for_secrets_without_a_value" {
  command = plan

  assert {
    condition     = length(google_secret_manager_secret_version.this) == 0
    error_message = "With the default empty secret_values, no secret version must be created for any secret — GEMINI_API_KEY and OPENROUTER_API_KEY are always filled out-of-band"
  }
}

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
