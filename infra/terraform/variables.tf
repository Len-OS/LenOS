variable "aws_region" { default = "us-east-1" }
variable "app_name" { default = "lenos" }
variable "relay_private_key_hex" { sensitive = true }
variable "lengrowth_adapter_pubkey" { default = "" }
variable "postgres_password" {
  description = "Legacy migration input only; ignored when RDS manages the master password."
  type        = string
  sensitive   = true
  default     = null
}
variable "rds_manage_master_password" {
  description = "Store the RDS master password in the AWS-managed Secrets Manager secret."
  type        = bool
  default     = true
}
variable "database_url_secret_arn" {
  description = "Secrets Manager ARN containing the application DATABASE_URL."
  type        = string
}
variable "redis_url_secret_arn" {
  description = "Secrets Manager ARN containing the application REDIS_URL."
  type        = string
}
variable "redis_auth_token" {
  description = "Optional Redis AUTH token; keep it in protected Terraform input or use the URL secret."
  type        = string
  sensitive   = true
  default     = null
  validation {
    condition     = var.redis_auth_token == null || (length(var.redis_auth_token) >= 16 && length(var.redis_auth_token) <= 128)
    error_message = "redis_auth_token must be 16-128 characters when provided."
  }
}
variable "relay_private_key_secret_arn" {
  description = "Secrets Manager ARN containing LENOS_RELAY_PRIVATE_KEY."
  type        = string
}
variable "domain_name" { description = "e.g. relay.yourapp.com" }
variable "certificate_arn" { description = "ACM cert ARN for domain" }
variable "relay_image" {
  description = "Immutable relay image reference, preferably a content digest. Mutable :main is forbidden."
  type        = string
  validation {
    condition     = length(trimspace(var.relay_image)) > 0 && !endswith(trimspace(var.relay_image), ":main")
    error_message = "relay_image must be a non-empty immutable release tag or digest, not :main."
  }
}
variable "rds_multi_az" {
  description = "Run PostgreSQL across availability zones in production."
  type        = bool
  default     = true
}
variable "alarm_sns_topic_arn" {
  description = "Required SNS topic ARN for CloudWatch alarm notifications. Configure a protected topic with subscribed on-call recipients."
  type        = string
  validation {
    condition     = length(trimspace(var.alarm_sns_topic_arn)) > 0
    error_message = "alarm_sns_topic_arn must be provided so production alarms page an owned notification path."
  }
}
variable "relay_desired_count" {
  description = "Minimum relay task count. Two is the production baseline for AZ resilience."
  type        = number
  default     = 2
  validation {
    condition     = var.relay_desired_count >= 2 && var.relay_desired_count <= 20
    error_message = "relay_desired_count must be between 2 and 20 for a resilient service."
  }
}
variable "relay_max_count" {
  description = "Maximum relay task count for CPU autoscaling."
  type        = number
  default     = 4
  validation {
    condition     = var.relay_max_count >= var.relay_desired_count && var.relay_max_count <= 50
    error_message = "relay_max_count must be at least relay_desired_count and no more than 50."
  }
}
