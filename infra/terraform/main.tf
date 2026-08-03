terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.aws_region }

data "aws_availability_zones" "available" {}
data "aws_caller_identity" "current" {}

# VPC
resource "aws_vpc" "lenos" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "${var.app_name}-vpc" }
}

resource "aws_internet_gateway" "lenos" { vpc_id = aws_vpc.lenos.id }

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.lenos.id
  cidr_block              = cidrsubnet("10.0.0.0/16", 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "${var.app_name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.lenos.id
  cidr_block        = cidrsubnet("10.0.0.0/16", 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "${var.app_name}-private-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.lenos.id
  route { cidr_block = "0.0.0.0/0"; gateway_id = aws_internet_gateway.lenos.id }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Security groups
resource "aws_security_group" "alb" {
  name   = "${var.app_name}-alb"
  vpc_id = aws_vpc.lenos.id
  ingress { from_port = 443; to_port = 443; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 80;  to_port = 80;  protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0;   to_port = 0;   protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_security_group" "relay" {
  name   = "${var.app_name}-relay"
  vpc_id = aws_vpc.lenos.id
  ingress { from_port = 3000; to_port = 3000; protocol = "tcp"; security_groups = [aws_security_group.alb.id] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_security_group" "db" {
  name   = "${var.app_name}-db"
  vpc_id = aws_vpc.lenos.id
  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; security_groups = [aws_security_group.relay.id] }
}

resource "aws_security_group" "redis" {
  name   = "${var.app_name}-redis"
  vpc_id = aws_vpc.lenos.id
  ingress { from_port = 6379; to_port = 6379; protocol = "tcp"; security_groups = [aws_security_group.relay.id] }
}

# RDS Postgres 17
resource "aws_db_subnet_group" "lenos" {
  name       = "${var.app_name}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "lenos" {
  identifier             = "${var.app_name}-postgres"
  engine                 = "postgres"
  engine_version         = "17"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  db_name                = "lenos"
  username               = "lenos"
  password               = var.postgres_password
  db_subnet_group_name   = aws_db_subnet_group.lenos.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = true
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "lenos" {
  name       = "${var.app_name}-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "lenos" {
  cluster_id         = "${var.app_name}-redis"
  engine             = "redis"
  node_type          = "cache.t3.micro"
  num_cache_nodes    = 1
  subnet_group_name  = aws_elasticache_subnet_group.lenos.name
  security_group_ids = [aws_security_group.redis.id]
}

# S3 for Blossom media
resource "aws_s3_bucket" "media" {
  bucket = "${var.app_name}-media-${data.aws_caller_identity.current.account_id}"
}

# ECS
resource "aws_ecs_cluster" "lenos" { name = var.app_name }

resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow"; Principal = { Service = "ecs-tasks.amazonaws.com" }; Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "exec" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
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
  execution_role_arn       = aws_iam_role.ecs_task.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "relay"
    image = "<your-ecr-account>.dkr.ecr.${var.aws_region}.amazonaws.com/lenos-relay:latest"
    portMappings = [{ containerPort = 3000 }]
    environment = [
      { name = "DATABASE_URL",             value = "postgres://lenos:${var.postgres_password}@${aws_db_instance.lenos.endpoint}/lenos" },
      { name = "REDIS_URL",                value = "redis://${aws_elasticache_cluster.lenos.cache_nodes[0].address}:6379" },
      { name = "LENOS_RELAY_URL",          value = "wss://${var.domain_name}" },
      { name = "LENGROWTH_ADAPTER_PUBKEY", value = var.lengrowth_adapter_pubkey },
      { name = "S3_BUCKET",                value = aws_s3_bucket.media.bucket },
      { name = "S3_REGION",                value = var.aws_region },
      { name = "LENOS_PRIVATE_KEY",        value = var.relay_private_key_hex },
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
      command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
    }
  }])
}

resource "aws_ecs_service" "relay" {
  name            = "${var.app_name}-relay"
  cluster         = aws_ecs_cluster.lenos.id
  task_definition = aws_ecs_task_definition.relay.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.relay.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.relay.arn
    container_name   = "relay"
    container_port   = 3000
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
}

resource "aws_lb_target_group" "relay" {
  name        = "${var.app_name}-relay"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.lenos.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }

  stickiness { enabled = false; type = "lb_cookie" }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.lenos.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action    { type = "forward"; target_group_arn = aws_lb_target_group.relay.arn }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.lenos.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect { port = "443"; protocol = "HTTPS"; status_code = "HTTP_301" }
  }
}

# Route53
data "aws_route53_zone" "main" {
  name = join(".", slice(split(".", var.domain_name), 1, length(split(".", var.domain_name))))
}

resource "aws_route53_record" "relay" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_lb.lenos.dns_name
    zone_id                = aws_lb.lenos.zone_id
    evaluate_target_health = true
  }
}
