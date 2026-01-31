/**
 * Hybrid retrieval service for RAG pipeline.
 *
 * Retrieves and ranks document chunks from the active KnowledgePackage
 * for a given SKU. Currently uses keyword-based scoring with TF-IDF-like
 * relevance. Designed for easy extension with vector similarity search.
 */

import { db } from "@/lib/db";
import type { KnowledgePackage } from "@prisma/client";
import type { RetrievalResult } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RetrieveChunksParams {
  skuId: string;
  query: string;
  topK?: number;
  filters?: {
    documentType?: string;
    contentType?: string;
    language?: string;
  };
}

// ─── Active Package Lookup ──────────────────────────────────────────────────

/**
 * Find the currently ACTIVE KnowledgePackage for a SKU.
 * Returns null if no active package exists.
 */
export async function getActivePackageForSku(
  skuId: string
): Promise<KnowledgePackage | null> {
  return db.knowledgePackage.findFirst({
    where: {
      skuId,
      status: "ACTIVE",
    },
  });
}

// ─── Keyword Scoring ────────────────────────────────────────────────────────

/**
 * Compute a keyword relevance score for a query against a chunk of content.
 *
 * Scoring approach (TF-IDF-like):
 * 1. Tokenize the query into individual terms
 * 2. Count occurrences of each query term in the content (term frequency)
 * 3. Normalize by content length to avoid bias toward longer chunks
 * 4. Apply a bonus multiplier for exact phrase matches
 *
 * @param query - The user's search query
 * @param content - The chunk content to score against
 * @returns A relevance score (higher is more relevant)
 */
export function keywordScore(query: string, content: string): number {
  if (!query.trim() || !content.trim()) return 0;

  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();

  // Tokenize query: split on whitespace and punctuation, filter stopwords
  const queryTerms = tokenize(queryLower);

  if (queryTerms.length === 0) return 0;

  // Count term frequency in content
  let totalHits = 0;
  const uniqueTermsMatched = new Set<string>();

  for (const term of queryTerms) {
    // Count occurrences of this term in the content
    const escapedTerm = escapeRegex(term);
    const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");
    const matches = contentLower.match(regex);
    const count = matches ? matches.length : 0;

    if (count > 0) {
      // Diminishing returns for repeated terms (log-based TF)
      totalHits += 1 + Math.log(count);
      uniqueTermsMatched.add(term);
    }
  }

  if (totalHits === 0) return 0;

  // Normalize by content length (in words) to avoid long-chunk bias
  const contentWordCount = contentLower.split(/\s+/).length;
  const normalizedScore = totalHits / Math.sqrt(contentWordCount);

  // Coverage bonus: reward matching more unique query terms
  const coverageRatio = uniqueTermsMatched.size / queryTerms.length;
  const coverageBonus = coverageRatio * 0.5;

  // Exact phrase match bonus
  let phraseBonus = 0;
  if (queryTerms.length > 1) {
    const phraseEscaped = escapeRegex(queryLower.trim());
    if (new RegExp(phraseEscaped, "i").test(contentLower)) {
      phraseBonus = 1.5;
    }
  }

  // Section path / heading bonus: if the content's first line looks like
  // a heading that matches query terms, boost further
  const firstLine = contentLower.split("\n")[0];
  let headingBonus = 0;
  for (const term of queryTerms) {
    if (firstLine.includes(term)) {
      headingBonus += 0.2;
    }
  }

  return normalizedScore + coverageBonus + phraseBonus + headingBonus;
}

// ─── Text Utilities ─────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "can", "could", "must", "and", "but", "or",
  "nor", "not", "so", "yet", "both", "either", "neither", "each",
  "every", "all", "any", "few", "more", "most", "other", "some",
  "such", "no", "only", "own", "same", "than", "too", "very",
  "just", "because", "as", "until", "while", "of", "at", "by",
  "for", "with", "about", "against", "between", "through", "during",
  "before", "after", "above", "below", "to", "from", "up", "down",
  "in", "out", "on", "off", "over", "under", "again", "further",
  "then", "once", "here", "there", "when", "where", "why", "how",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves", "he", "him",
  "his", "himself", "she", "her", "hers", "herself", "it", "its",
  "itself", "they", "them", "their", "theirs", "themselves",
]);

function tokenize(text: string): string[] {
  return text
    .split(/[\s\-_.,;:!?()[\]{}"'`/\\]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Main Retrieval Function ────────────────────────────────────────────────

/**
 * Retrieve the most relevant chunks for a query from the active
 * KnowledgePackage for a given SKU.
 *
 * Current implementation uses keyword matching with TF-IDF-like scoring.
 *
 * TODO (production): Add vector similarity search:
 * 1. Generate query embedding using the same model as chunk embeddings
 * 2. Use pgvector <=> operator for cosine distance
 * 3. Combine keyword score and vector similarity with weighted fusion:
 *    finalScore = alpha * vectorSimilarity + (1 - alpha) * keywordScore
 *    Recommended alpha: 0.7 (favor semantic similarity)
 * 4. Consider re-ranking with a cross-encoder for top candidates
 *
 * @param params - Query parameters including skuId, query text, and optional filters
 * @returns Ranked list of RetrievalResult objects
 */
export async function retrieveChunks(
  params: RetrieveChunksParams
): Promise<RetrievalResult[]> {
  const { skuId, query, topK = 5, filters } = params;

  // 1. Find the active knowledge package for this SKU
  const activePackage = await getActivePackageForSku(skuId);

  if (!activePackage) {
    return [];
  }

  // 2. Build the query to fetch chunks from all documents in this package
  // Build document-level where clause for filters
  const documentWhere: Record<string, unknown> = {
    knowledgePackageId: activePackage.id,
  };

  if (filters?.documentType) {
    documentWhere.type = filters.documentType;
  }

  // Fetch documents matching filters
  const documents = await db.document.findMany({
    where: documentWhere,
    select: {
      id: true,
      title: true,
      type: true,
    },
  });

  if (documents.length === 0) {
    return [];
  }

  const documentIds = documents.map((d) => d.id);
  const documentMap = new Map(documents.map((d) => [d.id, d]));

  // 3. Build chunk-level where clause
  const chunkWhere: Record<string, unknown> = {
    documentId: { in: documentIds },
  };

  if (filters?.contentType) {
    chunkWhere.contentType = filters.contentType;
  }

  // 4. Fetch all matching chunks
  const chunks = await db.chunk.findMany({
    where: chunkWhere,
    select: {
      id: true,
      documentId: true,
      content: true,
      pageStart: true,
      pageEnd: true,
      sectionPath: true,
      contentType: true,
      tokenCount: true,
      chunkIndex: true,
    },
  });

  if (chunks.length === 0) {
    return [];
  }

  // 5. Score each chunk against the query
  // TODO (production): Add vector similarity scoring here
  // const queryEmbedding = await generateEmbedding(query);
  // For each chunk, compute: vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding)
  // Then combine: finalScore = 0.7 * vectorScore + 0.3 * keywordScore

  const scoredResults: RetrievalResult[] = chunks.map((chunk) => {
    const doc = documentMap.get(chunk.documentId)!;
    const score = keywordScore(query, chunk.content);

    // Boost scores for certain content types based on query patterns
    let typeBoost = 0;
    const queryLower = query.toLowerCase();

    if (
      chunk.contentType === "WARNING" &&
      /\b(?:safe|safety|warning|caution|danger|hazard)\b/i.test(queryLower)
    ) {
      typeBoost = 0.5;
    }

    if (
      chunk.contentType === "TROUBLESHOOTING" &&
      /\b(?:problem|issue|error|fix|not\s+working|broken|fail|trouble)\b/i.test(queryLower)
    ) {
      typeBoost = 0.5;
    }

    if (
      chunk.contentType === "PROCEDURE" &&
      /\b(?:how\s+to|steps?|install|setup|configure|replace|remove)\b/i.test(queryLower)
    ) {
      typeBoost = 0.3;
    }

    if (
      chunk.contentType === "SPECS" &&
      /\b(?:spec|dimension|size|weight|rating|voltage|watt|capacity|model)\b/i.test(queryLower)
    ) {
      typeBoost = 0.3;
    }

    return {
      chunkId: chunk.id,
      content: chunk.content,
      documentId: chunk.documentId,
      documentTitle: doc.title,
      documentType: doc.type,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sectionPath: chunk.sectionPath,
      contentType: chunk.contentType,
      score: score + typeBoost,
    };
  });

  // 6. Sort by score descending and return top K
  scoredResults.sort((a, b) => b.score - a.score);

  // Filter out zero-score results unless we have fewer than topK non-zero results
  const nonZero = scoredResults.filter((r) => r.score > 0);
  if (nonZero.length >= topK) {
    return nonZero.slice(0, topK);
  }

  // If not enough keyword matches, include some zero-score results
  // (these would normally be ranked by vector similarity in production)
  return scoredResults.slice(0, topK);
}
