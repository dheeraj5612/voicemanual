export interface VoiceConfig {
  tone: "professional" | "friendly" | "casual" | "technical";
  language: string;
  personality: string;
  greetingTemplate: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface VoiceResponse {
  text: string;
  audioUrl?: string;
  shouldEscalate: boolean;
  escalationReason?: string;
}

export interface QRCodeResult {
  shortCode: string;
  qrDataUrl: string; // base64 PNG
  scanUrl: string;
}

export interface ManualChunkResult {
  content: string;
  section?: string;
  pageNum?: number;
  score: number;
}

export interface EscalationRequest {
  sessionId: string;
  reason: string;
  conversationSummary: string;
}
