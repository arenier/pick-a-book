variable "project_id" {
  description = "GCP project ID the secrets belong to."
  type        = string
}

variable "secret_ids" {
  description = "Secret IDs to create, empty. Defaults to DATABASE_URL (Neon) and the two VLM provider keys."
  type        = list(string)
  default     = ["DATABASE_URL", "GEMINI_API_KEY", "OPENROUTER_API_KEY"]
}

variable "secret_values" {
  description = "Values to write immediately for a subset of secret_ids, keyed by secret ID. Empty by default — every secret_id not present here stays empty, filled out-of-band with `gcloud secrets versions add` so its value never transits the state. Reserved for DATABASE_URL, whose value is a Neon-managed resource output rather than a hand-entered secret (issue #12, decisions comment, point 4)."
  type        = map(string)
  sensitive   = true
  default     = {}
}
