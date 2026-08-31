-- RAG document Q&A: workspace document storage and vector search.
--
-- Requires pgvector extension (Postgres 17 supports it natively via
-- `CREATE EXTENSION IF NOT EXISTS vector`).
--
-- Every document and chunk is community-scoped: the same document UUID
-- in two communities produces two independent records (no cross-tenant data).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    community_id    UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    -- channel_id is community-scoped: channels PK is (community_id, id), so a
    -- bare FK to channels(id) is not valid. Referential integrity is enforced
    -- at the application layer; the idx_documents_channel index covers joins.
    channel_id      UUID,
    uploaded_by     BYTEA NOT NULL,
    filename        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    s3_key          TEXT NOT NULL,
    byte_size       BIGINT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'processing',
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
    ,PRIMARY KEY (community_id, id)
);

CREATE INDEX idx_documents_community ON documents (community_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_channel ON documents (community_id, channel_id)
    WHERE deleted_at IS NULL;

CREATE TABLE document_chunks (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL,
    community_id    UUID NOT NULL,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    token_count     INT NOT NULL,
    embedding       VECTOR(1536),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (community_id, id),
    FOREIGN KEY (community_id, document_id)
        REFERENCES documents(community_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_document ON document_chunks (document_id);
CREATE INDEX idx_chunks_embedding ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;
