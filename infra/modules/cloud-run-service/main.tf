# Reusable for both apps/api and apps/web (issue #12: `cloud-run (api)` and
# `cloud-run (front)`). See the ADR 0004 revision note for why the front is a second Cloud
# Run service rather than a bucket + Cloud CDN: CDN needs an always-billed load balancer,
# which contradicts the "budget quasi nul" this ADR commits to.
#
# No volumes, ever: ADR 0006 removed the gcsfuse bucket mount, and this module has no
# variable that could reintroduce one.

resource "google_cloud_run_v2_service" "this" {
  project        = var.project_id
  name           = var.name
  location       = var.region
  ingress        = var.ingress
  client         = "terraform"
  client_version = "1"

  template {
    service_account = var.service_account_email

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
    # The image is deployed by the CI/CD pipeline that issue #12 explicitly leaves for a
    # later iteration ("CI complète = itération suivante"), via `gcloud run deploy` or
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
