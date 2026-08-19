variable "project_id" {
  description = "GCP project ID the repository belongs to."
  type        = string
}

variable "region" {
  description = "Region the repository lives in — kept identical to the bucket, Cloud Run services and tfstate backend."
  type        = string
}

variable "repository_id" {
  description = "Repository ID, used in the pushable image path."
  type        = string
  default     = "pick-a-book"
}

variable "description" {
  description = "Human-readable repository description."
  type        = string
  default     = "Docker images for pick-a-book (apps/api, apps/web)"
}
