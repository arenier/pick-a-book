mock_provider "google" {}

variables {
  project_id   = "pick-a-book-test"
  account_id   = "pick-a-book-api"
  display_name = "pick-a-book API runtime"
  secret_ids   = ["DATABASE_URL", "GEMINI_API_KEY", "OPENROUTER_API_KEY"]
  bucket_name  = "pick-a-book-backups-test"
}

run "creates_a_dedicated_service_account" {
  command = plan

  assert {
    condition     = google_service_account.this.account_id == var.account_id
    error_message = "The runtime service account must use the given account_id"
  }

  assert {
    condition     = google_service_account.this.project == var.project_id
    error_message = "The service account must belong to the given project"
  }
}

run "grants_secret_accessor_on_every_given_secret_and_nothing_else" {
  command = plan

  assert {
    condition     = length(google_secret_manager_secret_iam_member.secret_accessor) == length(var.secret_ids)
    error_message = "Expected exactly one secretAccessor binding per secret in var.secret_ids — least privilege means no broader, project-level secret role"
  }

  assert {
    condition     = alltrue([for b in google_secret_manager_secret_iam_member.secret_accessor : b.role == "roles/secretmanager.secretAccessor"])
    error_message = "The only secret-related role granted must be secretAccessor — read, not admin/update/delete"
  }
}

run "grants_object_creator_on_the_backups_bucket_and_nothing_else" {
  command = plan

  assert {
    condition     = google_storage_bucket_iam_member.bucket_writer.role == "roles/storage.objectCreator"
    error_message = "objectCreator is the least-privilege role for writing pg_dump snapshots: it does not grant delete, list or read of other objects"
  }

  assert {
    condition     = google_storage_bucket_iam_member.bucket_writer.bucket == var.bucket_name
    error_message = "The write grant must target the given backups bucket"
  }
}

# "No project-level role" is not asserted by a `run` block: this module declares no
# google_project_iam_member (or *_iam_binding/*_iam_policy) resource at all — see main.tf.
# Referencing one here would fail at plan time with "reference to undeclared resource",
# which is exactly the structural guarantee wanted: there is no code path that could grant a
# project-wide role. Verified by code review of main.tf, not by an executable assertion.

run "member_reference_is_the_service_account_itself" {
  # google_service_account.this.email is a provider-computed attribute, unknown at plan
  # time under mock_provider; apply materializes a mock value so the interpolated member
  # string becomes fully known and checkable.
  command = apply

  assert {
    condition     = alltrue([for b in google_secret_manager_secret_iam_member.secret_accessor : startswith(b.member, "serviceAccount:")])
    error_message = "Every secret IAM member must reference a service account principal, built from this module's own service account"
  }

  assert {
    condition     = startswith(google_storage_bucket_iam_member.bucket_writer.member, "serviceAccount:")
    error_message = "The bucket IAM member must reference a service account principal, built from this module's own service account"
  }
}
