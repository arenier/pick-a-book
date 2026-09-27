# Hermetic like every suite here: mock_provider, no GCP project, no credentials, no cost.
mock_provider "google" {}

variables {
  project_id         = "pick-a-book-test"
  job_name           = "pick-a-book-db-backup"
  max_age            = "8d"
  notification_email = "someone@example.com"
}

run "emails_the_given_address" {
  command = plan

  assert {
    condition     = google_monitoring_notification_channel.email.type == "email" && google_monitoring_notification_channel.email.labels.email_address == var.notification_email
    error_message = "The alert must reach the given address by email"
  }
}

run "fires_when_no_run_succeeded_within_the_max_age" {
  command = plan

  # The silent death ADR 0006 warns about is the job that stops running at all — no failure
  # to report. Only the absence of a success over the window catches it.
  assert {
    condition = anytrue([
      for c in google_monitoring_alert_policy.this.conditions : c.condition_prometheus_query_language[0].query ==
      "absent_over_time(run_googleapis_com:job_completed_execution_count{monitored_resource=\"cloud_run_job\",job_name=\"pick-a-book-db-backup\",result=\"succeeded\"}[8d])"
    ])
    error_message = "One condition must fire when this job has no successful execution within max_age"
  }
}

run "fires_as_soon_as_a_run_fails" {
  command = plan

  # No need to wait out the whole window to learn that last night's run failed.
  assert {
    condition = anytrue([
      for c in google_monitoring_alert_policy.this.conditions : strcontains(c.condition_prometheus_query_language[0].query, "job_name=\"pick-a-book-db-backup\",result=\"failed\"")
    ])
    error_message = "One condition must fire on a failed execution of this job"
  }

  assert {
    condition     = google_monitoring_alert_policy.this.combiner == "OR"
    error_message = "Either condition alone must alert"
  }
}

run "notifies_through_the_email_channel" {
  command = apply

  assert {
    condition     = length(google_monitoring_alert_policy.this.notification_channels) == 1 && google_monitoring_alert_policy.this.notification_channels[0] == google_monitoring_notification_channel.email.id
    error_message = "The policy must notify through its email channel — an alert nobody receives is not an alert"
  }
}

run "refuses_a_window_monitoring_cannot_read" {
  command = plan

  variables {
    max_age = "one week"
  }

  expect_failures = [var.max_age]
}

run "refuses_something_that_is_not_an_email_address" {
  command = plan

  variables {
    notification_email = "not-an-address"
  }

  expect_failures = [var.notification_email]
}
