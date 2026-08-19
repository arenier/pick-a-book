# No `credentials` attribute here on purpose: the google provider reads GOOGLE_CREDENTIALS
# from the environment (a service account JSON key, base64-encoded in this deployment) —
# never written to a file inside the repo or the state.
provider "google" {
  project = var.project_id
  region  = var.region
}

# No `api_key` attribute here either: the neon provider reads NEON_API_KEY from the
# environment — never written to a file inside the repo or the state.
provider "neon" {}
