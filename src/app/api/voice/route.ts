import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chat } from "@/lib/ai";
import { synthesizeSpeech } from "@/lib/voice";
import { createEscalation } from "@/lib/escalation";
import type { ChatMessage, VoiceConfig } from "@/types";

const chatRequestSchema = z.object({
  sessionId: z.string(),
  message: z.string().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message } = chatRequestSchema.parse(body);

    const session = await db.voiceSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        product: { include: { organization: true, manuals: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 20 },
      },
    });

    if (session.status === "ESCALATED") {
      return NextResponse.json(
        { error: "Session has been escalated to human support" },
        { status: 400 }
      );
    }

    // Store user message
    await db.message.create({
      data: { sessionId, role: "USER", content: message },
    });

    // Build conversation history
    const history: ChatMessage[] = session.messages.map((m) => ({
      role: m.role.toLowerCase() as ChatMessage["role"],
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    // Combine manual content as context (simple approach — use vector search in production)
    const manualContext = session.product.manuals
      .map((m) => m.content)
      .join("\n\n---\n\n");

    const voiceConfig: VoiceConfig = (session.product.organization
      .voiceConfig as VoiceConfig) || {
      tone: "friendly",
      language: "en",
      personality: "Helpful product expert",
      greetingTemplate: "Hi! I'm here to help you with your {product}.",
    };

    // Get AI response
    const aiResponse = await chat(
      history,
      voiceConfig,
      manualContext,
      session.product.name
    );

    // Store assistant message
    await db.message.create({
      data: { sessionId, role: "ASSISTANT", content: aiResponse.text },
    });

    // Handle escalation if needed
    if (aiResponse.shouldEscalate) {
      const escalation = await createEscalation({
        sessionId,
        reason: aiResponse.escalationReason || "Customer requested human agent",
        conversationSummary: history
          .slice(-6)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n"),
      });

      return NextResponse.json({
        text: aiResponse.text,
        escalated: true,
        escalationId: escalation.escalationId,
        agentAssigned: escalation.agentAssigned,
      });
    }

    return NextResponse.json({
      text: aiResponse.text,
      escalated: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Voice chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
