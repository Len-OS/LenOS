-- Outgoing webhooks: relay POSTs Nostr events to external URLs on ingest.
-- `event_filter` shape: {"kinds": [40002, 7], "channel_ids": ["uuid1"]} — empty object = all events.

CREATE TABLE outgoing_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL,
    url TEXT NOT NULL CHECK (url LIKE 'https://%' OR url LIKE 'http://%'),
    event_filter JSONB NOT NULL DEFAULT '{}',
    secret TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX outgoing_webhooks_community_id_idx ON outgoing_webhooks(community_id);
