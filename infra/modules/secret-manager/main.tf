# Secrets are created EMPTY by default — GEMINI_API_KEY and OPENROUTER_API_KEY get no
# google_secret_manager_secret_version, ever. Their values are added out-of-band with
# `gcloud secrets versions add`, by the maintainer, so they never transit the Terraform
# state. DATABASE_URL is the sole exception: it is a Neon-managed resource output, not a
# hand-entered secret, so its value is allowed to transit the state via secret_values.

resource "google_secret_manager_secret" "this" {
  for_each = toset(var.secret_ids)

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "this" {
  # Terraform refuses a sensitive value as a for_each key, since it could leak into resource
  # addresses/state paths — only the secret IDs (map keys) are iterated on, never sensitive.
  for_each = toset(nonsensitive(keys(var.secret_values)))

  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = var.secret_values[each.key]
}
