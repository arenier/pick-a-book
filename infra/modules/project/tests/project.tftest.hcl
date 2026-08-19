# Hermetic tests: mock_provider never talks to the real GCP API, so these run without
# credentials and without cost.
mock_provider "google" {}

variables {
  project_id = "pick-a-book-test"
}

run "enables_one_service_per_requested_api" {
  command = plan

  assert {
    condition     = length(google_project_service.this) == length(var.apis)
    error_message = "Expected exactly one google_project_service resource per API in var.apis"
  }
}

run "enables_the_apis_this_project_actually_needs" {
  command = plan

  assert {
    condition = alltrue([
      for api in [
        "run.googleapis.com",
        "artifactregistry.googleapis.com",
        "secretmanager.googleapis.com",
        "storage.googleapis.com",
        "iam.googleapis.com",
        "cloudresourcemanager.googleapis.com",
      ] : contains([for s in google_project_service.this : s.service], api)
    ])
    error_message = "Default API list must cover Cloud Run, Artifact Registry, Secret Manager, GCS, IAM and Resource Manager"
  }
}

run "never_disables_apis_on_destroy" {
  command = plan

  assert {
    condition     = alltrue([for s in google_project_service.this : s.disable_on_destroy == false])
    error_message = "The project pre-exists and is shared with other services (readeck, actual-server) — destroying this module must never disable their APIs"
  }
}

run "never_disables_dependent_services" {
  command = plan

  assert {
    condition     = alltrue([for s in google_project_service.this : s.disable_dependent_services == false])
    error_message = "Disabling dependent services could take down unrelated, already-running services in the shared project"
  }
}

run "targets_the_given_project_only" {
  command = plan

  assert {
    condition     = alltrue([for s in google_project_service.this : s.project == var.project_id])
    error_message = "Every service must be scoped to var.project_id — this module never creates or targets a different project"
  }
}
