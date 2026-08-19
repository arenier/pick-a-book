variable "project_id" {
  description = "GCP project ID the secrets belong to."
  type        = string
}

variable "secret_ids" {
  description = "Secret IDs to create, empty. Defaults to DATABASE_URL (Neon) and the two VLM provider keys."
  type        = list(string)
  default     = ["DATABASE_URL", "GEMINI_API_KEY", "OPENROUTER_API_KEY"]
}
