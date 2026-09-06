# Non-secret. Committed by design: project_id, region and neon_org_id are not sensitive.
#
# Named *.auto.tfvars so Terraform loads it automatically — `terraform plan`/`apply` need no
# -var-file, and forgetting one no longer drops you into interactive prompts for these three.
# Secrets never live here: NEON_API_KEY is read from the environment by the neon provider, and
# the Secret Manager values are added out-of-band (see infra/README.md).
project_id  = "pick-a-book-505922"
region      = "europe-west1"
neon_org_id = "org-jolly-fire-32376830"
