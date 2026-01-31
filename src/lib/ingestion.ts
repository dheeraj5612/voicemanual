/**
 * Content ingestion pipeline.
 *
 * Handles the lifecycle of KnowledgePackages (draft -> active -> archived)
 * and the ingestion of documents into chunked, indexed content for RAG retrieval.
 */

import { db } from "@/lib/db";
import { parseDocument } from "@/lib/manual-parser";
import type { DocumentType, KnowledgePackageStatus } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IngestDocumentParams {
  skuId: string;
  packageVersion: number;
  title: string;
  content: string;
  type: DocumentType;
  sourceUrl?: string;
}

interface IngestDocumentResult {
  documentId: string;
  chunksCreated: number;
}

interface CreatePackageResult {
  packageId: string;
  version: number;
}

// ─── Document Ingestion ─────────────────────────────────────────────────────

/**
 * Ingest a document into an existing KnowledgePackage.
 *
 * 1. Creates a Document record with the raw content
 * 2. Parses the content into classified chunks using the manual parser
 * 3. Creates Chunk records with placeholder embeddings
 * 4. All operations run inside a Prisma transaction for atomicity
 */
export async function ingestDocument(
  params: IngestDocumentParams
): Promise<IngestDocumentResult> {
  const { skuId, packageVersion, title, content, type, sourceUrl } = params;

  // Find the knowledge package for this SKU + version
  const knowledgePackage = await db.knowledgePackage.findUnique({
    where: {
      skuId_version: {
        skuId,
        version: packageVersion,
      },
    },
  });

  if (!knowledgePackage) {
    throw new Error(
      `KnowledgePackage not found for SKU "${skuId}" version ${packageVersion}`
    );
  }

  if (knowledgePackage.status !== "DRAFT") {
    throw new Error(
      `KnowledgePackage ${knowledgePackage.id} is not in DRAFT status (current: ${knowledgePackage.status}). ` +
        `Only DRAFT packages can accept new documents.`
    );
  }

  // Parse the document content into chunks
  const parsed = parseDocument(content, title);

  // Create Document and Chunks in a transaction
  const result = await db.$transaction(async (tx) => {
    // Create the Document record
    const document = await tx.document.create({
      data: {
        knowledgePackageId: knowledgePackage.id,
        type,
        title,
        rawContent: content,
        sourceUrl: sourceUrl ?? null,
        parsedAt: new Date(),
      },
    });

    // Create Chunk records
    if (parsed.chunks.length > 0) {
      await tx.chunk.createMany({
        data: parsed.chunks.map((chunk, index) => ({
          documentId: document.id,
          content: chunk.content,
          embedding: "[]", // placeholder — replace with real vector embeddings in production
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sectionPath: chunk.sectionPath,
          contentType: chunk.contentType,
          tokenCount: chunk.tokenCount,
          chunkIndex: index,
        })),
      });
    }

    return {
      documentId: document.id,
      chunksCreated: parsed.chunks.length,
    };
  });

  return result;
}

// ─── Knowledge Package Lifecycle ────────────────────────────────────────────

/**
 * Create a new KnowledgePackage for a SKU.
 *
 * Automatically increments the version number based on the highest
 * existing version for the SKU (or starts at 1 for new SKUs).
 * The package is created in DRAFT status.
 */
export async function createKnowledgePackage(
  skuId: string
): Promise<CreatePackageResult> {
  // Verify SKU exists
  const sku = await db.sKU.findUnique({ where: { id: skuId } });
  if (!sku) {
    throw new Error(`SKU "${skuId}" not found`);
  }

  // Find the highest existing version for this SKU
  const latestPackage = await db.knowledgePackage.findFirst({
    where: { skuId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (latestPackage?.version ?? 0) + 1;

  const knowledgePackage = await db.knowledgePackage.create({
    data: {
      skuId,
      version: nextVersion,
      status: "DRAFT",
    },
  });

  return {
    packageId: knowledgePackage.id,
    version: knowledgePackage.version,
  };
}

/**
 * Publish a KnowledgePackage, making it the active version for its SKU.
 *
 * - Sets the target package status to ACTIVE with a publishedAt timestamp
 * - Archives any previously ACTIVE package for the same SKU
 * - All operations are transactional
 */
export async function publishKnowledgePackage(
  packageId: string
): Promise<void> {
  const pkg = await db.knowledgePackage.findUnique({
    where: { id: packageId },
  });

  if (!pkg) {
    throw new Error(`KnowledgePackage "${packageId}" not found`);
  }

  if (pkg.status !== "DRAFT") {
    throw new Error(
      `KnowledgePackage "${packageId}" is not in DRAFT status (current: ${pkg.status}). ` +
        `Only DRAFT packages can be published.`
    );
  }

  await db.$transaction(async (tx) => {
    // Archive any currently ACTIVE packages for this SKU
    await tx.knowledgePackage.updateMany({
      where: {
        skuId: pkg.skuId,
        status: "ACTIVE",
      },
      data: {
        status: "ARCHIVED",
      },
    });

    // Publish the target package
    await tx.knowledgePackage.update({
      where: { id: packageId },
      data: {
        status: "ACTIVE",
        publishedAt: new Date(),
      },
    });
  });
}

/**
 * Rollback to the previous version for a SKU.
 *
 * - Archives the current ACTIVE package
 * - Re-activates the most recent ARCHIVED package
 * - Fails if there is no ARCHIVED package to roll back to
 */
export async function rollbackKnowledgePackage(
  skuId: string
): Promise<void> {
  // Find the currently active package
  const activePackage = await db.knowledgePackage.findFirst({
    where: {
      skuId,
      status: "ACTIVE",
    },
  });

  if (!activePackage) {
    throw new Error(`No ACTIVE KnowledgePackage found for SKU "${skuId}"`);
  }

  // Find the most recent archived package (by version descending)
  const archivedPackage = await db.knowledgePackage.findFirst({
    where: {
      skuId,
      status: "ARCHIVED",
    },
    orderBy: { version: "desc" },
  });

  if (!archivedPackage) {
    throw new Error(
      `No ARCHIVED KnowledgePackage found for SKU "${skuId}" to rollback to`
    );
  }

  await db.$transaction(async (tx) => {
    // Archive the currently active package
    await tx.knowledgePackage.update({
      where: { id: activePackage.id },
      data: { status: "ARCHIVED" },
    });

    // Re-activate the most recent archived package
    await tx.knowledgePackage.update({
      where: { id: archivedPackage.id },
      data: {
        status: "ACTIVE",
        publishedAt: new Date(),
      },
    });
  });
}

/**
 * Get or create a DRAFT KnowledgePackage for a SKU.
 *
 * If a DRAFT package already exists, returns it.
 * Otherwise, creates a new one with auto-incremented version.
 */
export async function getOrCreateDraftPackage(
  skuId: string
): Promise<CreatePackageResult> {
  // Check for existing DRAFT
  const existingDraft = await db.knowledgePackage.findFirst({
    where: {
      skuId,
      status: "DRAFT",
    },
    orderBy: { version: "desc" },
  });

  if (existingDraft) {
    return {
      packageId: existingDraft.id,
      version: existingDraft.version,
    };
  }

  // Create a new draft
  return createKnowledgePackage(skuId);
}
