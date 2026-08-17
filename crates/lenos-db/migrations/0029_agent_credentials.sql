CREATE TABLE agent_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id    UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    -- Nostr pubkey (hex, 64 chars) of the user who owns these credentials.
    owner_pubkey    TEXT NOT NULL,
    -- d-tag of the agent persona this credential set belongs to.
    agent_d_tag     TEXT NOT NULL,
    -- NIP-44 v2 ciphertext of JSON object: { "ANTHROPIC_API_KEY": "sk-...", ... }
    ciphertext      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (community_id, owner_pubkey, agent_d_tag)
);

CREATE INDEX idx_agent_credentials_owner
    ON agent_credentials (community_id, owner_pubkey);
