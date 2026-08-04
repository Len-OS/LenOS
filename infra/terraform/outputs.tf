output "relay_wss_url" { value = "wss://${var.domain_name}" }
output "alb_dns_name" { value = aws_lb.lenos.dns_name }
output "postgres_endpoint" {
  value     = aws_db_instance.lenos.endpoint
  sensitive = true
}
output "redis_endpoint" { value = aws_elasticache_cluster.lenos.cache_nodes[0].address }
output "s3_bucket" { value = aws_s3_bucket.media.bucket }
