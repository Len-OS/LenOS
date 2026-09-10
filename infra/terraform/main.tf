terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }

  backend "s3" {
    bucket       = "lenos-terraform-state-288947333598"
    key          = "lenos/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" { region = var.aws_region }

data "aws_availability_zones" "available" {}
data "aws_caller_identity" "current" {}

# VPC
resource "aws_vpc" "lenos" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags                 = { Name = "${var.app_name}-vpc" }
}

resource "aws_internet_gateway" "lenos" { vpc_id = aws_vpc.lenos.id }

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.lenos.id
  cidr_block              = cidrsubnet("10.0.0.0/16", 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.app_name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.lenos.id
  cidr_block        = cidrsubnet("10.0.0.0/16", 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "${var.app_name}-private-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.lenos.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.lenos.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  count  = 2
  domain = "vpc"
  tags   = { Name = "${var.app_name}-nat-eip-${count.index}" }
}

resource "aws_nat_gateway" "lenos" {
  count         = 2
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.lenos]
  tags          = { Name = "${var.app_name}-nat-${count.index}" }
}

resource "aws_route_table" "private" {
  count  = 2
  vpc_id = aws_vpc.lenos.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.lenos[count.index].id
  }
  tags = { Name = "${var.app_name}-private-${count.index}" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_cloudwatch_log_group" "vpc_flow" {
  name              = "/aws/vpc/${var.app_name}/flow"
  retention_in_days = 30
}

resource "aws_iam_role" "vpc_flow" {
  name = "${var.app_name}-vpc-flow-logs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "vpc_flow" {
  name = "${var.app_name}-vpc-flow-logs"
  role = aws_iam_role.vpc_flow.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:DescribeLogGroups", "logs:DescribeLogStreams", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.vpc_flow.arn}:*"
    }]
  })
}

resource "aws_flow_log" "lenos" {
  iam_role_arn             = aws_iam_role.vpc_flow.arn
  log_destination          = aws_cloudwatch_log_group.vpc_flow.arn
  traffic_type             = "ALL"
  vpc_id                   = aws_vpc.lenos.id
  max_aggregation_interval = 60
  log_destination_type     = "cloud-watch-logs"
}

# Security groups
resource "aws_security_group" "alb" {
  name   = "${var.app_name}-alb"
  vpc_id = aws_vpc.lenos.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "relay" {
  name   = "${var.app_name}-relay"
  vpc_id = aws_vpc.lenos.id
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name   = "${var.app_name}-db"
  vpc_id = aws_vpc.lenos.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.relay.id]
  }
}

resource "aws_security_group" "redis" {
  name   = "${var.app_name}-redis"
  vpc_id = aws_vpc.lenos.id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.relay.id]
  }
}

# RDS Postgres 17
resource "aws_db_subnet_group" "lenos" {
  name       = "${var.app_name}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "lenos" {
  identifier                            = "${var.app_name}-postgres"
  engine                                = "postgres"
  engine_version                        = "17"
  instance_class                        = "db.t3.micro"
  allocated_storage                     = 20
  db_name                               = "lenos"
  username                              = "lenos"
  password                              = var.rds_manage_master_password ? null : var.postgres_password
  manage_master_user_password           = var.rds_manage_master_password
  db_subnet_group_name                  = aws_db_subnet_group.lenos.name
  vpc_security_group_ids                = [aws_security_group.db.id]
  publicly_accessible                   = false
  storage_encrypted                     = true
  multi_az                              = var.rds_multi_az
  backup_retention_period               = 7
  backup_window                         = "03:00-04:00"
  maintenance_window                    = "sun:05:00-sun:06:00"
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  copy_tags_to_snapshot                 = true
  deletion_protection                   = true
  skip_final_snapshot                   = false
  final_snapshot_identifier             = "${var.app_name}-postgres-final"

  lifecycle { prevent_destroy = true }
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "lenos" {
  name       = "${var.app_name}-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "lenos" {
  replication_group_id       = "${var.app_name}-redis"
  description                = "${var.app_name} Redis high-availability replication group"
  engine                     = "redis"
  node_type                  = "cache.t3.micro"
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  subnet_group_name          = aws_elasticache_subnet_group.lenos.name
  security_group_ids         = [aws_security_group.redis.id]

  lifecycle { prevent_destroy = true }
}

# S3 for Blossom media
resource "aws_s3_bucket" "media" {
  bucket = "${var.app_name}-media-${data.aws_caller_identity.current.account_id}"

  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  rule {
    id     = "noncurrent-version-retention"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Dedicated ALB access logs; keep operational logs separate from tenant media.
resource "aws_s3_bucket" "alb_logs" {
  bucket = "${var.app_name}-alb-logs-${data.aws_caller_identity.current.account_id}"

  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule { object_ownership = "BucketOwnerPreferred" }
}

resource "aws_s3_bucket_versioning" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    id     = "expire-alb-logs"
    status = "Enabled"
    filter {}
    expiration { days = 30 }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowElasticLoadBalancingLogDelivery"
        Effect    = "Allow"
        Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:elasticloadbalancing:${var.aws_region}:${data.aws_caller_identity.current.account_id}:loadbalancer/*" }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.alb_logs.arn, "${aws_s3_bucket.alb_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }
    ]
  })
}

# ECS
resource "aws_ecs_cluster" "lenos" { name = var.app_name }

resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role" "ecs_execution" {
  name = "${var.app_name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "exec" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.app_name}-ecs-secrets"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [var.database_url_secret_arn, var.redis_url_secret_arn, var.relay_private_key_secret_arn]
    }]
  })
}

resource "aws_iam_role_policy" "s3" {
  name = "s3"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = ["${aws_s3_bucket.media.arn}", "${aws_s3_bucket.media.arn}/*"]
    }]
  })
}

resource "aws_cloudwatch_log_group" "lenos" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "relay" {
  family                   = "${var.app_name}-relay"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name         = "relay"
    image        = var.relay_image
    portMappings = [{ containerPort = 3000 }]
    environment = [
      { name = "LENOS_RELAY_URL", value = "wss://${var.domain_name}" },
      { name = "RELAY_URL", value = "wss://${var.domain_name}" },
      { name = "LENGROWTH_ADAPTER_PUBKEY", value = var.lengrowth_adapter_pubkey },
      { name = "LENOS_S3_BUCKET", value = aws_s3_bucket.media.bucket },
      { name = "LENOS_S3_REGION", value = var.aws_region },
      { name = "LENOS_S3_ENDPOINT", value = "https://s3.${var.aws_region}.amazonaws.com" },
      { name = "LENOS_S3_ACCESS_KEY", value = "" },
      { name = "LENOS_S3_SECRET_KEY", value = "" },
      { name = "LENOS_S3_ADDRESSING_STYLE", value = "virtual" },
      { name = "LENOS_MEDIA_BASE_URL", value = "https://${var.domain_name}/media" },
      { name = "LENOS_AUTO_MIGRATE", value = "false" },
      { name = "RELAY_OPERATOR_PUBKEYS", value = "ce928671e149874e5eb96078fe6c3dd0c485c90c26ba05cad98cc948550f9b78" },
      # Durable owner identity used only by the hosted, non-destructive E2E
      # suite. The corresponding private key remains in GitHub/AWS secret
      # storage; this public key makes startup owner bootstrap deterministic.
      { name = "RELAY_OWNER_PUBKEY", value = "da401827a2a1bc608f8d9420bee3682409cd02e8b121cdd2500de6cddb599d21" },
      { name = "RELAY_OPERATOR_API_ORIGIN", value = "https://relay.lengrowth.com" },
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
      { name = "REDIS_URL", valueFrom = var.redis_url_secret_arn },
      { name = "LENOS_RELAY_PRIVATE_KEY", valueFrom = var.relay_private_key_secret_arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.app_name}"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "relay"
      }
    }
    healthCheck = {
      command  = ["CMD-SHELL", "curl -f http://localhost:3000/_readiness || exit 1"]
      interval = 30
      timeout  = 5
      retries  = 3
    }
  }])
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${var.app_name}-migration"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name       = "migration"
    image      = var.relay_image
    entryPoint = ["/usr/local/bin/lenos-admin"]
    command    = ["migrate"]
    essential  = true
    secrets = [
      { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.app_name}"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "migration"
      }
    }
  }])
}

resource "aws_ecs_service" "relay" {
  name                               = "${var.app_name}-relay"
  cluster                            = aws_ecs_cluster.lenos.id
  task_definition                    = aws_ecs_task_definition.relay.arn
  desired_count                      = var.relay_desired_count
  launch_type                        = "FARGATE"
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.relay.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.relay.arn
    container_name   = "relay"
    container_port   = 3000
  }
}

resource "aws_appautoscaling_target" "relay" {
  max_capacity       = var.relay_max_count
  min_capacity       = var.relay_desired_count
  resource_id        = "service/${aws_ecs_cluster.lenos.name}/${aws_ecs_service.relay.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "relay_cpu" {
  name               = "${var.app_name}-relay-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.relay.resource_id
  scalable_dimension = aws_appautoscaling_target.relay.scalable_dimension
  service_namespace  = aws_appautoscaling_target.relay.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
    target_value       = 60
    scale_in_cooldown  = 180
    scale_out_cooldown = 60
  }
}

# ALB — WebSocket passthrough, sticky sessions OFF
resource "aws_lb" "lenos" {
  name               = "${var.app_name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # WebSocket idle connections — raise to 300s
  idle_timeout = 300

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    prefix  = "alb"
    enabled = true
  }

  depends_on = [aws_s3_bucket_policy.alb_logs]
}

resource "aws_lb_target_group" "relay" {
  name        = "${var.app_name}-relay"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.lenos.id
  target_type = "ip"

  health_check {
    path                = "/_readiness"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }

  stickiness {
    enabled = false
    type    = "lb_cookie"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.lenos.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.relay.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.lenos.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# DNS is managed in Cloudflare — add CNAME manually after deploy:
# relay.<yourdomain.com> CNAME <alb_dns_name output>  (proxy: DNS-only / orange cloud OFF)

resource "aws_cloudwatch_metric_alarm" "relay_unhealthy_hosts" {
  alarm_name          = "${var.app_name}-relay-unhealthy-hosts"
  alarm_description   = "Fires when the relay ALB target group has ≥1 unhealthy host."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.lenos.arn_suffix
    TargetGroup  = aws_lb_target_group.relay.arn_suffix
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  ok_actions    = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "relay_cpu_high" {
  alarm_name          = "${var.app_name}-relay-cpu-high"
  alarm_description   = "Relay service CPU is above the autoscaling target for sustained periods."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 5
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    ClusterName = aws_ecs_cluster.lenos.name
    ServiceName = aws_ecs_service.relay.name
  }
  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "postgres_free_storage_low" {
  alarm_name          = "${var.app_name}-postgres-free-storage-low"
  alarm_description   = "PostgreSQL free storage is approaching the configured capacity boundary."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 2147483648
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.lenos.identifier }
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "redis_connections_high" {
  alarm_name          = "${var.app_name}-redis-connections-high"
  alarm_description   = "Redis client connections require capacity review."
  namespace           = "AWS/ElastiCache"
  metric_name         = "CurrConnections"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 500
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { ReplicationGroupId = aws_elasticache_replication_group.lenos.id }
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}
