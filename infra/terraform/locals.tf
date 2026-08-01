locals {
  experiment_bucket_name = var.experiment_bucket_name != "" ? var.experiment_bucket_name : "${var.project_id}-experiments"
  experiment_photos_dir  = "${path.module}/${var.experiment_photos_dir}"
  experiment_photos      = try(fileset(local.experiment_photos_dir, "*"), [])
}
