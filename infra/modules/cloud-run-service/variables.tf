variable "project_id" {
  description = "GCP project ID the service belongs to."
  type        = string
}

variable "region" {
  description = "Region the service runs in — kept identical across the infra (issue #12: single region)."
  type        = string
}

variable "name" {
  description = "Cloud Run service name."
  type        = string
}

variable "service_account_email" {
  description = "Runtime identity the service runs as — the least-privilege service account from the service-account module, never the default compute SA."
  type        = string
}

variable "image" {
  description = "Container image to deploy. Defaults to Google's public placeholder: at this stage of the infra bootstrap, no production image has been built and pushed yet for either app (CI/CD is out of scope for issue #12). The real image is deployed later, outside Terraform (`gcloud run deploy`) — see the `ignore_changes` lifecycle block in main.tf."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello:latest"
}

variable "container_port" {
  description = "Port the container listens on. Cloud Run injects PORT to match. apps/api and apps/web both default to 3000 in this repo (.env.example, docker/)."
  type        = number
  default     = 3000
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
  description = "CPU limit, in Cloud Run's cpu units (e.g. \"1\")."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit (e.g. \"512Mi\")."
  type        = string
  default     = "512Mi"
}

variable "min_instances" {
  description = "Minimum instance count. Default 0: scale-to-zero is the point of Cloud Run for this intermittent workload (ADR 0004, ADR 0006)."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum instance count. No longer an integrity constraint since ADR 0006 moved persistence to Postgres/Neon — this is purely a cost cap now."
  type        = number
  default     = 3
}

variable "allow_unauthenticated" {
  description = "Grant roles/run.invoker to allUsers. Both the API and the front are public services with no auth layer of their own, so this defaults to true."
  type        = bool
  default     = true
}

variable "ingress" {
  description = "Ingress setting. Default allows all traffic — neither service sits behind a load balancer or VPC (no domain, no LB: issue #12 point 8)."
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}
