variable "project_id" {
  description = "GCP project ID. The project itself pre-exists — this module never creates or modifies it."
  type        = string
}

variable "apis" {
  description = "APIs to enable on the project. Defaults cover Cloud Run, Artifact Registry, Cloud Build, Secret Manager, GCS, IAM and Resource Manager — the services the rest of infra/ provisions in, plus Cloud Build for the reproducible image build (yarn deploy:api)."
  type        = list(string)
  default = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]
}
