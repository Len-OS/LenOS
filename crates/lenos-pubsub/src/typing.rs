//! Typing indicator tracking — ephemeral Redis keys with 8s TTL.
//!
//! Key format: `lenos:{community}:typing:{channel_id}:{pubkey_hex}`
//! Value: `"1"`, TTL: 8 seconds.

use deadpool_redis::Pool;
use lenos_core::TenantContext;
use nostr::PublicKey;
use uuid::Uuid;

use crate::error::PubSubError;
use crate::topic::LENOS_PREFIX;

pub const TYPING_TTL_SECS: u64 = 8;

pub fn typing_key(ctx: &TenantContext, channel_id: Uuid, pubkey: &PublicKey) -> String {
    format!(
        "{LENOS_PREFIX}:{}:typing:{}:{}",
        ctx.community(),
        channel_id,
        pubkey.to_hex()
    )
}

/// Mark `pubkey` as typing in `channel_id` with an 8s TTL.
pub async fn set_typing(
    pool: &Pool,
    ctx: &TenantContext,
    channel_id: Uuid,
    pubkey: &PublicKey,
) -> Result<(), PubSubError> {
    let mut conn = pool.get().await?;
    let key = typing_key(ctx, channel_id, pubkey);
    redis::cmd("SET")
        .arg(&key)
        .arg("1")
        .arg("EX")
        .arg(TYPING_TTL_SECS)
        .query_async::<()>(&mut conn)
        .await?;
    Ok(())
}

/// Return hex pubkeys currently typing in `channel_id` (non-expired keys only).
pub async fn get_typers(
    pool: &Pool,
    ctx: &TenantContext,
    channel_id: Uuid,
) -> Result<Vec<String>, PubSubError> {
    let mut conn = pool.get().await?;
    let pattern = format!("{LENOS_PREFIX}:{}:typing:{}:*", ctx.community(), channel_id);

    let mut cursor: u64 = 0;
    let mut pubkeys = Vec::new();

    loop {
        let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(&pattern)
            .arg("COUNT")
            .arg(100u64)
            .query_async(&mut conn)
            .await?;

        for key in keys {
            // Key suffix after the last ':' is the pubkey hex.
            if let Some(hex) = key.rsplit(':').next() {
                pubkeys.push(hex.to_string());
            }
        }

        cursor = next_cursor;
        if cursor == 0 {
            break;
        }
    }

    Ok(pubkeys)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::make_test_pool;
    use lenos_core::{CommunityId, TenantContext};
    use nostr::Keys;
    use uuid::Uuid;

    fn make_pubkey() -> nostr::PublicKey {
        Keys::generate().public_key()
    }

    fn ctx(id: u128, host: &str) -> TenantContext {
        TenantContext::resolved(CommunityId::from_uuid(Uuid::from_u128(id)), host)
    }

    #[test]
    fn typing_ttl_is_8s() {
        assert_eq!(TYPING_TTL_SECS, 8);
    }

    #[test]
    fn typing_key_format() {
        let pubkey = make_pubkey();
        let ctx = ctx(0xaaaa, "a.example");
        let channel_id = Uuid::from_u128(0xcccc);
        let key = typing_key(&ctx, channel_id, &pubkey);
        let prefix = format!("lenos:{}:typing:{}:", ctx.community(), channel_id);
        assert!(key.starts_with(&prefix));
        let hex_part = key.strip_prefix(&prefix).unwrap();
        assert_eq!(hex_part.len(), 64);
        assert!(hex_part.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn same_pubkey_different_channels_different_keys() {
        let pubkey = make_pubkey();
        let ctx = ctx(0xaaaa, "a.example");
        let ch_a = Uuid::from_u128(0x1111);
        let ch_b = Uuid::from_u128(0x2222);
        assert_ne!(
            typing_key(&ctx, ch_a, &pubkey),
            typing_key(&ctx, ch_b, &pubkey)
        );
    }

    #[tokio::test]
    #[ignore = "requires Redis"]
    async fn test_set_and_get_typers() {
        let pool = make_test_pool();
        let pubkey = make_pubkey();
        let ctx = ctx(0xaaaa, "a.example");
        let channel_id = Uuid::new_v4();

        let typers = get_typers(&pool, &ctx, channel_id).await.unwrap();
        assert!(typers.is_empty());

        set_typing(&pool, &ctx, channel_id, &pubkey).await.unwrap();
        let typers = get_typers(&pool, &ctx, channel_id).await.unwrap();
        assert_eq!(typers, vec![pubkey.to_hex()]);
    }

    #[tokio::test]
    #[ignore = "requires Redis"]
    async fn test_typing_ttl() {
        let pool = make_test_pool();
        let pubkey = make_pubkey();
        let ctx = ctx(0xaaaa, "a.example");
        let channel_id = Uuid::new_v4();

        set_typing(&pool, &ctx, channel_id, &pubkey).await.unwrap();

        let mut conn = pool.get().await.unwrap();
        let ttl: i64 = redis::cmd("TTL")
            .arg(typing_key(&ctx, channel_id, &pubkey))
            .query_async(&mut conn)
            .await
            .unwrap();

        assert!(
            ttl > 0 && ttl <= TYPING_TTL_SECS as i64,
            "TTL should be 1-{TYPING_TTL_SECS}s, got {ttl}"
        );
    }

    #[tokio::test]
    #[ignore = "requires Redis"]
    async fn typers_isolated_by_channel() {
        let pool = make_test_pool();
        let pubkey = make_pubkey();
        let ctx = ctx(0xaaaa, "a.example");
        let ch_a = Uuid::new_v4();
        let ch_b = Uuid::new_v4();

        set_typing(&pool, &ctx, ch_a, &pubkey).await.unwrap();

        let a_typers = get_typers(&pool, &ctx, ch_a).await.unwrap();
        let b_typers = get_typers(&pool, &ctx, ch_b).await.unwrap();
        assert_eq!(a_typers, vec![pubkey.to_hex()]);
        assert!(b_typers.is_empty());
    }
}
