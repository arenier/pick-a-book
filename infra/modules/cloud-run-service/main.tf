# Reusable for both apps/api and apps/web — the only differences between the two are the
# instantiation's variables, in infra/envs/prod.
#
# No volumes, ever: this module has no variable that could mount the backups bucket into a
# service.

resource "google_cloud_run_v2_service" "this" {
  project        = var.project_id
  name           = var.name
  location       = var.region
  ingress        = var.ingress
  client         = "terraform"
  client_version = "1"

  template {
    service_account                  = var.service_account_email
    timeout                          = var.request_timeout
    max_instance_request_concurrency = var.concurrency

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle = var.cpu_idle
      }

      startup_probe {
        tcp_socket {
          port = var.container_port
        }
        initial_delay_seconds = var.startup_probe_initial_delay_seconds
        period_seconds        = var.startup_probe_period_seconds
        timeout_seconds       = var.startup_probe_timeout_seconds
        failure_threshold     = var.startup_probe_failure_threshold
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

  lifecycle {
    # The image is deployed by a separate CI/CD pipeline, via `gcloud run deploy` or
    # equivalent, outside Terraform. Without this, the next `terraform apply` would revert
    # a real deployment back to the placeholder image.
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
