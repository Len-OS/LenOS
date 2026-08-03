variable "aws_region"              { default = "us-east-1" }
variable "app_name"                { default = "lenos" }
variable "relay_private_key_hex"   { sensitive = true }
variable "lengrowth_adapter_pubkey" { default = "" }
variable "postgres_password"       { sensitive = true }
variable "domain_name"             { description = "e.g. relay.yourapp.com" }
variable "certificate_arn"         { description = "ACM cert ARN for domain" }
