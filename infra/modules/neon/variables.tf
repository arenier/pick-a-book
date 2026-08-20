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

variable "history_retention_seconds" {
  description = "Point-in-time restore (PITR) window, in seconds: how far back the project can be rewound to an exact instant. Set explicitly rather than left to the provider, whose 86400 s default the Neon API rejects on a Free plan (ceiling: 21600 s / 6 h). The default here is that ceiling — the longest window the plan allows, at no cost. PITR is the fine-grained complement to the pg_dump backups of ADR 0006, not a replacement for them: raise this only alongside a paid plan."
  type        = number
  default     = 21600
}
