# The project already exists (created by hand, before this infra was written) and is shared
# with other services (readeck, actual-server). This module only activates the APIs the rest
# of infra/ needs — it never creates a google_project or touches billing, and it never
# disables APIs or dependent services on destroy: a `terraform destroy` of this module must
# not be able to take down something else running in the same project.

resource "google_project_service" "this" {
  for_each = toset(var.apis)

  project = var.project_id
  service = each.value

  disable_on_destroy         = false
  disable_dependent_services = false
}
