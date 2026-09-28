variable "project_id" {
  description = "GCP project ID the job and the alert live in."
  type        = string
}

variable "job_name" {
  description = "Name of the Cloud Run Job to watch."
  type        = string
}

variable "max_age" {
  description = "Longest acceptable time without a successful execution, as a PromQL duration (e.g. \"8d\"): the schedule's period plus a margin."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+[mhdw]$", var.max_age))
    error_message = "max_age must be a PromQL duration such as 36h, 8d or 2w."
  }
}

variable "notification_email" {
  description = "Address the alert is sent to. Personal data in a public repository: pass it through TF_VAR_*, never commit it."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.notification_email))
    error_message = "notification_email must be an email address."
  }
}
