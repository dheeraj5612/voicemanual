import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chat } from "@/lib/ai";
import { retrieveChunks } from "@/lib/retrieval";
import { checkSafety, recordSafetyTrigger } from "@/lib/safety";
import { trackEvent } from "@/lib/analytics";
import type { ChatMessage, VoiceConfig, StructuredResponse } from "@/types";

// ─── Request validation ───────────────────────────────────────────────────────

const chatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

// ─── POST /api/voice ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message } = chatRequestSchema.parse(body);

    // ── 1. Load session with SKU, brand, and active knowledge package ─────

    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: {
        sku: {
          include: {
            productLine: {
              include: {
                brand: true,
              },
            },
            knowledgePackages: {
              where: { status: "ACTIVE" },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status === "ESCALATED") {
      return NextResponse.json(
        { error: "Session has been escalated to human support" },
        { status: 400 }
      );
    }

    const sku = session.sku;
    const productLine = sku.productLine;
    const brand = productLine.brand;
    const activeKnowledgePackage = sku.knowledgePackages[0];

    if (!activeKnowledgePackage) {
      return NextResponse.json(
        { error: "No active knowledge package found for this SKU" },
        { status: 404 }
      );
    }

    // ── 2. Load conversation history (last 20 messages) ───────────────────

    const recentMessages = await db.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const history: ChatMessage[] = recentMessages.map((m) => ({
      role: m.role.toLowerCase() as ChatMessage["role"],
      content: m.content,
      structuredResponse: m.structuredResponse
        ? (m.structuredResponse as unknown as StructuredResponse)
        : undefined,
    }));

    // Add the new user message to history for the AI call
    history.push({ role: "user", content: message });

    // ── 3. Retrieve relevant chunks ───────────────────────────────────────

    const retrievedChunks = await retrieveChunks({
      skuId: sku.id,
      query: message,
      topK: 5,
    });

    // ── 4. Build voice config ─────────────────────────────────────────────

    const voiceConfig: VoiceConfig = (brand.voiceConfig as unknown as VoiceConfig) || {
      tone: "friendly",
      language: sku.language || "en",
      personality: "Helpful product expert",
      greetingTemplate: "Hi! I'm here to help you with your {product}.",
    };

    // ── 5. Call AI chat ───────────────────────────────────────────────────

    const structuredResponse = await chat({
      messages: history,
      voiceConfig,
      retrievedChunks,
      productName: productLine.name,
      skuInfo: {
        sku: sku.sku,
        region: sku.region,
        language: sku.language,
      },
    });

    // ── 6. Run safety check ───────────────────────────────────────────────

    const safetyResult = checkSafety({
      userMessage: message,
      retrievedChunks,
      structuredResponse,
    });

    // Override escalation based on safety
    if (safetyResult.action === "escalate" || safetyResult.action === "block") {
      structuredResponse.escalationRecommended = true;
      if (!structuredResponse.escalationReason) {
        structuredResponse.escalationReason = safetyResult.triggers
          .map((t) => t.reason)
          .join("; ");
      }
    }

    // Add safety warnings to the response
    if (safetyResult.triggered && safetyResult.action === "block") {
      structuredResponse.warnings.push(
        "This query has been blocked for safety reasons. Please contact support directly."
      );
    }

    // ── 7. Store user message ─────────────────────────────────────────────

    const userMsg = await db.message.create({
      data: {
        sessionId,
        role: "USER",
        content: message,
      },
    });

    // ── 8. Store assistant message with structured response ───────────────

    const assistantMsg = await db.message.create({
      data: {
        sessionId,
        role: "ASSISTANT",
        content: structuredResponse.answerSummary,
        structuredResponse: JSON.parse(JSON.stringify(structuredResponse)),
      },
    });

    // ── 9. Record safety triggers if any ──────────────────────────────────

    if (safetyResult.triggered) {
      await recordSafetyTrigger({
        messageId: userMsg.id,
        sessionId,
        triggers: safetyResult.triggers,
        action: safetyResult.action,
      });
    }

    // ── 10. Track analytics events ────────────────────────────────────────

    // Track the user question
    trackEvent({
      sessionId,
      eventType: "question",
      payload: {
        content: message,
        messageId: userMsg.id,
        chunkCount: retrievedChunks.length,
        topScore:
          retrievedChunks.length > 0
            ? Math.max(...retrievedChunks.map((c) => c.score))
            : 0,
      },
    });

    // Track the AI answer
    trackEvent({
      sessionId,
      eventType: "answer",
      payload: {
        messageId: assistantMsg.id,
        confidence: structuredResponse.confidence,
        citationCount: structuredResponse.citations.length,
        stepCount: structuredResponse.steps.length,
        warningCount: structuredResponse.warnings.length,
        safetyAction: safetyResult.action,
        escalationRecommended: structuredResponse.escalationRecommended,
      },
    });

    // ── 11. Handle escalation ─────────────────────────────────────────────

    if (structuredResponse.escalationRecommended) {
      // Build a transcript from recent history
      const transcript = history
        .slice(-10)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      // Create a Case for human follow-up
      const existingCase = await db.case.findUnique({
        where: { sessionId },
      });

      if (!existingCase) {
        await db.case.create({
          data: {
            sessionId,
            skuId: sku.id,
            category: safetyResult.triggered
              ? safetyResult.triggers[0]?.type
              : "ai_low_confidence",
            description:
              structuredResponse.escalationReason ||
              "AI recommended escalation",
            transcript,
            stepsAttempted: JSON.parse(JSON.stringify(
              structuredResponse.steps.map((s) => s.text)
            )),
            sourcesUsed: JSON.parse(JSON.stringify(
              structuredResponse.citations
            )),
            status: "OPEN",
          },
        });
      }

      // Update session status to escalated
      await db.session.update({
        where: { id: sessionId },
        data: { status: "ESCALATED" },
      });

      // Track escalation event
      trackEvent({
        sessionId,
        eventType: "escalated",
        payload: {
          reason: structuredResponse.escalationReason,
          safetyAction: safetyResult.action,
          triggers: safetyResult.triggers.map((t) => ({
            type: t.type,
            severity: t.severity,
          })),
          confidence: structuredResponse.confidence,
        },
      });
    }

    // ── 12. Return the structured response ────────────────────────────────

    return NextResponse.json(structuredResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    console.error("[voice] Chat endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
