terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # State bucket bootstrapped by hand, outside Terraform, before this config existed
  # (it cannot be managed by the state it holds). Private, versioned — issue #12.
  backend "gcs" {
    bucket = "pick-a-book-tfstate"
    prefix = "prod"
  }
}
