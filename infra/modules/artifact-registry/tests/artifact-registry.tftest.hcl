mock_provider "google" {}

variables {
  project_id = "pick-a-book-test"
  region     = "europe-west1"
}

run "creates_a_docker_repository_in_the_given_region" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.this.format == "DOCKER"
    error_message = "The repository must hold Docker images built from docker/api.Dockerfile (and, eventually, a web image)"
  }

  assert {
    condition     = google_artifact_registry_repository.this.location == var.region
    error_message = "The repository must live in the same region as the rest of the infra"
  }

  assert {
    condition     = google_artifact_registry_repository.this.project == var.project_id
    error_message = "The repository must be scoped to the given project"
  }
}

run "vulnerability_scanning_is_disabled" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.this.vulnerability_scanning_config[0].enablement_config == "DISABLED"
    error_message = "On-demand CVE scanning is billed per scan and must be explicitly disabled, not left on the account-wide default"
  }
}

run "exposes_the_full_repository_url" {
  command = plan

  variables {
    project_id    = "pick-a-book-test"
    region        = "europe-west1"
    repository_id = "pick-a-book"
  }

  assert {
    condition     = output.repository_url == "europe-west1-docker.pkg.dev/pick-a-book-test/pick-a-book"
    error_message = "repository_url must be the pushable Docker repo path used by `docker push`/`gcloud run deploy`"
  }
}
