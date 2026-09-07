output "bucket_name" {
  description = "The static-site bucket name, for `gsutil rsync` of the built front and for wiring the public URL."
  value       = google_storage_bucket.this.name
}

output "public_base_url" {
  description = "Public HTTPS base URL the front is served on — Google's shared endpoint, no custom domain, no CDN. Append the entry object (index.html) to reach the app."
  value       = "https://storage.googleapis.com/${google_storage_bucket.this.name}/${var.main_page}"
}
