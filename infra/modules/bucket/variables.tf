variable "project_id" {
  description = "GCP project ID the bucket belongs to."
  type        = string
}

variable "name" {
  description = "Bucket name. Must be globally unique across all of GCS."
  type        = string
}

variable "location" {
  description = "Bucket location — kept identical to the region of the rest of the infra (issue #12: single region)."
  type        = string
}

variable "noncurrent_version_retention_days" {
  description = "Days a noncurrent (overwritten) object version is kept before deletion. Current objects (the dated snapshots themselves) are never auto-deleted. Default of 30 is a reasonable placeholder, not a settled arbitration — issue #12 leaves the real cadence and retention open, to revisit once the database's actual size is known (ADR 0006, question ouverte)."
  type        = number
  default     = 30
}
