//! Recursive character text splitter.
//!
//! Splits on `\n\n`, `\n`, `. `, ` ` in order until each chunk is ≤ 512 tokens.
//! Token estimate: `text.len() / 4` (good enough for chunking).

const MAX_TOKENS: usize = 512;
const OVERLAP_TOKENS: usize = 50;

fn token_count(s: &str) -> usize {
    s.len() / 4
}

/// Split `text` into chunks of ≤ 512 tokens with 50-token overlap.
/// Never returns empty chunks.
pub fn split(text: &str) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return vec![];
    }
    if token_count(text) <= MAX_TOKENS {
        return vec![text.to_owned()];
    }

    let separators = ["\n\n", "\n", ". ", " "];
    let mut base = Vec::new();
    split_recursive(text, &separators, &mut base);

    if base.len() <= 1 {
        return base;
    }

    // Apply overlap: prepend tail of previous chunk to each subsequent chunk.
    let overlap_chars = OVERLAP_TOKENS * 4;
    let mut overlapped = Vec::with_capacity(base.len());
    overlapped.push(base[0].clone());
    for i in 1..base.len() {
        let prev = &base[i - 1];
        let prefix: String = if prev.len() > overlap_chars {
            prev[prev.len() - overlap_chars..].to_owned()
        } else {
            prev.clone()
        };
        let chunk = format!("{prefix} {}", base[i]);
        let trimmed = chunk.trim().to_owned();
        if !trimmed.is_empty() {
            overlapped.push(trimmed);
        }
    }
    overlapped
}

fn split_recursive(text: &str, separators: &[&str], out: &mut Vec<String>) {
    if token_count(text) <= MAX_TOKENS {
        let trimmed = text.trim().to_owned();
        if !trimmed.is_empty() {
            out.push(trimmed);
        }
        return;
    }

    // Try each separator level in order.
    for (i, sep) in separators.iter().enumerate() {
        let parts: Vec<&str> = text.split(sep).filter(|p| !p.trim().is_empty()).collect();
        if parts.len() < 2 {
            continue; // separator not present
        }

        // Merge adjacent parts greedily until we'd exceed MAX_TOKENS, then
        // recurse on anything still too large with remaining separators.
        let remaining_seps = if i + 1 < separators.len() {
            &separators[i + 1..]
        } else {
            separators
        };
        let mut current = String::new();
        for part in parts {
            let candidate = if current.is_empty() {
                part.to_owned()
            } else {
                format!("{current}{sep}{part}")
            };
            if token_count(&candidate) <= MAX_TOKENS {
                current = candidate;
            } else {
                // Flush current (if non-empty) and process 'part' recursively.
                if !current.trim().is_empty() {
                    let trimmed = current.trim().to_owned();
                    if token_count(&trimmed) <= MAX_TOKENS {
                        out.push(trimmed);
                    } else {
                        split_recursive(&trimmed, remaining_seps, out);
                    }
                }
                // Start fresh with 'part'
                let part_trimmed = part.trim().to_owned();
                if token_count(&part_trimmed) <= MAX_TOKENS {
                    current = part_trimmed;
                } else {
                    split_recursive(&part_trimmed, remaining_seps, out);
                    current = String::new();
                }
            }
        }
        if !current.trim().is_empty() {
            let trimmed = current.trim().to_owned();
            if token_count(&trimmed) <= MAX_TOKENS {
                out.push(trimmed);
            } else {
                split_recursive(&trimmed, remaining_seps, out);
            }
        }
        return;
    }

    // No separator found; hard-split at MAX_TOKENS.
    let max_chars = MAX_TOKENS * 4;
    let mut pos = 0;
    while pos < text.len() {
        let end = (pos + max_chars).min(text.len());
        let end = text.floor_char_boundary(end);
        let chunk = text[pos..end].trim().to_owned();
        if !chunk.is_empty() {
            out.push(chunk);
        }
        pos = end;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_empty() {
        assert!(split("").is_empty());
        assert!(split("   ").is_empty());
    }

    #[test]
    fn short_text_single_chunk() {
        let text = "Hello world.";
        let chunks = split(text);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Hello world.");
    }

    #[test]
    fn chunks_not_empty() {
        let big = "word ".repeat(1000);
        let chunks = split(&big);
        assert!(!chunks.is_empty());
        for chunk in &chunks {
            assert!(!chunk.is_empty(), "got empty chunk");
        }
    }

    #[test]
    fn chunks_within_token_limit_before_overlap() {
        let big = "abcd ".repeat(600); // 600 * 5 = 3000 chars, ~750 tokens
        let chunks = split(&big);
        for chunk in &chunks {
            assert!(
                token_count(chunk) < MAX_TOKENS + OVERLAP_TOKENS + 10,
                "chunk too large: {} tokens",
                token_count(chunk)
            );
        }
    }

    #[test]
    fn one_page_pdf_produces_few_chunks() {
        // ~500 words ≈ 2530 chars ≈ 632 tokens → expect ≤3 chunks after overlap
        let text = "The quick brown fox jumps over the lazy dog. ".repeat(55);
        let chunks = split(&text);
        assert!(
            chunks.len() <= 3,
            "1-page PDF should produce ≤3 chunks, got {}",
            chunks.len()
        );
    }
}
