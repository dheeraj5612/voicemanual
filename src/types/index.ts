// ─── Response Contract ───────────────────────────────────────────────────────
// This is the strict JSON schema the answering service must produce

export interface StructuredResponse {
  answerSummary: string;
  steps: StepInstruction[];
  citations: Citation[];
  warnings: string[];
  confidence: number; // 0-1
  nextQuestions: string[];
  escalationRecommended: boolean;
  escalationReason?: string;
}

export interface StepInstruction {
  order: number;
  text: string;
  warning?: string;
}

export interface Citation {
  documentId: string;
  documentTitle: string;
  page: number;
  section: string;
  excerptId?: string;
}

// ─── Voice Configuration ────────────────────────────────────────────────────

export interface VoiceConfig {
  tone: "professional" | "friendly" | "casual" | "technical";
  language: string;
  personality: string;
  greetingTemplate: string;
}

// ─── QR Code Parameters ─────────────────────────────────────────────────────

export interface QRParameters {
  brandId: string;
  productId: string;
  sku: string;
  region: string;
  language: string;
  firmware?: string;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  structuredResponse?: StructuredResponse;
}

// ─── Retrieval ───────────────────────────────────────────────────────────────

export interface RetrievalResult {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string;
  documentType: string;
  pageStart: number;
  pageEnd: number;
  sectionPath: string;
  contentType: string;
  score: number;
}

// ─── Escalation / Case ──────────────────────────────────────────────────────

export interface CaseCreateRequest {
  sessionId: string;
  email?: string;
  category?: string;
  description?: string;
  photoUrls?: string[];
}

// ─── QR Code Result ──────────────────────────────────────────────────────────

export interface QRCodeResult {
  shortCode: string;
  qrDataUrl: string;
  scanUrl: string;
  parameters: QRParameters;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export type AnalyticsEventType =
  | "qr_scan"
  | "session_start"
  | "question"
  | "answer"
  | "solved"
  | "not_solved"
  | "escalated"
  | "safety_trigger"
  | "voice_input"
  | "voice_output";

export interface AnalyticsPayload {
  eventType: AnalyticsEventType;
  sessionId: string;
  skuId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Safety ──────────────────────────────────────────────────────────────────

export interface SafetyCheckResult {
  triggered: boolean;
  triggers: SafetyTriggerInfo[];
  action: "allow" | "warn" | "escalate" | "block";
}

export interface SafetyTriggerInfo {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
}

// ─── Ingestion ───────────────────────────────────────────────────────────────

export interface ParsedDocument {
  title: string;
  chunks: ParsedChunk[];
  totalPages: number;
  figureCaptions: string[];
  metadata: {
    pageCount: number;
    language: string;
    extractedAt: string;
  };
}

export interface ParsedChunk {
  content: string;
  pageStart: number;
  pageEnd: number;
  sectionPath: string;
  contentType: "PROCEDURE" | "WARNING" | "SPECS" | "TROUBLESHOOTING" | "GENERAL";
  tokenCount: number;
}

// ─── Dashboard Analytics ─────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalScans: number;
  totalSessions: number;
  resolutionRate: number;
  escalationRate: number;
  avgResponseTime: number;
  topIntents: { intent: string; count: number }[];
  unresolvedQuestions: { question: string; count: number }[];
  deflectionEstimate: number;
}
