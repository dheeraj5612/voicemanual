import { db } from "./db";
import type { EscalationRequest } from "@/types";

/**
 * Handles escalation from AI voice assistant to human support.
 *
 * The escalation flow:
 * 1. AI detects customer frustration or explicit request for human
 * 2. Creates an escalation record with conversation summary
 * 3. Finds an available agent in the same organization
 * 4. Updates session status to ESCALATED
 * 5. Notifies the agent (webhook/email - pluggable)
 */

export async function createEscalation(
  request: EscalationRequest
): Promise<{ escalationId: string; agentAssigned: boolean }> {
  const session = await db.voiceSession.findUniqueOrThrow({
    where: { id: request.sessionId },
    include: { product: true },
  });

  const availableAgent = await db.agent.findFirst({
    where: {
      organizationId: session.product.organizationId,
      available: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const escalation = await db.escalation.create({
    data: {
      sessionId: request.sessionId,
      reason: request.reason,
      agentId: availableAgent?.id,
      status: availableAgent ? "ASSIGNED" : "PENDING",
    },
  });

  await db.voiceSession.update({
    where: { id: request.sessionId },
    data: { status: "ESCALATED" },
  });

  await db.message.create({
    data: {
      sessionId: request.sessionId,
      role: "SYSTEM",
      content: `[Escalation Summary] ${request.conversationSummary}`,
    },
  });

  return {
    escalationId: escalation.id,
    agentAssigned: !!availableAgent,
  };
}

export async function resolveEscalation(
  escalationId: string
): Promise<void> {
  await db.escalation.update({
    where: { id: escalationId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });

  const escalation = await db.escalation.findUniqueOrThrow({
    where: { id: escalationId },
  });

  await db.voiceSession.update({
    where: { id: escalation.sessionId },
    data: { status: "RESOLVED", endedAt: new Date() },
  });
}
