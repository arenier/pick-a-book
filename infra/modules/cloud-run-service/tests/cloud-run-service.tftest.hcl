# Reusable across both apps/api and apps/web: the only differences between the two are the
# instantiation's variables, in infra/envs/prod.
mock_provider "google" {}

variables {
  project_id            = "pick-a-book-test"
  region                = "europe-west1"
  name                  = "pick-a-book-api"
  service_account_email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
}

run "deploys_to_the_given_project_and_region" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.project == var.project_id
    error_message = "Service must be scoped to the given project"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.location == var.region
    error_message = "Service must live in the given region (single region across the infra)"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.name == var.name
    error_message = "Service name must match var.name"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.client == "terraform"
    error_message = "client identifies Terraform as the API caller — also a convenient no-op field to bump when a stuck revision needs a fresh create attempt without destroying the service"
  }
}

run "runs_as_the_given_service_account" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].service_account == var.service_account_email
    error_message = "The service must run as the least-privilege service account provisioned by the service-account module, not the default compute SA"
  }
}

run "has_no_bucket_volume_mounted" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].volumes) == 0
    error_message = "No Cloud Run service may mount the backups bucket as a volume"
  }
}

run "default_image_is_a_public_placeholder" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].image == "us-docker.pkg.dev/cloudrun/container/hello:latest"
    error_message = "No production image exists yet for either app at this stage of the infra bootstrap; the default must be Google's public placeholder so `terraform apply` can create the service without a prior image push"
  }
}

run "image_is_overridable" {
  command = plan

  variables {
    project_id            = "pick-a-book-test"
    region                = "europe-west1"
    name                  = "pick-a-book-api"
    service_account_email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
    image                 = "europe-west1-docker.pkg.dev/pick-a-book-test/pick-a-book/api:abc123"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].image == "europe-west1-docker.pkg.dev/pick-a-book-test/pick-a-book/api:abc123"
    error_message = "A real image reference must override the placeholder default"
  }
}

run "container_port_defaults_to_the_apps_convention" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].ports[0].container_port == 3000
    error_message = "apps/api and apps/web both default to port 3000 in this repo (.env.example, docker/); Cloud Run injects PORT to match"
  }
}

run "plain_env_vars_are_passed_through" {
  command = plan

  variables {
    project_id            = "pick-a-book-test"
    region                = "europe-west1"
    name                  = "pick-a-book-api"
    service_account_email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
    env = {
      NODE_ENV       = "production"
      STORAGE_BUCKET = "pick-a-book-photos"
    }
  }

  assert {
    condition = alltrue([
      for k, v in { NODE_ENV = "production", STORAGE_BUCKET = "pick-a-book-photos" } :
      contains([
        for e in google_cloud_run_v2_service.this.template[0].containers[0].env : e.name if e.value == v
      ], k)
    ])
    error_message = "Every entry of var.env must appear as a plain container env var with a matching value"
  }
}

run "secret_env_vars_are_sourced_from_secret_manager" {
  command = plan

  variables {
    project_id            = "pick-a-book-test"
    region                = "europe-west1"
    name                  = "pick-a-book-api"
    service_account_email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
    secret_env = {
      DATABASE_URL = "DATABASE_URL"
    }
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.this.template[0].containers[0].env :
      e.name == "DATABASE_URL" && e.value_source[0].secret_key_ref[0].secret == "DATABASE_URL" && e.value_source[0].secret_key_ref[0].version == "latest"
    ])
    error_message = "Secret-backed env vars must reference Secret Manager (secret + version), never a literal value — this is how DATABASE_URL/GEMINI_API_KEY/OPENROUTER_API_KEY reach the container without transiting the image or the state as plaintext"
  }
}

run "max_instances_is_a_cost_cap_not_an_integrity_constraint" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].scaling[0].max_instance_count >= 1
    error_message = "max-instances is a cost cap, not an integrity constraint — it must still be settable, but the default must not be pinned to 1"
  }
}

run "min_instances_defaults_to_scale_to_zero" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].scaling[0].min_instance_count == 0
    error_message = "Scale-to-zero is the whole point of Cloud Run for this workload — default min_instances must be 0"
  }
}

run "has_a_startup_probe_on_the_container_port" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].startup_probe[0].tcp_socket[0].port == var.container_port
    error_message = "The startup probe must check the container's own port, so Cloud Run only routes traffic once the app is actually listening"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].startup_probe[0].failure_threshold >= 1
    error_message = "A startup probe with no failure threshold never fails, which defeats its purpose"
  }
}

run "has_an_explicit_request_timeout" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].timeout == "300s"
    error_message = "Request timeout must be explicit, not left on Cloud Run's implicit default"
  }
}

run "request_timeout_is_overridable" {
  command = plan

  variables {
    project_id            = "pick-a-book-test"
    region                = "europe-west1"
    name                  = "pick-a-book-api"
    service_account_email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
    request_timeout       = "60s"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].timeout == "60s"
    error_message = "Request timeout must be overridable per service"
  }
}

run "has_an_explicit_concurrency" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].max_instance_request_concurrency == 80
    error_message = "Concurrency must be explicit, not left on Cloud Run's implicit default"
  }
}

run "cpu_idle_defaults_to_true" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].resources[0].cpu_idle == true
    error_message = "CPU must be throttled outside request handling by default — required for min_instances = 0 to be economical"
  }
}

run "public_by_default_grants_run_invoker_to_all_users" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public_access) == 1
    error_message = "Both the API and the front are public services with no auth layer of their own — allUsers must get roles/run.invoker by default"
  }

  assert {
    condition     = google_cloud_run_v2_service_iam_member.public_access[0].member == "allUsers"
    error_message = "Public access must be granted to allUsers, not a narrower or broader principal"
  }

  assert {
    condition     = google_cloud_run_v2_service_iam_member.public_access[0].role == "roles/run.invoker"
    error_message = "run.invoker is the minimal role that allows unauthenticated HTTP access"
  }
}

run "allow_unauthenticated_false_grants_no_public_access" {
  command = plan

  variables {
    project_id            = "pick-a-book-test"
    region                = "europe-west1"
    name                  = "pick-a-book-api"
    service_account_email = "pick-a-book-api@pick-a-book-test.iam.gserviceaccount.com"
    allow_unauthenticated = false
  }

  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public_access) == 0
    error_message = "When allow_unauthenticated is false, no allUsers binding must be created"
  }
}
