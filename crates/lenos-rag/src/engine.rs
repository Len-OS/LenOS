//! `RagEngine` — orchestrates ingest and search.

use uuid::Uuid;

use lenos_core::CommunityId;
use lenos_db::{document as doc_db, Db};

use crate::chunker;
use crate::embedder;
use crate::extractor;
use crate::{ChunkMatch, RagError};

/// RAG engine: ingest documents and search for relevant chunks.
#[derive(Clone)]
pub struct RagEngine {
    pub db: Db,
    pub openai_api_key: String,
    /// S3 put closure: (key, bytes, content_type) → Result<(), String>
    pub s3_put: std::sync::Arc<
        dyn Fn(
                String,
                Vec<u8>,
                String,
            )
                -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>>
            + Send
            + Sync,
    >,
}

impl RagEngine {
    /// Ingest a document: store in S3, extract text, chunk, embed, persist.
    ///
    /// Runs the embedding pipeline and updates the document status to
    /// `ready` on success or `failed` on error.
    pub async fn ingest_document(
        &self,
        doc_id: Uuid,
        community_id: CommunityId,
        channel_id: Option<Uuid>,
        uploader_pubkey: &[u8],
        filename: &str,
        mime_type: &str,
        bytes: Vec<u8>,
    ) -> Result<Uuid, RagError> {
        use sha2::{Digest, Sha256};

        // Compute S3 key from SHA-256 hash.
        let hash = hex::encode(Sha256::digest(&bytes));
        let ext = mime_to_ext(mime_type);
        let s3_key = format!("documents/{hash}.{ext}");
        let byte_size = bytes.len() as i64;

        // Store in S3.
        (self.s3_put)(s3_key.clone(), bytes.clone(), mime_type.to_owned())
            .await
            .map_err(|e| RagError::StorageFailed(e))?;

        // Create DB record using the caller-supplied doc_id so the returned
        // ID matches what the upload handler already sent to the client.
        self.db
            .create_document(doc_db::CreateDocumentParams {
                id: doc_id,
                community_id,
                channel_id,
                uploaded_by: uploader_pubkey.to_vec(),
                filename: filename.to_owned(),
                mime_type: mime_type.to_owned(),
                s3_key: s3_key.clone(),
                byte_size,
            })
            .await
            .map_err(|e| RagError::DbError(e.to_string()))?;

        // Extract text.
        let text = match extractor::extract_text(&bytes, mime_type) {
            Ok(t) => t,
            Err(e) => {
                let _ = self
                    .db
                    .update_document_status(community_id, doc_id, "failed", Some(&e.to_string()))
                    .await;
                return Err(e);
            }
        };

        // Chunk.
        let chunks = chunker::split(&text);
        if chunks.is_empty() {
            let _ = self
                .db
                .update_document_status(community_id, doc_id, "failed", Some("no text extracted"))
                .await;
            return Err(RagError::ExtractionFailed("no text extracted".into()));
        }

        // Embed.
        let embeddings = match embedder::embed(&chunks, &self.openai_api_key).await {
            Ok(e) => e,
            Err(e) => {
                let _ = self
                    .db
                    .update_document_status(community_id, doc_id, "failed", Some(&e.to_string()))
                    .await;
                return Err(e);
            }
        };

        // Persist chunks.
        let chunk_records: Vec<doc_db::ChunkRecord> = chunks
            .into_iter()
            .zip(embeddings.into_iter())
            .enumerate()
            .map(|(i, (content, embedding))| doc_db::ChunkRecord {
                document_id: doc_id,
                community_id,
                chunk_index: i as i32,
                token_count: (content.len() / 4) as i32,
                content,
                embedding: Some(embedding),
            })
            .collect();

        if let Err(e) = self.db.insert_chunks(&chunk_records).await {
            let _ = self
                .db
                .update_document_status(community_id, doc_id, "failed", Some(&e.to_string()))
                .await;
            return Err(RagError::DbError(e.to_string()));
        }

        self.db
            .update_document_status(community_id, doc_id, "ready", None)
            .await
            .map_err(|e| RagError::DbError(e.to_string()))?;

        Ok(doc_id)
    }

    /// Search for relevant chunks using cosine similarity.
    pub async fn search(
        &self,
        community_id: CommunityId,
        query: &str,
        limit: i64,
        channel_id_filter: Option<Uuid>,
    ) -> Result<Vec<ChunkMatch>, RagError> {
        let embeddings = embedder::embed(&[query.to_owned()], &self.openai_api_key).await?;
        let embedding = embeddings
            .into_iter()
            .next()
            .ok_or_else(|| RagError::EmbeddingFailed("empty embedding response".into()))?;

        let rows = self
            .db
            .search_chunks(community_id, &embedding, limit, channel_id_filter)
            .await
            .map_err(|e| RagError::DbError(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|r| ChunkMatch {
                document_id: r.document_id,
                document_name: r.filename,
                chunk_index: r.chunk_index,
                content: r.content,
                score: r.score,
            })
            .collect())
    }
}

fn mime_to_ext(mime: &str) -> &str {
    match mime {
        "application/pdf" => "pdf",
        "text/markdown" => "md",
        _ => "txt",
    }
}
