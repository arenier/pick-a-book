variable "project_id" {
  description = "GCP project ID the service belongs to."
  type        = string
}

variable "region" {
  description = "Region the service runs in — kept identical across the infra."
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
  description = "Container image to deploy. Defaults to Google's public placeholder so the service can be created before a real image exists. The real image is deployed later, outside Terraform (`gcloud run deploy`) — see the `ignore_changes` lifecycle block in main.tf."
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
  description = "Minimum instance count. Default 0: scale-to-zero is the point of Cloud Run for this intermittent workload."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum instance count — purely a cost cap, not an integrity constraint."
  type        = number
  default     = 3
}

variable "cpu_idle" {
  description = "Whether CPU is throttled outside of request handling. Must be true for a scale-to-zero, request-based workload: allocating CPU only during requests is what makes min_instances = 0 economical."
  type        = bool
  default     = true
}

variable "request_timeout" {
  description = "Maximum duration a request is allowed to take, as a duration string (e.g. \"300s\")."
  type        = string
  default     = "300s"
}

variable "concurrency" {
  description = "Maximum number of concurrent requests a single container instance may handle."
  type        = number
  default     = 80
}

variable "startup_probe_initial_delay_seconds" {
  description = "Seconds to wait before the first startup probe check."
  type        = number
  default     = 0
}

variable "startup_probe_period_seconds" {
  description = "Seconds between startup probe checks."
  type        = number
  default     = 3
}

variable "startup_probe_timeout_seconds" {
  description = "Seconds before a single startup probe check is considered failed."
  type        = number
  default     = 3
}

variable "startup_probe_failure_threshold" {
  description = "Number of consecutive failed startup probe checks before the container is considered unhealthy."
  type        = number
  default     = 3
}

variable "allow_unauthenticated" {
  description = "Grant roles/run.invoker to allUsers. Both the API and the front are public services with no auth layer of their own, so this defaults to true."
  type        = bool
  default     = true
}

variable "ingress" {
  description = "Ingress setting. Default allows all traffic — neither service sits behind a load balancer or VPC."
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}
