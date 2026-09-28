variable "project_id" {
  description = "GCP project ID. Non-secret, committed in prod.auto.tfvars."
  type        = string
}

variable "region" {
  description = "Single region for every resource in this environment. Non-secret, committed in prod.auto.tfvars."
  type        = string
}

variable "neon_org_id" {
  description = "Neon organization ID the Postgres project belongs to. Non-secret (an identifier, not a credential), committed in prod.auto.tfvars."
  type        = string
}

variable "alert_email" {
  description = "Where the backup freshness alert is sent. Personal data in a public repository: never in prod.auto.tfvars — export TF_VAR_alert_email before plan/apply."
  type        = string
}

variable "backup_generations" {
  description = "Snapshots the backup job keeps after each successful run (issue #22): 8 weekly snapshots, about two months."
  type        = number
  default     = 8
}
