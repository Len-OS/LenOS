# On-Call and Ownership

## Service owners

| Service | Owner | Backup |
|---------|-------|--------|
| LenOS relay (AWS ECS) | Secure roster: relay platform owner | Secure roster: relay platform backup |
| LenOS web (Cloudflare Pages) | Secure roster: web platform owner | Secure roster: web platform backup |
| LenGrowth backend (Scalingo) | Secure roster: Growth backend owner | Secure roster: Growth backend backup |
| Postgres (RDS) | Secure roster: data platform owner | Secure roster: data platform backup |
| Redis (ElastiCache) | Secure roster: data platform owner | Secure roster: data platform backup |
| S3 / media | Secure roster: infrastructure owner | Secure roster: infrastructure backup |

_Resolve each secure-roster role to a named owner and backup before beta; do not
publish private phone numbers or personal contact details here._

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

Primary on-call (secure roster) → service owner (secure roster) → engineering
escalation lead (secure roster)

## Privacy and retention

- Events and collaboration records follow the approved beta retention policy;
  do not perform ad-hoc deletion from the database.
- Media is private, versioned, and has an infrastructure-managed lifecycle
  policy; verify the deployed bucket configuration before treating it as live
  evidence.
- RDS backups and snapshots follow the approved retention window; deletion
  requests must record when backup expiry will complete.
- Audit log: append-only, hash-chained, no deletion.
- GDPR export: `GET /api/export` (NIP-98 auth) — admin can export by pubkey.
- Workspace deletion is a manually verified operation during private beta; use
  the procedure in `docs/DATA_LIFECYCLE.md` and obtain support/security approval.
- Age-gate: not implemented (roadmap if required by jurisdiction).

## Support escalation

User reports → support channel (secure roster) → primary on-call triages →
routes to the service owner.
