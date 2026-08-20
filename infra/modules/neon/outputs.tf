output "database_url" {
  description = "Pooled Postgres connection URI (via pgbouncer), for wiring into secret-manager's DATABASE_URL. The pooler, not the direct connection_uri, is used deliberately: Cloud Run's serverless, bursty connection pattern needs pooling to avoid exhausting Postgres connections."
  value       = neon_project.this.connection_uri_pooler
  sensitive   = true
}
