variable "project_id" {
  description = "GCP project ID the bucket belongs to."
  type        = string
}

variable "name" {
  description = "Bucket name. Must be globally unique across all of GCS."
  type        = string
}

variable "location" {
  description = "Bucket location — kept identical to the region of the rest of the infra."
  type        = string
}

variable "main_page" {
  description = "Object served for a request to the site root (and, over the HTTP website endpoint, for any directory)."
  type        = string
  default     = "index.html"
}

variable "not_found_page" {
  description = "Object served for a missing path over the HTTP website endpoint. Defaults to index.html so a single-page app's client routing takes over. Has no effect over the https://storage.googleapis.com/ endpoint the front is actually reached on — see main.tf."
  type        = string
  default     = "index.html"
}

variable "noncurrent_version_retention_days" {
  description = "Days a noncurrent (overwritten) object version is kept before deletion. Current objects are never auto-deleted. A static build is cheaply rebuilt from source, so the rollback window is short by default."
  type        = number
  default     = 7
}
