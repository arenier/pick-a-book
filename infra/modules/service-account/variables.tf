variable "project_id" {
  description = "GCP project ID the service account belongs to."
  type        = string
}

variable "account_id" {
  description = "Service account ID (the local part of its email)."
  type        = string
}

variable "display_name" {
  description = "Human-readable service account name."
  type        = string
}

variable "secret_ids" {
  description = "Secret Manager secret IDs the service account may read (roles/secretmanager.secretAccessor), scoped per-secret — never a project-wide secret role."
  type        = list(string)
}

variable "bucket_name" {
  description = "Backups bucket the service account may write objects to (roles/storage.objectCreator), for the pg_dump job."
  type        = string
}
