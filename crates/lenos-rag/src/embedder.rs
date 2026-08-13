//! OpenAI text-embedding-3-small embeddings client.

use serde::{Deserialize, Serialize};

use crate::RagError;

const EMBEDDING_MODEL: &str = "text-embedding-3-small";
const BATCH_SIZE: usize = 100;

#[derive(Serialize)]
struct EmbedRequest<'a> {
    model: &'static str,
    input: &'a [String],
}

#[derive(Deserialize)]
struct EmbedResponse {
    data: Vec<EmbedData>,
}

#[derive(Deserialize)]
struct EmbedData {
    embedding: Vec<f32>,
}

/// Embed `texts` using OpenAI `text-embedding-3-small` (1536-dim).
///
/// Batches up to 100 texts per request. `api_key` is the OpenAI secret key.
pub async fn embed(texts: &[String], api_key: &str) -> Result<Vec<Vec<f32>>, RagError> {
    if texts.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let mut results: Vec<Vec<f32>> = Vec::with_capacity(texts.len());

    for batch in texts.chunks(BATCH_SIZE) {
        let body = EmbedRequest {
            model: EMBEDDING_MODEL,
            input: batch,
        };
        let resp = client
            .post("https://api.openai.com/v1/embeddings")
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| RagError::EmbeddingFailed(format!("request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(RagError::EmbeddingFailed(format!(
                "OpenAI embeddings returned {status}: {body}"
            )));
        }

        let parsed: EmbedResponse = resp
            .json()
            .await
            .map_err(|e| RagError::EmbeddingFailed(format!("response parse failed: {e}")))?;

        results.extend(parsed.data.into_iter().map(|d| d.embedding));
    }

    Ok(results)
}
