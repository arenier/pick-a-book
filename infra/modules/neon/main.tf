# One Neon project, with its default branch/database/role/endpoint — no extra neon_database
# or neon_role resource: a single project is exactly what this app needs, and Neon already
# provisions a usable default of each when a project is created.

resource "neon_project" "this" {
  name      = var.project_name
  org_id    = var.org_id
  region_id = var.region_id
}
