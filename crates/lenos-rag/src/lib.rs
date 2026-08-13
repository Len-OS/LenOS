//! LenOS RAG engine — document ingestion and vector search.

pub mod chunker;
pub mod embedder;
pub mod engine;
pub mod extractor;

pub use engine::RagEngine;

use uuid::Uuid;

/// Error types for the RAG pipeline.
#[derive(Debug, thiserror::Error)]
pub enum RagError {
    #[error("unsupported MIME type: {0}")]
    UnsupportedMimeType(String),
    #[error("text extraction failed: {0}")]
    ExtractionFailed(String),
    #[error("embedding failed: {0}")]
    EmbeddingFailed(String),
    #[error("storage failed: {0}")]
    StorageFailed(String),
    #[error("database error: {0}")]
    DbError(String),
}

/// A matching document chunk returned by a search query.
#[derive(Debug, Clone)]
pub struct ChunkMatch {
    pub document_id: Uuid,
    pub document_name: String,
    pub chunk_index: i32,
    pub content: String,
    /// Cosine similarity score (0.0–1.0; higher is more similar).
    pub score: f64,
}
