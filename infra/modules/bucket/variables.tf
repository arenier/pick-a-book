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

variable "noncurrent_version_retention_days" {
  description = "Days a noncurrent (overwritten) object version is kept before deletion. Current objects (the dated snapshots themselves) are never auto-deleted. Default of 30 is a reasonable placeholder, not a settled arbitration — to revisit once the database's actual size is known."
  type        = number
  default     = 30
}
