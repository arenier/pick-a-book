mock_provider "neon" {}

variables {
  org_id = "org-jolly-fire-32376830"
}

run "project_is_created_in_the_given_org_and_region" {
  command = plan

  assert {
    condition     = neon_project.this.org_id == var.org_id
    error_message = "The project must be created in the given Neon organization, not a personal account — omitting org_id can create the project in the wrong place"
  }

  assert {
    condition     = neon_project.this.region_id == "aws-eu-central-1"
    error_message = "Default region must be aws-eu-central-1 (Frankfurt) — the closest Neon region to europe-west1, where the rest of the infra lives"
  }
}

run "project_name_defaults_to_pick_a_book" {
  command = plan

  assert {
    condition     = neon_project.this.name == "pick-a-book"
    error_message = "Default project name must be pick-a-book"
  }
}

run "project_name_is_overridable" {
  command = plan

  variables {
    org_id       = "org-jolly-fire-32376830"
    project_name = "pick-a-book-custom"
  }

  assert {
    condition     = neon_project.this.name == "pick-a-book-custom"
    error_message = "project_name must be overridable via the module variable"
  }
}

run "region_is_overridable" {
  command = plan

  variables {
    org_id    = "org-jolly-fire-32376830"
    region_id = "aws-us-east-1"
  }

  assert {
    condition     = neon_project.this.region_id == "aws-us-east-1"
    error_message = "region_id must be overridable via the module variable"
  }
}

run "database_url_output_uses_the_pooled_connection" {
  command = plan

  # The mock provider leaves connection_uri_pooler/connection_uri unknown at plan time
  # (they're API-computed); overriding pins both to distinct known values so the assertion
  # can prove *which one* database_url exposes, not just that it resolves to something.
  override_resource {
    target          = neon_project.this
    override_during = plan
    values = {
      connection_uri        = "postgresql://direct-not-pooled/db"
      connection_uri_pooler = "postgresql://pooled/db"
    }
  }

  assert {
    condition     = output.database_url == "postgresql://pooled/db"
    error_message = "database_url must expose the pooler connection URI, not the direct one — Cloud Run's serverless, bursty connection pattern needs pgbouncer pooling to avoid exhausting Postgres connections"
  }
}
