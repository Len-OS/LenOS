//! Encrypted agent credential storage.
//!
//! Stores NIP-44 v2 ciphertext per (community, owner_pubkey, agent_d_tag).
//! The relay only holds ciphertext; plaintext is never persisted.

use sqlx::Row as _;
use uuid::Uuid;

use lenos_core::CommunityId;

use crate::Db;

/// A row from the `agent_credentials` table.
#[allow(missing_docs)]
pub struct AgentCredentialRecord {
    pub id: Uuid,
    pub community_id: Uuid,
    pub owner_pubkey: String,
    pub agent_d_tag: String,
    /// NIP-44 v2 ciphertext. Never log this value.
    pub ciphertext: String,
}

impl Db {
    /// Upsert NIP-44 ciphertext for (community, owner, agent_d_tag).
    pub async fn upsert_agent_credentials(
        &self,
        community_id: CommunityId,
        owner_pubkey: &str,
        agent_d_tag: &str,
        ciphertext: &str,
    ) -> Result<AgentCredentialRecord, sqlx::Error> {
        let row = sqlx::query(
            "INSERT INTO agent_credentials (community_id, owner_pubkey, agent_d_tag, ciphertext) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (community_id, owner_pubkey, agent_d_tag) \
             DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = NOW() \
             RETURNING id, community_id, owner_pubkey, agent_d_tag, ciphertext",
        )
        .bind(community_id.as_uuid())
        .bind(owner_pubkey)
        .bind(agent_d_tag)
        .bind(ciphertext)
        .fetch_one(&self.pool)
        .await?;
        Ok(AgentCredentialRecord {
            id: row.try_get("id")?,
            community_id: row.try_get("community_id")?,
            owner_pubkey: row.try_get("owner_pubkey")?,
            agent_d_tag: row.try_get("agent_d_tag")?,
            ciphertext: row.try_get("ciphertext")?,
        })
    }

    /// Fetch a credential record by (community, owner, agent_d_tag).
    pub async fn get_agent_credentials(
        &self,
        community_id: CommunityId,
        owner_pubkey: &str,
        agent_d_tag: &str,
    ) -> Result<Option<AgentCredentialRecord>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, community_id, owner_pubkey, agent_d_tag, ciphertext \
             FROM agent_credentials \
             WHERE community_id = $1 AND owner_pubkey = $2 AND agent_d_tag = $3",
        )
        .bind(community_id.as_uuid())
        .bind(owner_pubkey)
        .bind(agent_d_tag)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| AgentCredentialRecord {
            id: r.try_get("id").unwrap(),
            community_id: r.try_get("community_id").unwrap(),
            owner_pubkey: r.try_get("owner_pubkey").unwrap(),
            agent_d_tag: r.try_get("agent_d_tag").unwrap(),
            ciphertext: r.try_get("ciphertext").unwrap(),
        }))
    }

    /// Delete credential record for (community, owner, agent_d_tag).
    ///
    /// Returns the number of rows deleted (0 or 1).
    pub async fn delete_agent_credentials(
        &self,
        community_id: CommunityId,
        owner_pubkey: &str,
        agent_d_tag: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM agent_credentials \
             WHERE community_id = $1 AND owner_pubkey = $2 AND agent_d_tag = $3",
        )
        .bind(community_id.as_uuid())
        .bind(owner_pubkey)
        .bind(agent_d_tag)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }
}
