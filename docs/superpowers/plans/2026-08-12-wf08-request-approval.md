# WF-08: Implement RequestApproval Persistence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a workflow hits a `RequestApproval` step, persist the approval record in the DB and mark the run as `WaitingApproval` instead of `Failed`. The resume + grant/deny handlers already exist in `command_executor.rs`.

**Architecture:** `ExecutionResult` gets an `ApprovalContext` field to carry the step_id, approver_spec, and expires_at from the suspended step to `finalize_run`. `finalize_run` calls `db.create_approval` + `db.update_workflow_run(WaitingApproval)` when this field is set.

**Tech Stack:** Rust, tokio, sqlx (Postgres), `lenos-workflow`, `lenos-db`

## Global Constraints

- Do not touch `command_executor.rs` — the grant/deny/resume handlers there are already correct.
- `create_approval` stores a SHA-256 hash of the raw token; pass the raw token from `ExecutionResult::approval_token`.
- Timeout default: 24 hours when the workflow step omits `timeout:`.
- Run `cargo test -p lenos-workflow` before committing.

---

### Task 1: Add `ApprovalContext` to `ExecutionResult`

**Files:**
- Modify: `crates/lenos-workflow/src/executor.rs`

**Interfaces:**
- Produces: `ExecutionResult { ..., approval_context: Option<ApprovalContext> }` where
  ```rust
  pub struct ApprovalContext {
      pub step_id: String,
      pub approver_spec: String,
      pub expires_at: chrono::DateTime<chrono::Utc>,
  }
  ```

- [ ] **Step 1: Write test that checks `ExecutionResult` currently has no `approval_context` field**

In `crates/lenos-workflow/src/executor.rs` inside `mod tests`:

```rust
    #[test]
    fn execution_result_has_approval_token_field() {
        // Structural sentinel — update when ApprovalContext is added.
        let result = ExecutionResult {
            approval_token: Some("tok".into()),
            step_index: 1,
            step_outputs: HashMap::new(),
            trace: vec![],
        };
        assert!(result.approval_token.is_some());
    }
```

- [ ] **Step 2: Run test to verify it compiles and passes**

```
cargo test -p lenos-workflow -- execution_result_has_approval_token_field
```

Expected: PASS.

- [ ] **Step 3: Add `ApprovalContext` struct and extend `ExecutionResult`**

In `executor.rs`, above `ExecutionResult` struct (around line 935):

```rust
/// Context carried from a suspended `RequestApproval` step to `finalize_run`.
#[derive(Debug)]
pub struct ApprovalContext {
    /// ID of the step that requested approval.
    pub step_id: String,
    /// Who may approve — passed through to `create_approval`.
    pub approver_spec: String,
    /// When this approval expires.
    pub expires_at: chrono::DateTime<chrono::Utc>,
}
```

Then add `approval_context: Option<ApprovalContext>` to `ExecutionResult`:

```rust
pub struct ExecutionResult {
    pub approval_token: Option<String>,
    pub approval_context: Option<ApprovalContext>,   // ← new
    pub step_index: usize,
    pub step_outputs: HashMap<String, JsonValue>,
    pub trace: Vec<JsonValue>,
}
```

- [ ] **Step 4: Fix the compilation error in the test from Step 1**

The struct initializer now requires `approval_context`. Update the test:

```rust
    #[test]
    fn execution_result_has_approval_token_field() {
        let result = ExecutionResult {
            approval_token: Some("tok".into()),
            approval_context: None,
            step_index: 1,
            step_outputs: HashMap::new(),
            trace: vec![],
        };
        assert!(result.approval_token.is_some());
        assert!(result.approval_context.is_none());
    }
```

- [ ] **Step 5: Fix all other `ExecutionResult { ... }` construction sites in the crate**

Search and update:

```
grep -n "ExecutionResult {" crates/lenos-workflow/src/executor.rs
```

Each site that sets `approval_token: None` needs `approval_context: None` added. Sites that set `approval_token: Some(...)` need `approval_context: Some(...)` — but first we must populate it (done in Task 2).

For now, add `approval_context: None` to all existing construction sites so the crate compiles.

- [ ] **Step 6: Verify crate compiles**

```
cargo check -p lenos-workflow
```

Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add crates/lenos-workflow/src/executor.rs
git commit -m "feat(workflow): add ApprovalContext to ExecutionResult (WF-08)"
```

---

### Task 2: Populate `ApprovalContext` in `dispatch_action` for `RequestApproval`

**Files:**
- Modify: `crates/lenos-workflow/src/executor.rs`

**Interfaces:**
- Consumes: `ApprovalContext` struct from Task 1
- Produces: `StepResult::Suspended { approval_token, approval_context }` — need to extend `StepResult` too

- [ ] **Step 1: Extend `StepResult::Suspended` to carry `ApprovalContext`**

Find `StepResult` enum (around line 459):

```rust
    Suspended {
        approval_token: String,
    },
```

Change to:

```rust
    Suspended {
        approval_token: String,
        approval_context: ApprovalContext,
    },
```

- [ ] **Step 2: Update the `RequestApproval` arm in `dispatch_action`**

Find the `RequestApproval` arm (around line 650). Replace:

```rust
        RequestApproval {
            from,
            message,
            timeout,
        } => {
            let timeout_str = timeout.as_deref().unwrap_or("24h");
            info!(
                run_id = %run_id, step = step_id,
                "RequestApproval from={from} timeout={timeout_str}: {message}"
            );

            let token = generate_approval_token(run_id, step_id);

            // TODO (WF-08): create approval record in DB, emit kind:46010.
            // For now, return Suspended with the token so the caller can persist state.

            Ok(StepResult::Suspended {
                approval_token: token,
            })
        }
```

with:

```rust
        RequestApproval {
            from,
            message,
            timeout,
        } => {
            let timeout_str = timeout.as_deref().unwrap_or("24h");
            info!(
                run_id = %run_id, step = step_id,
                "RequestApproval from={from} timeout={timeout_str}: {message}"
            );

            let token = generate_approval_token(run_id, step_id);
            let timeout_secs = parse_duration_secs(timeout_str).unwrap_or(86_400);
            let expires_at = chrono::Utc::now()
                + chrono::Duration::seconds(timeout_secs as i64);

            Ok(StepResult::Suspended {
                approval_token: token,
                approval_context: ApprovalContext {
                    step_id: step_id.to_owned(),
                    approver_spec: from.clone(),
                    expires_at,
                },
            })
        }
```

- [ ] **Step 3: Update the `StepResult::Suspended` handling in `execute_steps`**

Search for `StepResult::Suspended` in executor.rs (around line 1186):

```rust
            StepResult::Suspended { approval_token } => {
```

Update to destructure both fields and propagate `approval_context` into `ExecutionResult`:

```rust
            StepResult::Suspended { approval_token, approval_context } => {
                info!(
                    run_id = %run_id,
                    step = step_id,
                    "Step suspended — awaiting approval (token: <redacted>)"
                );
                return Ok(ExecutionResult {
                    approval_token: Some(approval_token),
                    approval_context: Some(approval_context),
                    step_index: i,
                    step_outputs,
                    trace,
                });
            }
```

(Replace whatever was there before — check the exact current code for the field names used in the `return` statement.)

- [ ] **Step 4: Run tests**

```
cargo test -p lenos-workflow
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add crates/lenos-workflow/src/executor.rs
git commit -m "feat(workflow): populate ApprovalContext in RequestApproval dispatch (WF-08)"
```

---

### Task 3: Persist approval record in `finalize_run`

**Files:**
- Modify: `crates/lenos-workflow/src/lib.rs`

**Interfaces:**
- Consumes: `ExecutionResult::approval_token` + `ExecutionResult::approval_context` from Tasks 1–2
- Consumes: `self.db.create_approval(CreateApprovalParams { ... })` from `lenos-db`
- Consumes: `RunStatus::WaitingApproval` from `lenos-db`

Note: `finalize_run` needs `run_id` → `workflow_id` to pass to `create_approval`. Fetch the workflow run from DB inside the new branch.

- [ ] **Step 1: Write a test for the new branch (compile-time sentinel)**

In `crates/lenos-workflow/src/lib.rs`, inside any existing `#[cfg(test)]` block or add one:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approval_context_carries_required_fields() {
        use crate::executor::ApprovalContext;
        let ctx = ApprovalContext {
            step_id: "step-1".into(),
            approver_spec: "@manager".into(),
            expires_at: chrono::Utc::now(),
        };
        assert_eq!(ctx.step_id, "step-1");
        assert_eq!(ctx.approver_spec, "@manager");
    }
}
```

- [ ] **Step 2: Run test**

```
cargo test -p lenos-workflow -- approval_context_carries_required_fields
```

Expected: PASS.

- [ ] **Step 3: Replace the `approval_token.is_some()` branch in `finalize_run`**

In `crates/lenos-workflow/src/lib.rs` (around line 229), replace:

```rust
                if result.approval_token.is_some() {
                    // Approval gates are not yet implemented (WF-08).
                    // Fail explicitly rather than creating unreachable WaitingApproval rows.
                    tracing::warn!(
                        run_id = %run_id,
                        step_index = result.step_index,
                        "Workflow hit approval gate — not yet implemented, marking as failed"
                    );
                    if let Err(e) = self
                        .db
                        .update_workflow_run(
                            community_id,
                            run_id,
                            RunStatus::Failed,
                            step_count,
                            &trace_json,
                            Some("approval gates not yet implemented — see WF-08"),
                        )
                        .await
                    {
                        tracing::error!(
                            run_id = %run_id,
                            "Failed to update run to Failed (approval gate): {e}"
                        );
                    }
```

with:

```rust
                if let (Some(token), Some(ctx)) =
                    (result.approval_token, result.approval_context)
                {
                    tracing::info!(
                        run_id = %run_id,
                        step_index = result.step_index,
                        step_id = %ctx.step_id,
                        "Workflow suspended at approval gate"
                    );

                    // Look up the workflow_id from the run so we can pass it
                    // to create_approval.
                    let wf_run = match self.db.get_workflow_run(community_id, run_id).await {
                        Ok(r) => r,
                        Err(e) => {
                            tracing::error!(run_id = %run_id, "finalize_run: get_workflow_run failed: {e}");
                            return;
                        }
                    };

                    // Persist the approval record.
                    if let Err(e) = self
                        .db
                        .create_approval(lenos_db::workflow::CreateApprovalParams {
                            community_id,
                            token: &token,
                            workflow_id: wf_run.workflow_id,
                            run_id,
                            step_id: &ctx.step_id,
                            step_index: step_count,
                            approver_spec: &ctx.approver_spec,
                            expires_at: ctx.expires_at,
                        })
                        .await
                    {
                        tracing::error!(run_id = %run_id, "finalize_run: create_approval failed: {e}");
                        // Still mark as WaitingApproval — the token is in memory and
                        // the run must not be left in Running state on shutdown.
                    }

                    // Mark run as waiting.
                    if let Err(e) = self
                        .db
                        .update_workflow_run(
                            community_id,
                            run_id,
                            RunStatus::WaitingApproval,
                            step_count,
                            &trace_json,
                            None,
                        )
                        .await
                    {
                        tracing::error!(
                            run_id = %run_id,
                            "finalize_run: failed to set WaitingApproval: {e}"
                        );
                    }
```

Also update the closing `else` block to not reference the now-consumed `result.approval_token`:

The old code was:
```rust
                } else {
                    tracing::info!(run_id = %run_id, "Workflow run completed");
                    if let Err(e) = self
                        .db
                        .update_workflow_run(
                            community_id,
                            run_id,
                            RunStatus::Completed,
```

This should still work because the `if let (Some(token), Some(ctx))` pattern binds to the fields, not consuming `result` itself. Verify that the `else` branch compiles correctly — `result` fields other than `approval_token`/`approval_context` are used in `step_count` and `trace_json` which are already computed above the branch.

- [ ] **Step 4: Run tests**

```
cargo test -p lenos-workflow
```

Expected: all pass.

- [ ] **Step 5: cargo fmt + clippy**

```
cargo fmt --all
cargo clippy --all-targets -- -D warnings
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add crates/lenos-workflow/src/lib.rs
git commit -m "feat(workflow): persist approval record and set WaitingApproval status (WF-08)"
```

---

### Task 4: Manual end-to-end smoke test

The grant/deny handlers (`handle_approval_grant` / `handle_approval_deny`) in `crates/lenos-relay/src/handlers/command_executor.rs` are already implemented and use `resume_workflow_after_approval`. This task verifies the full path works.

- [ ] **Step 1: Create a test workflow YAML with a `request_approval` step**

```yaml
name: test-approval
trigger:
  type: message
  channel: <your-test-channel-uuid>
  filter: "test approval"
steps:
  - id: ask
    action: request_approval
    from: "@you"
    message: "Please approve this test"
    timeout: 1h
  - id: confirm
    action: send_message
    text: "Approved! Continuing."
```

- [ ] **Step 2: Start the relay locally**

```
cargo run -p lenos-relay
```

- [ ] **Step 3: Trigger the workflow**

Send a message containing "test approval" to the trigger channel.

Expected: workflow run status changes to `waiting_approval` in the DB.

```sql
SELECT id, status, current_step FROM workflow_runs ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 4: Grant the approval**

Send a kind:46011 event with the token hash. The token hash can be retrieved from:

```sql
SELECT encode(token, 'hex') AS token_hash, expires_at FROM workflow_approvals ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 5: Verify resumption**

Expected: workflow continues and sends the "Approved! Continuing." message to the channel.

```sql
SELECT status FROM workflow_runs ORDER BY created_at DESC LIMIT 1;
-- Expected: completed
```
