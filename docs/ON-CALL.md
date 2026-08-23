# On-Call and Ownership

## Service owners

| Service | Owner | Backup |
|---------|-------|--------|
| LenOS relay (AWS ECS) | [relay-owner] | [backup] |
| LenOS web (Cloudflare Pages) | [web-owner] | [backup] |
| LenGrowth backend (Scalingo) | [backend-owner] | [backup] |
| Postgres (RDS) | [db-owner] | [backup] |
| Redis (ElastiCache) | [db-owner] | [backup] |
| S3 / media | [infra-owner] | [backup] |

_Fill in owner names before merging._

## Alerting

- Relay health: `https://relay.lengrowth.com/health` — CloudWatch alarm `relay_unhealthy_hosts`
- Web app: Cloudflare Pages deploy notifications
- Scalingo: process restarts and error logs

## Incident response

### P0 — Relay down / data loss risk

1. Check `https://relay.lengrowth.com/_readiness` — if non-200, check ECS task health in AWS console
2. Relay down: `aws ecs update-service --cluster lenos --service relay --force-new-deployment`
3. Check RDS and ElastiCache connectivity — both must be reachable from ECS
4. If data loss suspected: stop writes (scale relay to 0), take RDS snapshot, investigate before resuming
5. Post incident summary within 24h

### P1 — Degraded (auth failures, search broken, pub/sub lag)

1. Check relay logs in CloudWatch log group `/ecs/lenos-relay`
2. Check Redis: `redis-cli -u $REDIS_URL ping`
3. Check Postgres: `psql $DATABASE_URL -c "SELECT count(*) FROM events WHERE created_at > now() - interval '5 minutes'"`
4. Escalate to relay owner if root cause not identified within 30 minutes

### P2 — Web app deploy failure

1. Check Cloudflare Pages build logs
2. Run `cd web && pnpm build` locally to reproduce
3. Fix, push, verify new deploy

## Escalation path

[on-call] → [relay-owner] → [CTO/eng lead]

## Privacy and retention

- Events stored in Postgres — no automated TTL/purge today (roadmap)
- Media (S3): no lifecycle policy (roadmap)
- Audit log: append-only, hash-chained, no deletion
- GDPR export: `GET /api/export` (NIP-98 auth) — admin can export by pubkey
- GDPR deletion: not implemented (roadmap)
- Age-gate: not implemented (roadmap if required by jurisdiction)

## Support escalation

User reports → [support channel] → on-call triages → routes to owner.
