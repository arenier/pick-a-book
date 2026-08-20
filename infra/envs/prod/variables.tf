variable "project_id" {
  description = "GCP project ID. Non-secret, committed in prod.tfvars."
  type        = string
}

variable "region" {
  description = "Single region for every resource in this environment. Non-secret, committed in prod.tfvars."
  type        = string
}

variable "neon_org_id" {
  description = "Neon organization ID the Postgres project belongs to. Non-secret (an identifier, not a credential), committed in prod.tfvars."
  type        = string
}
