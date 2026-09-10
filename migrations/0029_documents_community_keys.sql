-- Harden document identity and referential integrity for multi-community data.
-- Migration 0027 created these tables before the tenant-key contract was
-- enforced; replace the global keys with community-leading composite keys.

ALTER TABLE document_chunks
    DROP CONSTRAINT IF EXISTS document_chunks_document_id_fkey;

ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS documents_pkey;

ALTER TABLE documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (community_id, id);

ALTER TABLE document_chunks
    DROP CONSTRAINT IF EXISTS document_chunks_pkey;

ALTER TABLE document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (community_id, id);

ALTER TABLE document_chunks
    ADD CONSTRAINT document_chunks_document_fk
    FOREIGN KEY (community_id, document_id)
    REFERENCES documents (community_id, id)
    ON DELETE CASCADE;
