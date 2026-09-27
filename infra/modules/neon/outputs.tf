output "database_url" {
  description = "Pooled Postgres connection URI (via pgbouncer), for wiring into secret-manager's DATABASE_URL. The pooler, not the direct connection_uri, is used deliberately: Cloud Run's serverless, bursty connection pattern needs pooling to avoid exhausting Postgres connections."
  value       = neon_project.this.connection_uri_pooler
  sensitive   = true
}

output "direct_database_url" {
  description = "Direct (unpooled) Postgres connection URI, for the backup job only: pg_dump needs one session for the whole dump, which PgBouncer's transaction mode does not give. Never for the API — its bursty serverless connections are what the pooler is for."
  value       = neon_project.this.connection_uri
  sensitive   = true
}
