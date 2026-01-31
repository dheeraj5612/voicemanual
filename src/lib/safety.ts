import { db } from "@/lib/db";
import type {
  RetrievalResult,
  StructuredResponse,
  SafetyCheckResult,
  SafetyTriggerInfo,
} from "@/types";

// ─── Safety keyword dictionaries ──────────────────────────────────────────────

const CRITICAL_KEYWORDS = [
  "bypass",
  "override",
  "disable safety",
  "remove guard",
  "short circuit",
];

const HIGH_ELECTRICAL_KEYWORDS = [
  "voltage",
  "amperage",
  "wire",
  "fuse",
  "circuit breaker",
];

const HIGH_GAS_FIRE_KEYWORDS = [
  "gas leak",
  "flame",
  "propane",
  "pilot light",
];

const HIGH_MEDICAL_KEYWORDS = ["injury", "burn", "shock", "poisoning"];

const HIGH_CHILD_SAFETY_INDICATORS = ["child", "baby", "infant"];
const HIGH_CHILD_SAFETY_DANGER = ["danger", "harm", "safe"];

const MEDIUM_WARRANTY_KEYWORDS = [
  "void warranty",
  "disassemble",
  "modify",
  "root",
  "jailbreak",
];

const MEDIUM_SHARP_TOOL_KEYWORDS = ["blade", "saw", "cut"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function messageLower(msg: string): string {
  return msg.toLowerCase();
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function containsNearby(
  text: string,
  groupA: string[],
  groupB: string[],
  maxDistance: number = 60
): boolean {
  for (const a of groupA) {
    const idxA = text.indexOf(a);
    if (idxA === -1) continue;
    for (const b of groupB) {
      const idxB = text.indexOf(b);
      if (idxB === -1) continue;
      if (Math.abs(idxA - idxB) <= maxDistance) return true;
    }
  }
  return false;
}

// ─── Main safety check ───────────────────────────────────────────────────────

export function checkSafety(params: {
  userMessage: string;
  retrievedChunks: RetrievalResult[];
  structuredResponse: StructuredResponse;
}): SafetyCheckResult {
  const { userMessage, retrievedChunks, structuredResponse } = params;
  const triggers: SafetyTriggerInfo[] = [];
  const lowerMsg = messageLower(userMessage);

  // ── 1. Safety keyword detection in user message ─────────────────────────

  // CRITICAL keywords
  if (containsAny(lowerMsg, CRITICAL_KEYWORDS)) {
    triggers.push({
      type: "safety_bypass_attempt",
      severity: "CRITICAL",
      reason: `User message contains critical safety bypass keyword`,
    });
  }

  // HIGH: Electrical
  if (containsAny(lowerMsg, HIGH_ELECTRICAL_KEYWORDS)) {
    triggers.push({
      type: "electrical",
      severity: "HIGH",
      reason: "User question involves electrical components — professional help recommended",
    });
  }

  // HIGH: Gas / Fire
  if (containsAny(lowerMsg, HIGH_GAS_FIRE_KEYWORDS)) {
    triggers.push({
      type: "gas_fire",
      severity: "HIGH",
      reason: "User question involves gas or fire hazards — professional help recommended",
    });
  }

  // HIGH: Medical
  if (containsAny(lowerMsg, HIGH_MEDICAL_KEYWORDS)) {
    triggers.push({
      type: "medical",
      severity: "HIGH",
      reason: "User question involves potential injury or medical concern",
    });
  }

  // HIGH: Child safety (child-related word near danger-related word)
  if (
    containsNearby(lowerMsg, HIGH_CHILD_SAFETY_INDICATORS, HIGH_CHILD_SAFETY_DANGER)
  ) {
    triggers.push({
      type: "child_safety",
      severity: "HIGH",
      reason: "User question involves child safety concerns",
    });
  }

  // MEDIUM: Warranty-voiding
  if (containsAny(lowerMsg, MEDIUM_WARRANTY_KEYWORDS)) {
    triggers.push({
      type: "warranty_void",
      severity: "MEDIUM",
      reason: "User question may involve warranty-voiding actions",
    });
  }

  // MEDIUM: Sharp tools near "how to"
  if (
    containsAny(lowerMsg, MEDIUM_SHARP_TOOL_KEYWORDS) &&
    lowerMsg.includes("how to")
  ) {
    triggers.push({
      type: "sharp_tools",
      severity: "MEDIUM",
      reason: "User question involves sharp tools with procedural intent",
    });
  }

  // ── 2. Retrieval confidence check ───────────────────────────────────────

  if (retrievedChunks.length > 0) {
    const allScoresLow = retrievedChunks.every((c) => c.score < 0.3);
    const topScore = Math.max(...retrievedChunks.map((c) => c.score));
    const wordCount = userMessage.trim().split(/\s+/).length;

    if (allScoresLow) {
      triggers.push({
        type: "insufficient_evidence",
        severity: "HIGH",
        reason: `All retrieval chunk scores below 0.3 — insufficient evidence to answer`,
      });
    } else if (topScore < 0.5 && wordCount > 10) {
      triggers.push({
        type: "low_retrieval_confidence",
        severity: "MEDIUM",
        reason: `Top retrieval score (${topScore.toFixed(3)}) is low for a specific query (${wordCount} words)`,
      });
    }
  } else {
    // No chunks retrieved at all
    triggers.push({
      type: "no_retrieval_results",
      severity: "HIGH",
      reason: "No documentation chunks were retrieved for this query",
    });
  }

  // ── 3. Response confidence check ────────────────────────────────────────

  if (structuredResponse.confidence < 0.4) {
    triggers.push({
      type: "low_response_confidence",
      severity: "HIGH",
      reason: `AI response confidence is very low (${structuredResponse.confidence.toFixed(2)})`,
    });
  } else if (structuredResponse.confidence < 0.6) {
    triggers.push({
      type: "moderate_response_confidence",
      severity: "MEDIUM",
      reason: `AI response confidence is below threshold (${structuredResponse.confidence.toFixed(2)})`,
    });
  }

  // ── 4. Conflicting source detection ─────────────────────────────────────

  if (retrievedChunks.length >= 2) {
    const sectionMap = new Map<string, Set<string>>();
    for (const chunk of retrievedChunks) {
      const key = chunk.sectionPath;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, new Set());
      }
      sectionMap.get(key)!.add(chunk.documentId);
    }

    for (const [section, docIds] of sectionMap) {
      if (docIds.size > 1) {
        // Multiple documents have chunks for the same section path —
        // check if they have different content types (potential conflict)
        const chunksForSection = retrievedChunks.filter(
          (c) => c.sectionPath === section
        );
        const contentTypes = new Set(chunksForSection.map((c) => c.contentType));
        if (contentTypes.size > 1) {
          triggers.push({
            type: "conflicting_sources",
            severity: "HIGH",
            reason: `Multiple documents (${Array.from(docIds).join(", ")}) have conflicting content types for section "${section}"`,
          });
        }
      }
    }
  }

  // ── Determine overall action (worst severity wins) ──────────────────────

  const action = determineAction(triggers);

  return {
    triggered: triggers.length > 0,
    triggers,
    action,
  };
}

// ─── Action determination ─────────────────────────────────────────────────────

function determineAction(
  triggers: SafetyTriggerInfo[]
): SafetyCheckResult["action"] {
  if (triggers.length === 0) return "allow";

  const severities = triggers.map((t) => t.severity);

  if (severities.includes("CRITICAL")) return "block";
  if (severities.includes("HIGH")) return "escalate";
  if (severities.includes("MEDIUM")) return "warn";
  return "allow";
}

// ─── Record safety triggers to DB ─────────────────────────────────────────────

export async function recordSafetyTrigger(params: {
  messageId: string;
  sessionId: string;
  triggers: SafetyTriggerInfo[];
  action: string;
}): Promise<void> {
  const { messageId, sessionId, triggers, action } = params;

  // Map our action string to the SafetyAction enum in Prisma
  const dbAction = mapActionToEnum(action);

  const createOps = triggers.map((trigger) =>
    db.safetyTrigger.create({
      data: {
        messageId,
        sessionId,
        triggerType: trigger.type,
        severity: trigger.severity,
        action: dbAction,
      },
    })
  );

  await Promise.all(createOps);

  console.log(
    `[safety] recorded ${triggers.length} trigger(s) for message=${messageId} session=${sessionId} action=${action}`
  );
}

function mapActionToEnum(action: string): "WARNED" | "ESCALATED" | "BLOCKED" {
  switch (action) {
    case "block":
      return "BLOCKED";
    case "escalate":
      return "ESCALATED";
    case "warn":
      return "WARNED";
    default:
      return "WARNED";
  }
}
