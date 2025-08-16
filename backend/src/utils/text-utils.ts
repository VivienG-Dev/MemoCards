export function cleanOcr(raw: string) {
  return (
    raw
      // Remove isolated page numbers
      .replace(/\n\s*\d+\s*\n/g, "\n")
      // Fix hyphens "bio-\nchimie" -> "biochimie"
      .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
      // Normalize bullet points
      .replace(/\n\s\*[-•]\s+/g, "\n- ")
      // Compact
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// Try to cut cleanly on double line breaks, otherwise at end of sentence
export function chunkText(text: string, size = 1800, overlap = 200) {
  const chunks: string[] = [];
  let i = 0;

  while (i < text.length) {
    let end = Math.min(i + size, text.length);

    // Priority: end of paragraph
    let snap = text.lastIndexOf("\n\n", end);
    if (snap <= i + 400) {
      // Otherwise: end of nearby sentence
      const dot = text.lastIndexOf(". ", end);
      if (dot > i + 400) snap = dot + 1;
    }

    if (snap > i) end = snap;
    chunks.push(text.slice(i, end).trim());
    i = Math.max(end - overlap, i + size);
  }

  return chunks.filter(Boolean);
}

export function hashQuestion(q: string) {
  return q.toLowerCase().replace(/\W+/g, "").slice(0, 120);
}