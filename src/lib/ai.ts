import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, VoiceConfig, VoiceResponse } from "@/types";

const client = new Anthropic();

function buildSystemPrompt(
  voiceConfig: VoiceConfig,
  manualContext: string,
  productName: string
): string {
  return `You are a voice assistant for the product "${productName}".

PERSONALITY: ${voiceConfig.personality}
TONE: ${voiceConfig.tone}
LANGUAGE: ${voiceConfig.language}

You help customers understand and use their product by answering questions based on the official manual and instructions. Always be helpful, accurate, and concise since your responses will be spoken aloud.

PRODUCT MANUAL CONTEXT:
${manualContext}

RULES:
- Answer questions using ONLY information from the manual context above.
- If you cannot answer from the manual, say so honestly and offer to connect the customer with a human agent.
- Keep responses conversational and brief (2-3 sentences when possible) since they will be read aloud.
- If the customer is frustrated, confused after multiple attempts, or explicitly asks for a human, respond with [ESCALATE: reason] at the end of your message.
- Never make up information not in the manual.
- For safety-critical instructions (electrical, chemical, heavy machinery), always recommend consulting a professional if there is any doubt.`;
}

export async function chat(
  messages: ChatMessage[],
  voiceConfig: VoiceConfig,
  manualContext: string,
  productName: string
): Promise<VoiceResponse> {
  const systemPrompt = buildSystemPrompt(
    voiceConfig,
    manualContext,
    productName
  );

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role,
      content: m.content,
    })),
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const escalateMatch = text.match(/\[ESCALATE:\s*(.+?)\]/);
  const cleanText = text.replace(/\[ESCALATE:\s*.+?\]/, "").trim();

  return {
    text: cleanText,
    shouldEscalate: !!escalateMatch,
    escalationReason: escalateMatch?.[1],
  };
}
