output "relay_wss_url" { value = "wss://${var.domain_name}" }
output "migration_task_definition" { value = aws_ecs_task_definition.migration.family }
output "alb_dns_name" { value = aws_lb.lenos.dns_name }
output "postgres_endpoint" {
  value     = aws_db_instance.lenos.endpoint
  sensitive = true
}
output "redis_endpoint" { value = aws_elasticache_replication_group.lenos.primary_endpoint_address }
output "s3_bucket" { value = aws_s3_bucket.media.bucket }
