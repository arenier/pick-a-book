# Watches a Cloud Run Job that must succeed on a schedule — first user: the weekly pg_dump of
# ADR 0006 (issue #22). "A backup silently dead is worse than no backup": the job failing is
# only half the risk, the other half is the job no longer running at all, which reports
# nothing. Hence two alerts on the job's completed executions, each on its own.
#
# Two policies rather than one policy with two conditions: Cloud Monitoring refuses a policy
# with a PromQL condition and any other condition next to it.

locals {
  executions = "run_googleapis_com:job_completed_execution_count{monitored_resource=\"cloud_run_job\",job_name=\"${var.job_name}\""
}

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "${var.job_name} — email"
  type         = "email"
  labels = {
    email_address = var.notification_email
  }
}

locals {
  documentation = "The Cloud Run Job `${var.job_name}` has not produced a fresh backup. Look at its last executions (`gcloud run jobs executions list --job=${var.job_name}`) and their logs; the procedure is in infra/README.md, section Sauvegarde."
}

resource "google_monitoring_alert_policy" "stale" {
  project      = var.project_id
  display_name = "${var.job_name} — no successful run in ${var.max_age}"
  combiner     = "OR"
  severity     = "ERROR"

  conditions {
    display_name = "No successful run in ${var.max_age}"

    # PromQL rather than a metric-absence condition: the window here spans days, the job
    # running weekly. The delta metric only has points when an execution completes, so no
    # point with result="succeeded" over the window means no success over the window.
    condition_prometheus_query_language {
      query               = "absent_over_time(${local.executions},result=\"succeeded\"}[${var.max_age}])"
      duration            = "0s"
      evaluation_interval = "600s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    mime_type = "text/markdown"
    content   = local.documentation
  }
}

resource "google_monitoring_alert_policy" "failed" {
  project      = var.project_id
  display_name = "${var.job_name} — a run failed"
  combiner     = "OR"
  severity     = "ERROR"

  conditions {
    display_name = "A run failed"

    condition_prometheus_query_language {
      query               = "sum(increase(${local.executions},result=\"failed\"}[1h])) > 0"
      duration            = "0s"
      evaluation_interval = "300s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    mime_type = "text/markdown"
    content   = local.documentation
  }
}
