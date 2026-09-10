-- Align outgoing webhook identity with the tenant-scoped key contract.

ALTER TABLE outgoing_webhooks
    DROP CONSTRAINT IF EXISTS outgoing_webhooks_pkey;

ALTER TABLE outgoing_webhooks
    ADD CONSTRAINT outgoing_webhooks_pkey PRIMARY KEY (community_id, id);
