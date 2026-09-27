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
  description = "Secret Manager secret IDs the service account may read (roles/secretmanager.secretAccessor), scoped per-secret — never a project-wide secret role. Empty by default: a service account that needs no secrets gets none."
  type        = list(string)
  default     = []
}

variable "bucket_grants" {
  description = "Bucket-scoped object roles, one binding per entry, keyed by a static name chosen by the caller (e.g. `photos_write`). Empty by default: a service account that needs no bucket access gets no binding at all. Only object-level roles are accepted — none that can read or change a bucket's IAM policy, so a grant can never be used to hand out more access."
  type = map(object({
    bucket = string
    role   = string
  }))
  default = {}

  validation {
    condition = alltrue([
      for grant in values(var.bucket_grants) :
      contains(["roles/storage.objectCreator", "roles/storage.objectViewer"], grant.role)
    ])
    error_message = "bucket_grants only accepts roles/storage.objectCreator or roles/storage.objectViewer — objectAdmin and the legacy/bucket roles can change IAM policies."
  }
}
