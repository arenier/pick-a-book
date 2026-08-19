variable "org_id" {
  description = "Neon organization ID the project belongs to. Required explicitly — omitting it can create the project in the wrong place (a personal account instead of the organization)."
  type        = string
}

variable "project_name" {
  description = "Neon project name."
  type        = string
  default     = "pick-a-book"
}

variable "region_id" {
  description = "Neon region ID. Neon runs on AWS/Azure regions, not GCP — aws-eu-central-1 (Frankfurt) is the closest to europe-west1, where the rest of the infra lives."
  type        = string
  default     = "aws-eu-central-1"
}
