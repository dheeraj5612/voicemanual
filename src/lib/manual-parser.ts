/**
 * Manual parsing and chunking for RAG retrieval.
 *
 * Takes raw manual text and splits it into overlapping chunks
 * suitable for embedding and semantic search. Uses heading-aware
 * splitting to preserve section context.
 */

export interface ParsedChunk {
  content: string;
  section?: string;
  pageNum?: number;
}

const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 100; // overlap between consecutive chunks

export function parseManualText(
  rawText: string,
  options?: { chunkSize?: number; overlap?: number }
): ParsedChunk[] {
  const chunkSize = options?.chunkSize ?? CHUNK_SIZE;
  const overlap = options?.overlap ?? CHUNK_OVERLAP;

  const sections = splitBySections(rawText);
  const chunks: ParsedChunk[] = [];

  for (const section of sections) {
    const sectionChunks = chunkText(section.content, chunkSize, overlap);

    for (const chunkContent of sectionChunks) {
      chunks.push({
        content: chunkContent.trim(),
        section: section.heading || undefined,
      });
    }
  }

  return chunks.filter((c) => c.content.length > 20);
}

interface Section {
  heading: string | null;
  content: string;
}

function splitBySections(text: string): Section[] {
  const headingPattern = /^(?:#{1,3}\s+.+|[A-Z][A-Z\s]{4,}$|\d+\.\s+.+)/gm;
  const sections: Section[] = [];
  let lastIndex = 0;
  let lastHeading: string | null = null;

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      sections.push({
        heading: lastHeading,
        content: text.slice(lastIndex, match.index),
      });
    }
    lastHeading = match[0].replace(/^#+\s*/, "").trim();
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    sections.push({
      heading: lastHeading,
      content: text.slice(lastIndex),
    });
  }

  if (sections.length === 0) {
    return [{ heading: null, content: text }];
  }

  return sections;
}

function chunkText(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    if (end < text.length) {
      const breakPoint = text.lastIndexOf(". ", end);
      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end));
    start = end - overlap;
  }

  return chunks;
}
