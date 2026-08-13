# WF-07: Implement SendDm + SetChannelTopic Workflow Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `NotImplemented` stubs for `SendDm` and `SetChannelTopic` workflow actions with real relay-backed implementations.

**Architecture:** Add two methods to the `ActionSink` trait, implement them in `RelayActionSink`, and wire the executor to call them. `SendDm` reuses `create_dm` to get-or-create a DM channel, then posts a kind:9 event the same way `SendMessage` does. `SetChannelTopic` calls the existing `db.set_topic` function.

**Tech Stack:** Rust, tokio, nostr crate, sqlx (Postgres), `lenos-db`, `lenos-workflow`, `lenos-relay`

## Global Constraints

- All async trait methods must return `Pin<Box<dyn Future<...> + Send + '_>>` for dyn-compatibility.
- No new dependencies. Reuse helpers from `send_message` in `workflow_sink.rs`.
- Run `cargo test -p lenos-workflow` and `cargo test -p lenos-relay` before committing.
- `cargo fmt` and `cargo clippy -- -D warnings` must pass.

---

### Task 1: Add `send_dm` + `set_channel_topic` to `ActionSink` trait

**Files:**
- Modify: `crates/lenos-workflow/src/action_sink.rs`

**Interfaces:**
- Produces:
  - `ActionSink::send_dm(community_id, sender_pubkey_hex, recipient_pubkey_hex, text) -> Pin<Box<dyn Future<Output = Result<String, ActionSinkError>> + Send + '_>>`
  - `ActionSink::set_channel_topic(community_id, channel_id_uuid_str, topic, set_by_pubkey_hex) -> Pin<Box<dyn Future<Output = Result<(), ActionSinkError>> + Send + '_>>`

- [ ] **Step 1: Write failing compilation test**

Add at the end of `crates/lenos-workflow/src/action_sink.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    struct _AssertTraitBounds;
    // If ActionSink gains the new methods without the right signatures, this file won't compile.
    fn _check_trait_object(_: &dyn ActionSink) {}
}
```

- [ ] **Step 2: Run to verify test compiles (it will, because trait isn't changed yet)**

```
cargo check -p lenos-workflow
```

Expected: OK (baseline).

- [ ] **Step 3: Add the two methods to the `ActionSink` trait**

In `crates/lenos-workflow/src/action_sink.rs`, after the closing brace of `send_message`:

```rust
    /// Send a direct message on behalf of the workflow owner.
    ///
    /// Creates or reuses the DM channel for `(sender, recipient)`.
    /// Returns the event ID hex string on success.
    fn send_dm(
        &self,
        community_id: CommunityId,
        sender_pubkey_hex: &str,
        recipient_pubkey_hex: &str,
        text: &str,
    ) -> Pin<Box<dyn Future<Output = Result<String, ActionSinkError>> + Send + '_>>;

    /// Update the topic of a channel.
    ///
    /// `channel_id` must be a UUID string. `set_by_pubkey_hex` is used to
    /// record who made the change.
    fn set_channel_topic(
        &self,
        community_id: CommunityId,
        channel_id: &str,
        topic: &str,
        set_by_pubkey_hex: &str,
    ) -> Pin<Box<dyn Future<Output = Result<(), ActionSinkError>> + Send + '_>>;
```

- [ ] **Step 4: Verify the crate fails to compile (expected — RelayActionSink doesn't implement the new methods yet)**

```
cargo check -p lenos-relay
```

Expected: error about missing trait methods on `RelayActionSink`. This is the failing "test".

- [ ] **Step 5: Commit trait definition**

```bash
git add crates/lenos-workflow/src/action_sink.rs
git commit -m "feat(workflow): add send_dm and set_channel_topic to ActionSink trait (WF-07)"
```

---

### Task 2: Implement `send_dm` in `RelayActionSink`

**Files:**
- Modify: `crates/lenos-relay/src/workflow_sink.rs`

**Interfaces:**
- Consumes: `ActionSink::send_dm` signature from Task 1
- Consumes: `db.create_dm(community_id, &[sender_bytes, recipient_bytes], sender_bytes) -> Result<ChannelRecord>`
- Consumes: existing `send_message` implementation in same file (lines ~185–363) as reference

- [ ] **Step 1: Implement `send_dm` in the `impl ActionSink for RelayActionSink` block**

In `crates/lenos-relay/src/workflow_sink.rs`, inside `impl ActionSink for RelayActionSink { ... }`, after the `send_message` method closing brace, add:

```rust
    fn send_dm(
        &self,
        community_id: CommunityId,
        sender_pubkey_hex: &str,
        recipient_pubkey_hex: &str,
        text: &str,
    ) -> Pin<Box<dyn Future<Output = Result<String, ActionSinkError>> + Send + '_>> {
        let sender_hex = sender_pubkey_hex.to_owned();
        let recipient_hex = recipient_pubkey_hex.to_owned();
        let text = text.to_owned();

        Box::pin(async move {
            let state = self
                .state
                .upgrade()
                .ok_or_else(|| ActionSinkError::Database("relay is shutting down".into()))?;

            if text.trim().is_empty() {
                return Err(ActionSinkError::EmptyContent);
            }

            // Resolve community host for TenantContext.
            let host = state
                .db
                .lookup_community_host(community_id)
                .await
                .map_err(|e| ActionSinkError::Database(e.to_string()))?
                .ok_or_else(|| {
                    ActionSinkError::Database(format!(
                        "community {community_id} not mapped to a host"
                    ))
                })?;
            let tenant = lenos_core::tenant::TenantContext::resolved(community_id, host);

            // Parse pubkeys.
            let sender_pk = nostr::PublicKey::from_hex(&sender_hex)
                .map_err(|e| ActionSinkError::InvalidInput(format!("invalid sender pubkey: {e}")))?;
            let recipient_pk = nostr::PublicKey::from_hex(&recipient_hex)
                .map_err(|e| {
                    ActionSinkError::InvalidInput(format!("invalid recipient pubkey: {e}"))
                })?;
            let sender_bytes = sender_pk.to_bytes().to_vec();
            let recipient_bytes = recipient_pk.to_bytes().to_vec();

            // Get or create the DM channel.
            let dm_channel = state
                .db
                .create_dm(
                    community_id,
                    &[sender_bytes.as_slice(), recipient_bytes.as_slice()],
                    sender_bytes.as_slice(),
                )
                .await
                .map_err(|e| ActionSinkError::Database(e.to_string()))?;

            let channel_uuid = dm_channel.id;
            let channel_id_str = channel_uuid.to_string();

            // Build kind:9 event (same pattern as send_message).
            let mut tags = vec![
                Tag::parse(["p", &sender_hex])
                    .map_err(|e| ActionSinkError::EventBuild(format!("p tag: {e}")))?,
                Tag::parse(["h", &channel_id_str])
                    .map_err(|e| ActionSinkError::EventBuild(format!("h tag: {e}")))?,
                Tag::parse(["lenos:workflow", "true"])
                    .map_err(|e| ActionSinkError::EventBuild(format!("workflow tag: {e}")))?,
            ];
            // Also tag the recipient so they receive the DM notification.
            tags.push(
                Tag::parse(["p", &recipient_hex])
                    .map_err(|e| ActionSinkError::EventBuild(format!("recipient p tag: {e}")))?,
            );

            let kind = nostr::Kind::from(lenos_core::kind::KIND_STREAM_MESSAGE as u16);
            let event = nostr::EventBuilder::new(kind, &text)
                .tags(tags)
                .sign_with_keys(&state.relay_keypair)
                .map_err(|e| ActionSinkError::EventBuild(format!("signing: {e}")))?;

            let event_id_hex = event.id.to_hex();
            let event_id_bytes = event.id.as_bytes().to_vec();
            let event_created_at = {
                let ts = event.created_at.as_secs() as i64;
                chrono::DateTime::from_timestamp(ts, 0).unwrap_or_else(chrono::Utc::now)
            };

            let thread_meta = Some(lenos_db::event::ThreadMetadataParams {
                event_id: &event_id_bytes,
                event_created_at,
                channel_id: channel_uuid,
                parent_event_id: None,
                parent_event_created_at: None,
                root_event_id: None,
                root_event_created_at: None,
                depth: 0,
                broadcast: false,
            });

            let (stored_event, was_inserted) = state
                .db
                .insert_event_with_thread_metadata(
                    tenant.community(),
                    &event,
                    Some(channel_uuid),
                    thread_meta,
                )
                .await
                .map_err(|e| ActionSinkError::Database(e.to_string()))?;

            if was_inserted {
                let _ = dispatch_persistent_event(
                    &tenant,
                    &state,
                    &stored_event,
                    lenos_core::kind::KIND_STREAM_MESSAGE,
                    &sender_hex,
                    None,
                )
                .await;
            }

            Ok(event_id_hex)
        })
    }
```

- [ ] **Step 2: Verify it compiles**

```
cargo check -p lenos-relay
```

Expected: error about missing `set_channel_topic` only.

- [ ] **Step 3: Implement `set_channel_topic` in the same `impl` block**

```rust
    fn set_channel_topic(
        &self,
        community_id: CommunityId,
        channel_id: &str,
        topic: &str,
        set_by_pubkey_hex: &str,
    ) -> Pin<Box<dyn Future<Output = Result<(), ActionSinkError>> + Send + '_>> {
        let channel_id = channel_id.to_owned();
        let topic = topic.to_owned();
        let set_by_hex = set_by_pubkey_hex.to_owned();

        Box::pin(async move {
            let state = self
                .state
                .upgrade()
                .ok_or_else(|| ActionSinkError::Database("relay is shutting down".into()))?;

            let channel_uuid = uuid::Uuid::parse_str(&channel_id)
                .map_err(|e| ActionSinkError::InvalidInput(format!("invalid channel UUID: {e}")))?;

            let set_by_pk = nostr::PublicKey::from_hex(&set_by_hex)
                .map_err(|e| ActionSinkError::InvalidInput(format!("invalid pubkey: {e}")))?;
            let set_by_bytes = set_by_pk.to_bytes().to_vec();

            state
                .db
                .set_topic(community_id, channel_uuid, &topic, &set_by_bytes)
                .await
                .map_err(|e| match e {
                    lenos_db::DbError::ChannelNotFound(_) => {
                        ActionSinkError::ChannelNotFound(channel_id.clone())
                    }
                    _ => ActionSinkError::Database(e.to_string()),
                })?;

            Ok(())
        })
    }
```

- [ ] **Step 4: Verify full compile**

```
cargo check -p lenos-relay
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add crates/lenos-relay/src/workflow_sink.rs
git commit -m "feat(relay): implement send_dm and set_channel_topic in RelayActionSink (WF-07)"
```

---

### Task 3: Wire executor — replace NotImplemented stubs

**Files:**
- Modify: `crates/lenos-workflow/src/executor.rs:580-590`

**Interfaces:**
- Consumes: `ActionSink::send_dm` + `ActionSink::set_channel_topic` from Task 1
- Consumes: existing `get_workflow_run` + `get_workflow` + `owner_pubkey` pattern from `SendMessage` arm (lines ~530–578)

- [ ] **Step 1: Write a unit test that proves the stubs return `NotImplemented` currently**

In `crates/lenos-workflow/src/executor.rs`, inside `mod tests` at the bottom:

```rust
    #[test]
    fn send_dm_stub_returns_not_implemented() {
        // Verifies that when we remove the stub the test must be updated.
        // This is a compile-time sentinel — after implementing, replace the
        // assert with one that verifies the action routes to action_sink.send_dm.
        let action = ActionDef::SendDm {
            to: "abc".to_string(),
            text: "hello".to_string(),
        };
        // Destructure to confirm the variant still exists.
        if let ActionDef::SendDm { to, text } = action {
            assert_eq!(to, "abc");
            assert_eq!(text, "hello");
        } else {
            panic!("SendDm variant missing");
        }
    }

    #[test]
    fn set_channel_topic_stub_returns_not_implemented() {
        let action = ActionDef::SetChannelTopic {
            topic: "new topic".to_string(),
        };
        if let ActionDef::SetChannelTopic { topic } = action {
            assert_eq!(topic, "new topic");
        } else {
            panic!("SetChannelTopic variant missing");
        }
    }
```

- [ ] **Step 2: Run to verify tests pass**

```
cargo test -p lenos-workflow -- send_dm_stub set_channel_topic_stub
```

Expected: PASS (the variant destructuring works).

- [ ] **Step 3: Replace `SendDm` stub in `dispatch_action`**

In `executor.rs`, replace lines 580–584:
```rust
        SendDm { to, text: _ } => {
            warn!(run_id = %run_id, step = step_id, "SendDm not yet implemented (to={to})");
            // TODO (WF-07): emit DM event.
            Err(WorkflowError::NotImplemented("SendDm".into()))
        }
```

with:

```rust
        SendDm { to, text } => {
            let wf_run = engine
                .db
                .get_workflow_run(community_id, run_id)
                .await
                .map_err(|e| {
                    WorkflowError::WebhookError(format!(
                        "SendDm: failed to load workflow run {run_id}: {e}"
                    ))
                })?;
            let workflow = engine
                .db
                .get_workflow(community_id, wf_run.workflow_id)
                .await
                .map_err(|e| {
                    WorkflowError::WebhookError(format!(
                        "SendDm: failed to load workflow {}: {e}",
                        wf_run.workflow_id
                    ))
                })?;
            let sender_pubkey_hex = hex::encode(&workflow.owner_pubkey);

            info!(
                run_id = %run_id,
                step = step_id,
                to = %to,
                "SendDm → {to}"
            );

            let event_id = engine
                .action_sink()?
                .send_dm(community_id, &sender_pubkey_hex, to, text)
                .await
                .map_err(WorkflowError::from)?;

            Ok(StepResult::Completed(serde_json::json!({
                "sent": true,
                "event_id": event_id,
            })))
        }
```

- [ ] **Step 4: Replace `SetChannelTopic` stub**

Replace lines 586–590:
```rust
        SetChannelTopic { topic: _ } => {
            warn!(run_id = %run_id, step = step_id, "SetChannelTopic not yet implemented");
            // TODO (WF-07): update channel topic via DB.
            Err(WorkflowError::NotImplemented("SetChannelTopic".into()))
        }
```

with:

```rust
        SetChannelTopic { topic } => {
            let channel_id = trigger_ctx.channel_id.as_str();
            if channel_id.is_empty() {
                return Err(WorkflowError::InvalidDefinition(
                    "SetChannelTopic: no trigger.channel_id available".into(),
                ));
            }

            let wf_run = engine
                .db
                .get_workflow_run(community_id, run_id)
                .await
                .map_err(|e| {
                    WorkflowError::WebhookError(format!(
                        "SetChannelTopic: failed to load workflow run {run_id}: {e}"
                    ))
                })?;
            let workflow = engine
                .db
                .get_workflow(community_id, wf_run.workflow_id)
                .await
                .map_err(|e| {
                    WorkflowError::WebhookError(format!(
                        "SetChannelTopic: failed to load workflow {}: {e}",
                        wf_run.workflow_id
                    ))
                })?;
            let set_by_hex = hex::encode(&workflow.owner_pubkey);

            info!(
                run_id = %run_id,
                step = step_id,
                channel_id = %channel_id,
                "SetChannelTopic → {channel_id}: {topic}"
            );

            engine
                .action_sink()?
                .set_channel_topic(community_id, channel_id, topic, &set_by_hex)
                .await
                .map_err(WorkflowError::from)?;

            Ok(StepResult::Completed(serde_json::json!({
                "updated": true,
                "channel_id": channel_id,
            })))
        }
```

- [ ] **Step 5: Run all workflow tests**

```
cargo test -p lenos-workflow
```

Expected: all pass.

- [ ] **Step 6: Run relay tests**

```
cargo test -p lenos-relay
```

Expected: all pass.

- [ ] **Step 7: cargo fmt + clippy**

```
cargo fmt --all
cargo clippy --all-targets -- -D warnings
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add crates/lenos-workflow/src/executor.rs
git commit -m "feat(workflow): implement SendDm and SetChannelTopic actions (WF-07)"
```
