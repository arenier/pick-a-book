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

variable "daily_scan_limit" {
  description = "Analyses the API allows per day, uploads and re-scans together, counted from midnight in Paris (specs/002-upload-history, FR-015) — what bounds the VLM bill while the history is open to anyone. Passed to the API as DAILY_SCAN_LIMIT. The default and the validation mirror apps/api/src/config/environment.ts, and the two are kept in step by hand. To change the cap, set daily_scan_limit in prod.auto.tfvars."
  type        = number
  default     = 50

  validation {
    condition     = var.daily_scan_limit >= 1 && floor(var.daily_scan_limit) == var.daily_scan_limit
    error_message = "daily_scan_limit must be a positive integer: the API refuses anything else at boot, and a plan that passed would only fail once deployed."
  }
}

