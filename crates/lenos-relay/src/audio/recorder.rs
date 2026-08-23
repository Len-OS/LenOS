//! Huddle audio recording sink.
//!
//! Receives Opus frames from `Room::broadcast_frame` / `deliver_prefixed`
//! and writes them to a file in the LENOSOPU binary format:
//!
//! ```text
//! Header (10 bytes): b"LENOSOPU" + version u16 BE (0x0001)
//! Per-frame (13 + N bytes):
//!   [8 bytes] ms_since_epoch  u64 BE
//!   [1 byte]  peer_index
//!   [4 bytes] opus_len        u32 BE
//!   [N bytes] Opus payload
//! ```
//!
//! One file per huddle session. The file is complete when the sender
//! is dropped (room ends). Downstream tooling can convert to Ogg/WebM.

use bytes::Bytes;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, Notify};

const MAGIC: &[u8; 10] = b"LENOSOPU\x00\x01";

/// A single captured audio frame.
pub struct RecordedFrame {
    /// Sender's peer_index as assigned by the room.
    pub peer_index: u8,
    /// Wall-clock timestamp in milliseconds since UNIX epoch.
    pub timestamp_ms: u64,
    /// Raw Opus payload (no prefix).
    pub data: Bytes,
}

/// Recording capacity: 512 frames ≈ 10 s at 20 ms/frame.
/// `try_send` is used so the audio hot path is never blocked by a slow disk.
pub const RECORDING_CHANNEL_CAPACITY: usize = 512;

/// Handle to an active recording task.
///
/// Dropping this handle closes the mpsc sender; the background writer
/// flushes and closes the file when its receiver is drained, then
/// signals `closed`.
#[derive(Clone)]
pub struct RecordingHandle {
    pub tx: mpsc::Sender<RecordedFrame>,
    /// Path of the output file.
    pub path: PathBuf,
    /// Notified once when the background writer has flushed and closed the file.
    /// Waiters can `closed.notified().await` before reading or uploading the file.
    pub closed: Arc<Notify>,
}

impl RecordingHandle {
    /// Start a background writer task that writes frames to `path`.
    ///
    /// Creates parent directories if they do not exist.
    /// Returns an error immediately if the file cannot be created.
    /// Subsequent write errors are logged but do not surface to callers.
    pub async fn spawn(path: PathBuf) -> std::io::Result<Self> {
        // Ensure parent directory exists.
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        // Probe that the file is creatable before returning the handle.
        {
            let f = tokio::fs::File::create(&path).await?;
            drop(f);
        }
        let (tx, rx) = mpsc::channel(RECORDING_CHANNEL_CAPACITY);
        let closed = Arc::new(Notify::new());
        let closed_writer = Arc::clone(&closed);
        let spawn_path = path.clone();
        tokio::spawn(async move {
            if let Err(e) = run_writer(spawn_path.clone(), rx).await {
                tracing::error!(path = %spawn_path.display(), error = %e, "huddle recording write failed");
            }
            closed_writer.notify_one();
        });
        Ok(Self { tx, path, closed })
    }
}

async fn run_writer(path: PathBuf, mut rx: mpsc::Receiver<RecordedFrame>) -> std::io::Result<()> {
    let mut file = tokio::fs::File::create(&path).await?;
    file.write_all(MAGIC).await?;

    while let Some(frame) = rx.recv().await {
        let len = frame.data.len() as u32;
        let mut header = [0u8; 13];
        header[0..8].copy_from_slice(&frame.timestamp_ms.to_be_bytes());
        header[8] = frame.peer_index;
        header[9..13].copy_from_slice(&len.to_be_bytes());
        file.write_all(&header).await?;
        file.write_all(&frame.data).await?;
    }

    file.flush().await?;
    tracing::info!(path = %path.display(), "huddle recording closed");
    Ok(())
}
