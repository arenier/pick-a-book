variable "project_id" {
  description = "GCP project ID. The project itself pre-exists — this module never creates or modifies it."
  type        = string
}

variable "apis" {
  description = "APIs to enable on the project. Defaults cover Cloud Run, Artifact Registry, Secret Manager, GCS and IAM — the services the rest of infra/ provisions resources in."
  type        = list(string)
  default = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]
}
