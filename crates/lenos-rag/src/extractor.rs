//! Text extraction from supported document types.
//!
//! Supported MIME types: `text/plain`, `text/markdown`, `application/pdf`.

use crate::RagError;

/// Extract plain text from file bytes based on MIME type.
///
/// Returns `Err(RagError::UnsupportedMimeType)` for unrecognized types.
pub fn extract_text(bytes: &[u8], mime_type: &str) -> Result<String, RagError> {
    match mime_type {
        "text/plain" => {
            String::from_utf8(bytes.to_vec()).map_err(|e| {
                RagError::ExtractionFailed(format!("invalid UTF-8 in text file: {e}"))
            })
        }
        "text/markdown" => {
            let raw = String::from_utf8(bytes.to_vec()).map_err(|e| {
                RagError::ExtractionFailed(format!("invalid UTF-8 in markdown file: {e}"))
            })?;
            Ok(strip_markdown(&raw))
        }
        "application/pdf" => {
            pdf_extract::extract_text_from_mem(bytes).map_err(|e| {
                RagError::ExtractionFailed(format!("PDF text extraction failed: {e}"))
            })
        }
        other => Err(RagError::UnsupportedMimeType(other.to_owned())),
    }
}

/// Strip common Markdown syntax, returning plain readable text.
fn strip_markdown(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for line in input.lines() {
        // Strip heading markers
        let line = line.trim_start_matches('#').trim();
        // Strip inline code, bold, italic markers
        let line = line
            .replace("**", "")
            .replace("__", "")
            .replace('`', "")
            .replace('_', " ");
        out.push_str(&line);
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_text() {
        let bytes = b"Hello, world!";
        assert_eq!(extract_text(bytes, "text/plain").unwrap(), "Hello, world!");
    }

    #[test]
    fn strips_markdown_headings() {
        let md = "# Title\n\nSome **bold** and `code`.\n";
        let result = extract_text(md.as_bytes(), "text/markdown").unwrap();
        assert!(!result.contains("# Title"));
        assert!(!result.contains("**"));
        assert!(!result.contains('`'));
    }

    #[test]
    fn rejects_unsupported_mime() {
        let result = extract_text(b"data", "image/jpeg");
        assert!(matches!(result, Err(RagError::UnsupportedMimeType(_))));
    }
}
