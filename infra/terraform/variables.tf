variable "project_id" {
  description = "Globally unique GCP project ID to create (lowercase letters, digits, hyphens, 6-30 chars)."
  type        = string
}

variable "project_display_name" {
  description = "Human-readable project name shown in the GCP console."
  type        = string
  default     = "pick-a-book"
}

variable "billing_account" {
  description = "Billing account ID to attach to the project (see `gcloud billing accounts list`)."
  type        = string
  sensitive   = true
}

variable "org_id" {
  description = "Organization ID to create the project under. Leave null for a personal Google account with no Cloud Identity org."
  type        = string
  default     = null
}

variable "folder_id" {
  description = "Folder ID to create the project under. Mutually exclusive with org_id. Leave null if unused."
  type        = string
  default     = null
}

variable "region" {
  description = "Default GCP region for regional resources."
  type        = string
  default     = "europe-west1"
}

variable "experiment_bucket_name" {
  description = "Globally unique GCS bucket name for the experimentation photos."
  type        = string
  default     = "" # falls back to "${var.project_id}-experiments" when empty, see locals.tf
}

variable "experiment_photos_dir" {
  description = "Local directory (not versioned in git) to upload as experimentation photos. Relative to this module's directory."
  type        = string
  default     = "./data/experiment-photos"
}
