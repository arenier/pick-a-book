# Hermetic like every suite here: mock_provider, no GCP project, no credentials, no cost.
mock_provider "google" {}

variables {
  project_id            = "pick-a-book-test"
  region                = "europe-west1"
  name                  = "pick-a-book-db-backup"
  service_account_email = "pick-a-book-db-backup@pick-a-book-test.iam.gserviceaccount.com"
  env = {
    BACKUP_BUCKET      = "pick-a-book-test-backups"
    BACKUP_GENERATIONS = "8"
  }
  secret_env = {
    DATABASE_URL = "DATABASE_URL_DIRECT"
  }
  schedule = "17 3 * * 1"
}

run "creates_the_job_in_the_given_project_and_region" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_job.this.name == var.name && google_cloud_run_v2_job.this.project == var.project_id && google_cloud_run_v2_job.this.location == var.region
    error_message = "The job must carry the given name, in the given project and region"
  }

  assert {
    condition     = google_cloud_run_v2_job.this.template[0].template[0].service_account == var.service_account_email
    error_message = "The job must run as its own least-privilege service account, never the default compute SA"
  }
}

run "passes_plain_and_secret_variables_to_the_container" {
  command = plan

  assert {
    condition = alltrue([
      for k, v in var.env : contains([
        for e in google_cloud_run_v2_job.this.template[0].template[0].containers[0].env : e.name if e.value == v
      ], k)
    ])
    error_message = "Every plain variable must reach the container with its value"
  }

  assert {
    condition = alltrue([
      for k, secret in var.secret_env : contains([
        for e in google_cloud_run_v2_job.this.template[0].template[0].containers[0].env : e.name
        if length(e.value_source) > 0 && e.value_source[0].secret_key_ref[0].secret == secret
      ], k)
    ])
    error_message = "Every secret variable must be sourced from the Secret Manager secret it names"
  }

  assert {
    condition     = length(google_cloud_run_v2_job.this.template[0].template[0].containers[0].env) == length(var.env) + length(var.secret_env)
    error_message = "The container must get exactly the given variables, nothing more"
  }
}

run "a_failed_execution_is_not_retried_by_default" {
  command = plan

  # A retry would hide the failure the freshness alert is there to report, and a weekly
  # backup loses nothing by waiting for a human to look.
  assert {
    condition     = google_cloud_run_v2_job.this.template[0].template[0].max_retries == 0
    error_message = "max_retries must default to 0: a failing backup must fail visibly"
  }
}

run "the_schedule_runs_the_job_as_its_own_identity" {
  command = plan

  assert {
    condition     = google_cloud_scheduler_job.this[0].schedule == "17 3 * * 1" && google_cloud_scheduler_job.this[0].time_zone == "Europe/Paris"
    error_message = "The scheduler must fire on the given cron, read in Europe/Paris time by default"
  }

  assert {
    condition     = google_cloud_scheduler_job.this[0].http_target[0].http_method == "POST"
    error_message = "Running a Cloud Run job is a POST on its :run endpoint"
  }

  assert {
    condition     = google_cloud_scheduler_job.this[0].http_target[0].oauth_token[0].service_account_email == var.service_account_email
    error_message = "The scheduler must call the Run API as the job's own service account — no second identity to grant"
  }

  assert {
    condition     = google_cloud_run_v2_job_iam_member.scheduler_invoker[0].role == "roles/run.invoker" && google_cloud_run_v2_job_iam_member.scheduler_invoker[0].name == var.name
    error_message = "The identity the scheduler uses must be allowed to run this job, and this job only"
  }
}

run "the_scheduler_targets_this_jobs_run_endpoint" {
  command = apply

  # The job id is provider-computed: only after apply does the mock give it a value to check.
  override_resource {
    target = google_cloud_run_v2_job.this
    values = {
      id = "projects/pick-a-book-test/locations/europe-west1/jobs/pick-a-book-db-backup"
    }
  }

  assert {
    condition     = google_cloud_scheduler_job.this[0].http_target[0].uri == "https://run.googleapis.com/v2/projects/pick-a-book-test/locations/europe-west1/jobs/pick-a-book-db-backup:run"
    error_message = "The scheduler must POST to the Run API's :run endpoint of this very job"
  }
}

run "without_a_schedule_the_job_only_runs_on_demand" {
  command = plan

  variables {
    schedule = null
  }

  assert {
    condition     = length(google_cloud_scheduler_job.this) == 0 && length(google_cloud_run_v2_job_iam_member.scheduler_invoker) == 0
    error_message = "No schedule means no scheduler and no invoker grant"
  }
}

run "deletion_protection_is_on_by_default" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_job.this.deletion_protection == true
    error_message = "deletion_protection must default to true: a job removed from config is not destroyed in the same apply"
  }
}
