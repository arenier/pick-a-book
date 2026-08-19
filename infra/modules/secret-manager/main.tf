# Secrets are created EMPTY — no google_secret_manager_secret_version resource anywhere in
# this module, deliberately. Values (DATABASE_URL, GEMINI_API_KEY, OPENROUTER_API_KEY) are
# added out-of-band with `gcloud secrets versions add`, by the maintainer, so they never
# transit the Terraform state (issue #12).

resource "google_secret_manager_secret" "this" {
  for_each = toset(var.secret_ids)

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}
