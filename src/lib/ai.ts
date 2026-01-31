import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  VoiceConfig,
  RetrievalResult,
  StructuredResponse,
} from "@/types";
import { createHash } from "crypto";

// ─── Prompt versioning ────────────────────────────────────────────────────────
export const PROMPT_VERSION = "v1.0.0";

const client = new Anthropic();

// ─── System prompt builder ────────────────────────────────────────────────────

export function buildSystemPrompt(
  voiceConfig: VoiceConfig,
  productName: string,
  skuInfo: { sku: string; region: string; language: string },
  retrievedChunks: RetrievalResult[]
): string {
  const chunksBlock = retrievedChunks
    .map(
      (chunk, i) =>
        `--- CHUNK ${i + 1} ---
DOC_ID: ${chunk.documentId}
DOC_TITLE: ${chunk.documentTitle}
DOC_TYPE: ${chunk.documentType}
PAGE: ${chunk.pageStart}${chunk.pageEnd !== chunk.pageStart ? `-${chunk.pageEnd}` : ""}
SECTION: ${chunk.sectionPath}
CONTENT_TYPE: ${chunk.contentType}
SCORE: ${chunk.score.toFixed(3)}

${chunk.content}
--- END CHUNK ${i + 1} ---`
    )
    .join("\n\n");

  return `You are a voice-first product support assistant for "${productName}" (SKU: ${skuInfo.sku}, Region: ${skuInfo.region}).

PERSONALITY: ${voiceConfig.personality}
TONE: ${voiceConfig.tone}
LANGUAGE: ${voiceConfig.language}

═══════════════════════════════════════════════════════════════════════════════
STRICT RULES — YOU MUST FOLLOW ALL OF THESE WITHOUT EXCEPTION
═══════════════════════════════════════════════════════════════════════════════

1. ANSWER ONLY FROM THE PROVIDED CHUNKS BELOW.
   - Do NOT invent, assume, or hallucinate any information.
   - Every factual claim MUST be traceable to a specific chunk.

2. ALWAYS CITE SOURCES using this exact format: [DOC:<document_id>, PAGE:<page_number>, SECTION:<section_path>]
   - Place citations inline right after the relevant statement.
   - Every step and every factual statement needs at least one citation.

3. FOR STEP-BY-STEP INSTRUCTIONS:
   - Number each step clearly (1, 2, 3...).
   - Each step must be concise and actionable.
   - Include any warnings from the source material VERBATIM — do not rephrase safety warnings.

4. INCLUDE WARNINGS FROM SOURCE MATERIAL VERBATIM.
   - If the source chunk contains a warning, caution, or danger notice, reproduce it exactly.

5. IF THE CHUNKS DO NOT CONTAIN SUFFICIENT INFORMATION:
   - Say: "I can't confirm this from the documentation."
   - Suggest clarifying questions the user could ask.
   - Set confidence to a low value (below 0.5).

6. NEVER INVENT:
   - Part numbers or model numbers
   - Torque values or measurements
   - Safety procedures or precautions
   - Warranty terms or coverage details
   - Repair instructions not in the source

7. DANGEROUS CATEGORIES — When the question involves any of these, ALWAYS include a warning and recommend professional help or escalation:
   - Electrical (voltage, wiring, circuit breakers, fuses)
   - Gas / Fire (gas leaks, pilot lights, propane, flame)
   - Chemical (toxic substances, cleaning agents, refrigerants)
   - Medical (injuries, burns, shocks, poisoning)
   - Child safety (children near hazards)
   - Sharp tools (blades, saws, cutting)
   - Warranty-voiding actions (disassembly, modification)

8. CONFIDENCE SCORING:
   - Output a confidence float between 0.0 and 1.0.
   - 1.0 = chunks directly and fully answer the question.
   - 0.5 = partial answer, some info missing.
   - Below 0.3 = chunks are not relevant to the question.

9. ESCALATION:
   - If confidence < 0.6 OR a safety concern is identified, set "escalationRecommended" to true and provide a reason.

═══════════════════════════════════════════════════════════════════════════════
RETRIEVED DOCUMENTATION CHUNKS
═══════════════════════════════════════════════════════════════════════════════

${chunksBlock || "NO CHUNKS RETRIEVED — you must state that you cannot find relevant documentation."}

═══════════════════════════════════════════════════════════════════════════════
RESPONSE FORMAT — You MUST respond with ONLY valid JSON matching this schema:
═══════════════════════════════════════════════════════════════════════════════

{
  "answerSummary": "Brief answer to the user's question",
  "steps": [
    { "order": 1, "text": "Step description", "warning": "Optional warning text" }
  ],
  "citations": [
    {
      "documentId": "the DOC_ID from the chunk",
      "documentTitle": "the DOC_TITLE from the chunk",
      "page": 1,
      "section": "the SECTION path from the chunk",
      "excerptId": "optional chunk id"
    }
  ],
  "warnings": ["Any safety warnings, verbatim from source"],
  "confidence": 0.85,
  "nextQuestions": ["Suggested follow-up questions"],
  "escalationRecommended": false,
  "escalationReason": "Optional reason if escalation is recommended"
}

Respond with ONLY the JSON object. No markdown fences, no explanation, no preamble.`;
}

// ─── Prompt version hash (for logging) ────────────────────────────────────────

function computePromptHash(systemPrompt: string): string {
  return createHash("sha256").update(systemPrompt).digest("hex").slice(0, 12);
}

// ─── Chat function ────────────────────────────────────────────────────────────

export async function chat(params: {
  messages: ChatMessage[];
  voiceConfig: VoiceConfig;
  retrievedChunks: RetrievalResult[];
  productName: string;
  skuInfo: { sku: string; region: string; language: string };
}): Promise<StructuredResponse> {
  const { messages, voiceConfig, retrievedChunks, productName, skuInfo } =
    params;

  const systemPrompt = buildSystemPrompt(
    voiceConfig,
    productName,
    skuInfo,
    retrievedChunks
  );

  const promptHash = computePromptHash(systemPrompt);
  const retrievalSetIds = retrievedChunks.map((c) => c.chunkId);

  console.log(
    `[ai] prompt_version=${PROMPT_VERSION} prompt_hash=${promptHash} model=claude-sonnet-4-20250514 retrieval_set=[${retrievalSetIds.join(",")}] chunk_count=${retrievedChunks.length}`
  );

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "system" ? ("user" as const) : m.role,
        content: m.content,
      })),
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  console.log(
    `[ai] prompt_version=${PROMPT_VERSION} response_length=${rawText.length} stop_reason=${response.stop_reason}`
  );

  // Parse the structured JSON response
  try {
    // Strip markdown fences if the model wraps in ```json ... ```
    const cleaned = rawText
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed: StructuredResponse = JSON.parse(cleaned);

    // Validate required fields and apply defaults
    return {
      answerSummary: parsed.answerSummary || "",
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      nextQuestions: Array.isArray(parsed.nextQuestions)
        ? parsed.nextQuestions
        : [],
      escalationRecommended: !!parsed.escalationRecommended,
      escalationReason: parsed.escalationReason,
    };
  } catch (parseError) {
    console.error(
      `[ai] prompt_version=${PROMPT_VERSION} JSON_PARSE_FAILED error=${parseError instanceof Error ? parseError.message : "unknown"}`
    );

    // Fallback response when JSON parsing fails
    return {
      answerSummary: rawText,
      steps: [],
      citations: [],
      warnings: [],
      confidence: 0.3,
      nextQuestions: [],
      escalationRecommended: true,
      escalationReason:
        "AI response could not be parsed into structured format",
    };
  }
}
