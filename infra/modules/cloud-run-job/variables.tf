variable "project_id" {
  description = "GCP project ID the job belongs to."
  type        = string
}

variable "region" {
  description = "Region the job and its scheduler run in — kept identical across the infra."
  type        = string
}

variable "name" {
  description = "Job name, also used for its scheduler."
  type        = string
}

variable "service_account_email" {
  description = "Identity the job runs as — and the one the scheduler calls the Run API with. A least-privilege service account from the service-account module, never the default compute SA."
  type        = string
}

variable "image" {
  description = "Container image. Defaults to Google's public placeholder so the job can be created before a real image exists; the real one is deployed outside Terraform (see ignore_changes in main.tf)."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/job:latest"
}

variable "env" {
  description = "Plain, non-secret environment variables."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Environment variables sourced from Secret Manager. Keys are env var names, values are the Secret Manager secret_id (version \"latest\" is always used)."
  type        = map(string)
  default     = {}
}

variable "cpu" {
  description = "CPU limit, in Cloud Run's cpu units."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit. Cloud Run's filesystem is in memory, so this bounds what the job may write to disk too."
  type        = string
  default     = "512Mi"
}

variable "task_timeout" {
  description = "How long one execution may run before Cloud Run stops it and marks it failed."
  type        = string
  default     = "900s"
}

variable "max_retries" {
  description = "Retries of a failed execution. 0 by default: a retry hides the failure an alert should report."
  type        = number
  default     = 0
}

variable "schedule" {
  description = "Cron expression the job runs on, read in var.time_zone. Null for a job that only runs on demand — then no scheduler and no invoker grant exist."
  type        = string
  default     = null
}

variable "time_zone" {
  description = "Time zone the schedule is read in."
  type        = string
  default     = "Europe/Paris"
}

variable "deletion_protection" {
  description = "Refuses to destroy the job in the same apply that removes it from configuration — a teardown is a deliberate two-step. Matches the provider default."
  type        = bool
  default     = true
}
