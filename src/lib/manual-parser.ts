/**
 * Production-grade document parser for product manuals.
 *
 * Extracts text preserving page numbers, headings, warnings, and
 * figure captions. Splits content into overlapping chunks suitable
 * for embedding and RAG retrieval while respecting semantic boundaries
 * (never splits inside numbered steps or warning blocks).
 */

import type { ParsedChunk, ParsedDocument } from "@/types";

// ─── Configuration ──────────────────────────────────────────────────────────

const MIN_CHUNK_TOKENS = 200;
const MAX_CHUNK_TOKENS = 500;
const TARGET_CHUNK_TOKENS = 350;
const OVERLAP_TOKENS = 75;
const CHARS_PER_TOKEN = 4;

// ─── Content Type Detection Patterns ────────────────────────────────────────

const PROCEDURE_PATTERNS = [
  /^\s*\d+\.\s+/m, // numbered steps
  /^\s*step\s+\d+/im, // "Step 1", "Step 2"
  /\bhow\s+to\b/i,
  /\binstruct(?:ion|ions)\b/i,
  /\bprocedure\b/i,
  /^\s*[-*]\s+.*(?:install|remove|replace|connect|disconnect|adjust|tighten|loosen)/im,
  /\bfollow\s+these\s+steps\b/i,
  /\bperform\s+the\s+following\b/i,
];

const WARNING_PATTERNS = [
  /\b(?:WARNING|CAUTION|DANGER|NOTICE)\b/,
  /\b(?:warning|caution|danger)\s*[:\-!]/i,
  /\bdo\s+not\b.*\b(?:risk|hazard|injur|shock|fire|burn|death)\b/i,
  /\b(?:risk\s+of|may\s+cause)\s+(?:electric|shock|fire|injury|death|burn)\b/i,
  /\bsafety\s+(?:precaution|warning|notice|information)\b/i,
];

const SPECS_PATTERNS = [
  /\bspecification(?:s)?\b/i,
  /\bdimension(?:s)?\b/i,
  /\brating(?:s)?\b/i,
  /\b(?:weight|height|width|length|depth|voltage|wattage|amperage|capacity)\s*[:=]/i,
  /\b\d+\s*(?:mm|cm|m|in|ft|kg|lb|oz|V|W|A|Hz|RPM|dB|BTU|psi|kPa)\b/,
  /\btechnical\s+data\b/i,
  /\bmodel\s+(?:number|no\.?|#)\b/i,
];

const TROUBLESHOOTING_PATTERNS = [
  /\btroubleshooting\b/i,
  /\bproblem\s*[:\-\/]?\s*solution\b/i,
  /\berror\s+code\b/i,
  /\bif\s+.*(?:does\s+not|doesn't|won't|fails?\s+to|is\s+not)\b/i,
  /\b(?:symptom|cause|remedy|fix)\b/i,
  /\b(?:blinking|flashing)\s+(?:light|LED|indicator)\b/i,
  /\b(?:E|ERR|ERROR)\s*[-:]?\s*\d+/i,
];

const FIGURE_PATTERN = /^(?:Figure|Fig\.?)\s+\d+[.:]\s*.+$/im;

// ─── Heading Detection ──────────────────────────────────────────────────────

interface HeadingMatch {
  level: number; // 1, 2, or 3
  text: string;
  index: number;
  length: number;
}

/**
 * Detect headings in plain text. Supports:
 * - Markdown headings: # H1, ## H2, ### H3
 * - ALL-CAPS lines (H1 if preceded by blank line or at start)
 * - Numbered section headings: "1. Introduction", "2.3 Safety"
 * - Underline-style: lines followed by ===== or -----
 */
function detectHeadings(text: string): HeadingMatch[] {
  const headings: HeadingMatch[] = [];
  const lines = text.split("\n");
  let charIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Markdown-style headings
    const mdMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (mdMatch) {
      headings.push({
        level: mdMatch[1].length,
        text: mdMatch[2].trim(),
        index: charIndex,
        length: line.length,
      });
      charIndex += line.length + 1;
      continue;
    }

    // Underline-style heading (next line is ===== or -----)
    if (i + 1 < lines.length && trimmed.length > 2) {
      const nextTrimmed = lines[i + 1].trim();
      if (/^={3,}$/.test(nextTrimmed)) {
        headings.push({
          level: 1,
          text: trimmed,
          index: charIndex,
          length: line.length,
        });
        charIndex += line.length + 1;
        continue;
      }
      if (/^-{3,}$/.test(nextTrimmed)) {
        headings.push({
          level: 2,
          text: trimmed,
          index: charIndex,
          length: line.length,
        });
        charIndex += line.length + 1;
        continue;
      }
    }

    // ALL-CAPS lines as H1 (at least 4 chars, mostly uppercase letters)
    if (
      trimmed.length >= 4 &&
      trimmed.length < 80 &&
      /^[A-Z][A-Z\s\-&/,.:0-9]+$/.test(trimmed) &&
      trimmed.replace(/[^A-Z]/g, "").length >= trimmed.length * 0.5
    ) {
      const prevLine = i > 0 ? lines[i - 1].trim() : "";
      if (prevLine === "" || i === 0) {
        headings.push({
          level: 1,
          text: titleCase(trimmed),
          index: charIndex,
          length: line.length,
        });
        charIndex += line.length + 1;
        continue;
      }
    }

    // Numbered section headings: "1. Introduction", "2.3 Safety Precautions"
    const numMatch = trimmed.match(/^(\d+(?:\.\d+)?(?:\.\d+)?)\s+([A-Z].{2,})$/);
    if (numMatch && trimmed.length < 80) {
      const depth = numMatch[1].split(".").length;
      headings.push({
        level: Math.min(depth, 3),
        text: numMatch[2].trim(),
        index: charIndex,
        length: line.length,
      });
      charIndex += line.length + 1;
      continue;
    }

    charIndex += line.length + 1;
  }

  return headings;
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ─── Page Number Detection ──────────────────────────────────────────────────

interface PageBreak {
  pageNumber: number;
  charIndex: number;
}

/**
 * Detect page boundaries from form feeds (\f) or "Page X" / "- X -" patterns.
 */
function detectPageBreaks(text: string): PageBreak[] {
  const breaks: PageBreak[] = [];
  let pageNumber = 1;

  // Detect form feed characters
  let idx = 0;
  while ((idx = text.indexOf("\f", idx)) !== -1) {
    pageNumber++;
    breaks.push({ pageNumber, charIndex: idx });
    idx++;
  }

  if (breaks.length > 0) return breaks;

  // Fallback: detect "Page X" or "- X -" patterns
  const pagePatterns = [
    /^[\s]*page\s+(\d+)\s*$/gim,
    /^[\s]*-\s*(\d+)\s*-\s*$/gm,
    /^\s*(\d+)\s*$/gm, // bare page numbers on their own line (less reliable)
  ];

  for (const pattern of pagePatterns) {
    let match: RegExpExecArray | null;
    const localBreaks: PageBreak[] = [];

    while ((match = pattern.exec(text)) !== null) {
      const pn = parseInt(match[1], 10);
      if (pn > 0 && pn < 10000) {
        localBreaks.push({ pageNumber: pn, charIndex: match.index });
      }
    }

    // Only use bare number pattern if they form a plausible sequence
    if (pattern === pagePatterns[2]) {
      const sorted = localBreaks.sort((a, b) => a.charIndex - b.charIndex);
      let isSequential = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].pageNumber <= sorted[i - 1].pageNumber) {
          isSequential = false;
          break;
        }
      }
      if (!isSequential || sorted.length < 3) continue;
    }

    if (localBreaks.length > 0) {
      return localBreaks.sort((a, b) => a.charIndex - b.charIndex);
    }
  }

  return breaks;
}

/**
 * Get the page number for a given character index.
 */
function getPageForIndex(charIndex: number, pageBreaks: PageBreak[]): number {
  if (pageBreaks.length === 0) return 1;
  let page = 1;
  for (const pb of pageBreaks) {
    if (charIndex >= pb.charIndex) {
      page = pb.pageNumber;
    } else {
      break;
    }
  }
  return page;
}

// ─── Section Path Builder ───────────────────────────────────────────────────

/**
 * Maintains a heading stack to produce breadcrumb paths like
 * "Safety/Electrical/Grounding".
 */
class SectionPathBuilder {
  private stack: { level: number; text: string }[] = [];

  push(level: number, text: string): void {
    // Remove headings at same or deeper level
    while (this.stack.length > 0 && this.stack[this.stack.length - 1].level >= level) {
      this.stack.pop();
    }
    this.stack.push({ level, text });
  }

  getPath(): string {
    if (this.stack.length === 0) return "";
    return this.stack.map((s) => s.text).join("/");
  }
}

// ─── Content Classification ─────────────────────────────────────────────────

type ContentType = ParsedChunk["contentType"];

function classifyContent(text: string): ContentType {
  // Score each type
  const scores: Record<ContentType, number> = {
    PROCEDURE: 0,
    WARNING: 0,
    SPECS: 0,
    TROUBLESHOOTING: 0,
    GENERAL: 0,
  };

  for (const p of WARNING_PATTERNS) {
    if (p.test(text)) scores.WARNING += 3;
  }
  for (const p of PROCEDURE_PATTERNS) {
    if (p.test(text)) scores.PROCEDURE += 2;
  }
  for (const p of TROUBLESHOOTING_PATTERNS) {
    if (p.test(text)) scores.TROUBLESHOOTING += 2;
  }
  for (const p of SPECS_PATTERNS) {
    if (p.test(text)) scores.SPECS += 2;
  }

  // WARNING takes priority due to safety importance
  if (scores.WARNING >= 3) return "WARNING";

  const best = (Object.entries(scores) as [ContentType, number][])
    .filter(([type]) => type !== "GENERAL")
    .sort((a, b) => b[1] - a[1])[0];

  if (best && best[1] > 0) return best[0];
  return "GENERAL";
}

// ─── Token Estimation ───────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function tokensToChars(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

// ─── Block Segmentation ────────────────────────────────────────────────────

interface TextBlock {
  content: string;
  startIndex: number; // char index in original text
  endIndex: number;
  type: "paragraph" | "numbered_steps" | "warning_block" | "list" | "heading";
  headingLevel?: number;
  headingText?: string;
}

/**
 * Split text into semantic blocks (paragraphs, numbered step sequences,
 * warning blocks, lists). These blocks are the atomic units that won't
 * be split across chunks.
 */
function segmentIntoBlocks(text: string, headings: HeadingMatch[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  const lines = text.split("\n");
  const headingIndices = new Set(headings.map((h) => h.index));

  let charIndex = 0;
  let currentBlock: string[] = [];
  let blockStart = 0;
  let blockType: TextBlock["type"] = "paragraph";
  let inNumberedSequence = false;
  let inWarningBlock = false;

  function flushBlock() {
    const content = currentBlock.join("\n").trim();
    if (content.length > 0) {
      blocks.push({
        content,
        startIndex: blockStart,
        endIndex: charIndex,
        type: blockType,
      });
    }
    currentBlock = [];
    blockStart = charIndex;
    blockType = "paragraph";
    inNumberedSequence = false;
    inWarningBlock = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line starts a heading
    const isHeadingLine = headingIndices.has(charIndex);
    if (isHeadingLine) {
      flushBlock();
      const heading = headings.find((h) => h.index === charIndex);
      if (heading) {
        blocks.push({
          content: trimmed,
          startIndex: charIndex,
          endIndex: charIndex + line.length,
          type: "heading",
          headingLevel: heading.level,
          headingText: heading.text,
        });
      }
      charIndex += line.length + 1;
      blockStart = charIndex;
      continue;
    }

    // Detect warning block start
    if (!inWarningBlock && /\b(?:WARNING|CAUTION|DANGER|NOTICE)\b/.test(trimmed)) {
      if (currentBlock.length > 0 && !inNumberedSequence) {
        flushBlock();
      }
      inWarningBlock = true;
      blockType = "warning_block";
      if (currentBlock.length === 0) blockStart = charIndex;
      currentBlock.push(line);
      charIndex += line.length + 1;
      continue;
    }

    // Inside warning block: continue until blank line
    if (inWarningBlock) {
      if (trimmed === "") {
        flushBlock();
      } else {
        currentBlock.push(line);
      }
      charIndex += line.length + 1;
      continue;
    }

    // Detect numbered step
    const isNumberedStep = /^\s*\d+[.)]\s+/.test(trimmed) || /^\s*step\s+\d+/i.test(trimmed);
    if (isNumberedStep) {
      if (!inNumberedSequence && currentBlock.length > 0) {
        flushBlock();
      }
      inNumberedSequence = true;
      blockType = "numbered_steps";
      if (currentBlock.length === 0) blockStart = charIndex;
      currentBlock.push(line);
      charIndex += line.length + 1;
      continue;
    }

    // Continuation of numbered sequence (indented line or sub-bullet)
    if (inNumberedSequence && trimmed !== "" && (/^\s{2,}/.test(line) || /^\s*[-*]\s/.test(trimmed))) {
      currentBlock.push(line);
      charIndex += line.length + 1;
      continue;
    }

    // End of numbered sequence
    if (inNumberedSequence && (trimmed === "" || !isNumberedStep)) {
      flushBlock();
      if (trimmed !== "") {
        blockStart = charIndex;
        currentBlock.push(line);
      }
      charIndex += line.length + 1;
      continue;
    }

    // Bullet/list detection
    if (/^\s*[-*+]\s/.test(trimmed)) {
      if (blockType !== "list" && currentBlock.length > 0) {
        flushBlock();
      }
      blockType = "list";
      if (currentBlock.length === 0) blockStart = charIndex;
      currentBlock.push(line);
      charIndex += line.length + 1;
      continue;
    }

    // Blank line: flush current block
    if (trimmed === "") {
      if (currentBlock.length > 0) {
        flushBlock();
      }
      charIndex += line.length + 1;
      blockStart = charIndex;
      continue;
    }

    // Regular paragraph text
    if (blockType === "list" && !/^\s*[-*+]\s/.test(trimmed)) {
      flushBlock();
    }
    if (currentBlock.length === 0) blockStart = charIndex;
    blockType = blockType === "list" ? "list" : "paragraph";
    currentBlock.push(line);
    charIndex += line.length + 1;
  }

  // Flush remaining
  if (currentBlock.length > 0) {
    flushBlock();
  }

  return blocks;
}

// ─── Chunking Engine ────────────────────────────────────────────────────────

interface ChunkCandidate {
  blocks: TextBlock[];
  startCharIndex: number;
  endCharIndex: number;
}

/**
 * Groups blocks into chunks respecting token limits and semantic boundaries.
 * Never splits inside numbered_steps or warning_block blocks.
 */
function buildChunks(blocks: TextBlock[]): ChunkCandidate[] {
  const chunks: ChunkCandidate[] = [];
  const nonHeadingBlocks = blocks.filter((b) => b.type !== "heading");

  if (nonHeadingBlocks.length === 0) return [];

  let currentChunk: TextBlock[] = [];
  let currentTokens = 0;

  function flushChunk() {
    if (currentChunk.length === 0) return;
    chunks.push({
      blocks: [...currentChunk],
      startCharIndex: currentChunk[0].startIndex,
      endCharIndex: currentChunk[currentChunk.length - 1].endIndex,
    });
    currentChunk = [];
    currentTokens = 0;
  }

  for (const block of nonHeadingBlocks) {
    const blockTokens = estimateTokens(block.content);

    // If single block exceeds max, it becomes its own chunk (don't split atomic blocks)
    if (blockTokens > tokensToChars(MAX_CHUNK_TOKENS) / CHARS_PER_TOKEN) {
      flushChunk();

      // For very large atomic blocks (step sequences, warnings), keep them whole
      if (block.type === "numbered_steps" || block.type === "warning_block") {
        chunks.push({
          blocks: [block],
          startCharIndex: block.startIndex,
          endCharIndex: block.endIndex,
        });
        continue;
      }

      // For oversized paragraphs, split at sentence boundaries
      const subChunks = splitLargeBlock(block);
      for (const sub of subChunks) {
        chunks.push({
          blocks: [sub],
          startCharIndex: sub.startIndex,
          endCharIndex: sub.endIndex,
        });
      }
      continue;
    }

    // Would adding this block exceed target?
    if (currentTokens + blockTokens > MAX_CHUNK_TOKENS && currentChunk.length > 0) {
      flushChunk();
    }

    currentChunk.push(block);
    currentTokens += blockTokens;

    // If we've reached a good size, flush
    if (currentTokens >= TARGET_CHUNK_TOKENS) {
      flushChunk();
    }
  }

  flushChunk();
  return chunks;
}

/**
 * Split a large paragraph block at sentence boundaries.
 */
function splitLargeBlock(block: TextBlock): TextBlock[] {
  const text = block.content;
  const maxChars = tokensToChars(MAX_CHUNK_TOKENS);
  const results: TextBlock[] = [];

  // Split by sentences
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  let current = "";
  let startOffset = 0;

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      results.push({
        content: current.trim(),
        startIndex: block.startIndex + startOffset,
        endIndex: block.startIndex + startOffset + current.length,
        type: "paragraph",
      });
      startOffset += current.length;
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim().length > 0) {
    results.push({
      content: current.trim(),
      startIndex: block.startIndex + startOffset,
      endIndex: block.endIndex,
      type: "paragraph",
    });
  }

  return results;
}

/**
 * Add overlap between consecutive chunks by prepending context from the
 * previous chunk's tail.
 */
function addOverlap(chunks: ChunkCandidate[], fullText: string): string[] {
  if (chunks.length === 0) return [];

  const overlapChars = tokensToChars(OVERLAP_TOKENS);
  const result: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i].blocks.map((b) => b.content).join("\n\n");

    if (i === 0) {
      result.push(chunkText);
      continue;
    }

    // Get overlap from the end of the previous chunk
    const prevText = result[i - 1];
    const overlapText = prevText.slice(-overlapChars);

    // Find a clean break point in the overlap (sentence or paragraph boundary)
    const breakIdx = overlapText.indexOf(". ");
    const cleanOverlap = breakIdx > 0 ? overlapText.slice(breakIdx + 2) : overlapText;

    if (cleanOverlap.trim().length > 20) {
      result.push("..." + cleanOverlap.trim() + "\n\n" + chunkText);
    } else {
      result.push(chunkText);
    }
  }

  return result;
}

// ─── Figure Caption Extraction ──────────────────────────────────────────────

function extractFigureCaptions(text: string): string[] {
  const captions: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (FIGURE_PATTERN.test(trimmed)) {
      captions.push(trimmed);
    }
  }

  return captions;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Parse a raw document text into structured chunks suitable for RAG retrieval.
 *
 * @param rawText - The full text content of the document
 * @param title - The document title
 * @returns ParsedDocument with classified, overlapping chunks
 */
export function parseDocument(rawText: string, title: string): ParsedDocument {
  if (!rawText || rawText.trim().length === 0) {
    return {
      title,
      chunks: [],
      totalPages: 1,
      figureCaptions: [],
      metadata: {
        pageCount: 1,
        language: "en",
        extractedAt: new Date().toISOString(),
      },
    };
  }

  // 1. Detect page breaks
  const pageBreaks = detectPageBreaks(rawText);
  const totalPages = pageBreaks.length > 0
    ? Math.max(...pageBreaks.map((pb) => pb.pageNumber))
    : 1;

  // 2. Detect headings
  const headings = detectHeadings(rawText);

  // 3. Extract figure captions
  const figureCaptions = extractFigureCaptions(rawText);

  // 4. Segment into semantic blocks
  const blocks = segmentIntoBlocks(rawText, headings);

  // 5. Build section path tracker
  const sectionBuilder = new SectionPathBuilder();
  const blockSectionPaths = new Map<number, string>();

  // Assign section paths to blocks based on preceding headings
  let headingIdx = 0;
  for (const block of blocks) {
    // Process all headings that come before this block
    while (headingIdx < headings.length && headings[headingIdx].index <= block.startIndex) {
      sectionBuilder.push(headings[headingIdx].level, headings[headingIdx].text);
      headingIdx++;
    }
    blockSectionPaths.set(block.startIndex, sectionBuilder.getPath());
  }

  // 6. Group blocks into chunks
  const chunkCandidates = buildChunks(blocks);

  // 7. Add overlap
  const chunkTexts = addOverlap(chunkCandidates, rawText);

  // 8. Build final ParsedChunk array
  const parsedChunks: ParsedChunk[] = [];

  for (let i = 0; i < chunkCandidates.length; i++) {
    const candidate = chunkCandidates[i];
    const text = chunkTexts[i];

    // Page range
    const pageStart = getPageForIndex(candidate.startCharIndex, pageBreaks);
    const pageEnd = getPageForIndex(candidate.endCharIndex, pageBreaks);

    // Section path from the first block in this chunk
    const sectionPath = blockSectionPaths.get(candidate.blocks[0].startIndex) || "";

    // Classify content
    const contentType = classifyContent(text);

    // Token count
    const tokenCount = estimateTokens(text);

    // Skip very small chunks (less than a sentence)
    if (text.trim().length < 20) continue;

    parsedChunks.push({
      content: text,
      pageStart,
      pageEnd,
      sectionPath,
      contentType,
      tokenCount,
    });
  }

  // Merge any undersized chunks with neighbors
  const mergedChunks = mergeUndersizedChunks(parsedChunks);

  return {
    title,
    chunks: mergedChunks,
    totalPages,
    figureCaptions,
    metadata: {
      pageCount: totalPages,
      language: "en",
      extractedAt: new Date().toISOString(),
    },
  };
}

/**
 * Merge chunks that are below the minimum token count with their neighbors.
 */
function mergeUndersizedChunks(chunks: ParsedChunk[]): ParsedChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: ParsedChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.tokenCount < MIN_CHUNK_TOKENS && result.length > 0) {
      // Merge with previous chunk
      const prev = result[result.length - 1];
      const mergedContent = prev.content + "\n\n" + chunk.content;
      const mergedTokens = estimateTokens(mergedContent);

      // Only merge if the result won't be too large
      if (mergedTokens <= MAX_CHUNK_TOKENS * 1.5) {
        result[result.length - 1] = {
          content: mergedContent,
          pageStart: prev.pageStart,
          pageEnd: chunk.pageEnd,
          sectionPath: prev.sectionPath || chunk.sectionPath,
          contentType: prioritizeContentType(prev.contentType, chunk.contentType),
          tokenCount: mergedTokens,
        };
        continue;
      }
    }

    result.push({ ...chunk });
  }

  return result;
}

/**
 * When merging chunks, WARNING takes priority, then PROCEDURE, etc.
 */
function prioritizeContentType(
  a: ParsedChunk["contentType"],
  b: ParsedChunk["contentType"]
): ParsedChunk["contentType"] {
  const priority: ParsedChunk["contentType"][] = [
    "WARNING",
    "PROCEDURE",
    "TROUBLESHOOTING",
    "SPECS",
    "GENERAL",
  ];
  const aIdx = priority.indexOf(a);
  const bIdx = priority.indexOf(b);
  return aIdx <= bIdx ? a : b;
}

// Re-export types for backward compatibility
export type { ParsedChunk, ParsedDocument };
