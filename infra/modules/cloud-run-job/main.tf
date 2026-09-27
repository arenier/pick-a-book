# A Cloud Run Job — a container that runs to completion, rather than a service that answers
# requests — optionally fired on a cron by Cloud Scheduler. First user: the weekly pg_dump of
# ADR 0006 (issue #22).

resource "google_cloud_run_v2_job" "this" {
  project             = var.project_id
  name                = var.name
  location            = var.region
  deletion_protection = var.deletion_protection
  client              = "terraform"
  client_version      = "1"

  template {
    task_count = 1

    template {
      service_account = var.service_account_email
      timeout         = var.task_timeout
      max_retries     = var.max_retries

      containers {
        image = var.image

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        dynamic "env" {
          for_each = var.env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = var.secret_env
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  lifecycle {
    # Same reasons as the cloud-run-service module: the image is deployed outside Terraform
    # (`yarn deploy:db-backup`), which also stamps client/client_version.
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# The scheduler calls the Run API as the job's own identity, so that identity must be allowed
# to run this job — on the job itself, never project-wide.
resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  count = var.schedule == null ? 0 : 1

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.this.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_account_email}"
}

resource "google_cloud_scheduler_job" "this" {
  count = var.schedule == null ? 0 : 1

  project   = var.project_id
  region    = var.region
  name      = var.name
  schedule  = var.schedule
  time_zone = var.time_zone

  # The job reports its own failures (failed execution, freshness alert): a scheduler retry
  # would only start a second dump on top of a failing one.
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.this.id}:run"

    oauth_token {
      service_account_email = var.service_account_email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_invoker]
}
