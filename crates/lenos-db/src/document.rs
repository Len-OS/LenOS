//! Document and document-chunk persistence for the RAG pipeline.

use chrono::{DateTime, Utc};
use pgvector::Vector;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::Result;
use lenos_core::CommunityId;

/// Parameters for creating a new document record.
#[allow(missing_docs)]
pub struct CreateDocumentParams {
    pub id: Uuid,
    pub community_id: CommunityId,
    pub channel_id: Option<Uuid>,
    pub uploaded_by: Vec<u8>,
    pub filename: String,
    pub mime_type: String,
    pub s3_key: String,
    pub byte_size: i64,
}

/// A document row as returned from the database.
#[derive(Debug, Clone)]
#[allow(missing_docs)]
pub struct DocumentRecord {
    pub id: Uuid,
    pub community_id: Uuid,
    pub channel_id: Option<Uuid>,
    pub uploaded_by: Vec<u8>,
    pub filename: String,
    pub mime_type: String,
    pub s3_key: String,
    pub byte_size: i64,
    pub status: String,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// A document chunk row used for bulk insert.
#[allow(missing_docs)]
pub struct ChunkRecord {
    pub document_id: Uuid,
    pub community_id: CommunityId,
    pub chunk_index: i32,
    pub content: String,
    pub token_count: i32,
    pub embedding: Option<Vec<f32>>,
}

/// A chunk result with document metadata from a similarity search.
#[derive(Debug, Clone)]
#[allow(missing_docs)]
pub struct ChunkSearchResult {
    pub id: Uuid,
    pub document_id: Uuid,
    pub chunk_index: i32,
    pub content: String,
    pub filename: String,
    pub channel_id: Option<Uuid>,
    pub score: f64,
}

/// Insert a document record and return it.
pub async fn create_document(
    pool: &PgPool,
    params: CreateDocumentParams,
) -> Result<DocumentRecord> {
    let row = sqlx::query(
        r#"
        INSERT INTO documents (id, community_id, channel_id, uploaded_by, filename, mime_type, s3_key, byte_size)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, community_id, channel_id, uploaded_by, filename, mime_type,
                  s3_key, byte_size, status, error, created_at
        "#,
    )
    .bind(params.id)
    .bind(params.community_id.as_uuid())
    .bind(params.channel_id)
    .bind(&params.uploaded_by)
    .bind(&params.filename)
    .bind(&params.mime_type)
    .bind(&params.s3_key)
    .bind(params.byte_size)
    .fetch_one(pool)
    .await?;

    Ok(row_to_document(&row))
}

/// Update document status and optional error message.
pub async fn update_document_status(
    pool: &PgPool,
    community_id: CommunityId,
    id: Uuid,
    status: &str,
    error: Option<&str>,
) -> Result<()> {
    sqlx::query("UPDATE documents SET status = $1, error = $2 WHERE community_id = $3 AND id = $4")
        .bind(status)
        .bind(error)
        .bind(community_id.as_uuid())
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Bulk insert document chunks.
pub async fn insert_chunks(pool: &PgPool, chunks: &[ChunkRecord]) -> Result<()> {
    if chunks.is_empty() {
        return Ok(());
    }

    // Chunked INSERT to avoid hitting parameter limits.
    const BATCH: usize = 50;
    for batch in chunks.chunks(BATCH) {
        let mut qb = sqlx::QueryBuilder::new(
            "INSERT INTO document_chunks (document_id, community_id, chunk_index, content, token_count, embedding) ",
        );
        qb.push_values(batch, |mut b, chunk| {
            let embedding = chunk.embedding.as_ref().map(|v| Vector::from(v.clone()));
            b.push_bind(chunk.document_id)
                .push_bind(chunk.community_id.as_uuid())
                .push_bind(chunk.chunk_index)
                .push_bind(&chunk.content)
                .push_bind(chunk.token_count)
                .push_bind(embedding);
        });
        qb.build().execute(pool).await?;
    }
    Ok(())
}

/// Cosine similarity search over embedded document chunks.
pub async fn search_chunks(
    pool: &PgPool,
    community_id: CommunityId,
    embedding: &[f32],
    limit: i64,
    channel_id: Option<Uuid>,
) -> Result<Vec<ChunkSearchResult>> {
    let vec = Vector::from(embedding.to_vec());
    let rows = sqlx::query(
        r#"
        SELECT
            dc.id,
            dc.document_id,
            dc.chunk_index,
            dc.content,
            d.filename,
            d.channel_id,
            (1.0 - (dc.embedding <=> $1::vector))::float8 AS score
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE dc.community_id = $2
          AND d.deleted_at IS NULL
          AND d.status = 'ready'
          AND ($3::uuid IS NULL OR d.channel_id = $3)
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> $1::vector
        LIMIT $4
        "#,
    )
    .bind(vec)
    .bind(community_id.as_uuid())
    .bind(channel_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(row_to_chunk_search).collect())
}

/// List documents for a community (and optionally a channel), most recent first.
pub async fn list_documents(
    pool: &PgPool,
    community_id: CommunityId,
    channel_id: Option<Uuid>,
    limit: i64,
) -> Result<Vec<DocumentRecord>> {
    let rows = sqlx::query(
        r#"
        SELECT id, community_id, channel_id, uploaded_by, filename, mime_type,
               s3_key, byte_size, status, error, created_at
        FROM documents
        WHERE community_id = $1
          AND deleted_at IS NULL
          AND ($2::uuid IS NULL OR channel_id = $2)
        ORDER BY created_at DESC
        LIMIT $3
        "#,
    )
    .bind(community_id.as_uuid())
    .bind(channel_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows.iter().map(row_to_document).collect())
}

/// Soft-delete a document (set deleted_at). Only the uploader may delete.
pub async fn soft_delete_document(
    pool: &PgPool,
    community_id: CommunityId,
    id: Uuid,
    deleted_by: &[u8],
) -> Result<bool> {
    let result = sqlx::query(
        r#"
        UPDATE documents
        SET deleted_at = NOW()
        WHERE community_id = $1
          AND id = $2
          AND uploaded_by = $3
          AND deleted_at IS NULL
        "#,
    )
    .bind(community_id.as_uuid())
    .bind(id)
    .bind(deleted_by)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

fn row_to_document(row: &sqlx::postgres::PgRow) -> DocumentRecord {
    use sqlx::Row;
    DocumentRecord {
        id: row.get("id"),
        community_id: row.get("community_id"),
        channel_id: row.get("channel_id"),
        uploaded_by: row.get("uploaded_by"),
        filename: row.get("filename"),
        mime_type: row.get("mime_type"),
        s3_key: row.get("s3_key"),
        byte_size: row.get("byte_size"),
        status: row.get("status"),
        error: row.get("error"),
        created_at: row.get("created_at"),
    }
}

fn row_to_chunk_search(row: &sqlx::postgres::PgRow) -> ChunkSearchResult {
    use sqlx::Row;
    ChunkSearchResult {
        id: row.get("id"),
        document_id: row.get("document_id"),
        chunk_index: row.get("chunk_index"),
        content: row.get("content"),
        filename: row.get("filename"),
        channel_id: row.get("channel_id"),
        score: row.get("score"),
    }
}
