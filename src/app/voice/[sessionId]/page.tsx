"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Send,
  Globe,
  Settings,
  Wrench,
  Package,
  ShieldCheck,
  Phone,
  Loader2,
  RefreshCcw,
  AlertCircle,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { StructuredResponse } from "@/types";
import StructuredAnswer from "@/components/StructuredAnswer";
import EscalationForm from "@/components/EscalationForm";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionInfo {
  sessionId: string;
  productName: string;
  brandName: string;
  sku: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  structuredResponse?: StructuredResponse;
  error?: boolean;
}

const QUICK_ACTIONS = [
  { label: "Setup", icon: Settings, message: "How do I set up this product?" },
  { label: "Troubleshoot", icon: Wrench, message: "I'm having a problem with my product" },
  { label: "Parts", icon: Package, message: "What parts and accessories are available?" },
  { label: "Warranty", icon: ShieldCheck, message: "What does my warranty cover?" },
  { label: "Contact Support", icon: Phone, message: "__ESCALATE__" },
];

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
  { code: "ja", label: "JA" },
  { code: "zh", label: "ZH" },
];

let messageCounter = 0;
function nextId(): string {
  return `msg_${++messageCounter}_${Date.now()}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function VoiceSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  // Session info
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Escalation state
  const [isEscalated, setIsEscalated] = useState(false);
  const [showEscalationForm, setShowEscalationForm] = useState(false);
  const [escalationEmail, setEscalationEmail] = useState<string | null>(null);

  // Language
  const [language, setLanguage] = useState("en");

  // Scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showEscalationForm]);

  // Load session info
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch(`/api/session?id=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          // The session endpoint returns nested sku.productLine.brand structure
          setSession({
            sessionId,
            productName:
              data.productName ||
              data.sku?.productLine?.name ||
              "Product",
            brandName:
              data.brandName ||
              data.sku?.productLine?.brand?.name ||
              "",
            sku: data.sku?.sku || data.sku || "",
          });

          // Check if session is already escalated
          if (data.status === "ESCALATED") {
            setIsEscalated(true);
          }
        } else {
          // Fallback for when session endpoint is not available
          setSession({
            sessionId,
            productName: "Product",
            brandName: "",
            sku: "",
          });
        }
      } catch {
        setSession({
          sessionId,
          productName: "Product",
          brandName: "",
          sku: "",
        });
      }
    }
    loadSession();
  }, [sessionId]);

  // ─── Speech Recognition ────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (
      !(
        "webkitSpeechRecognition" in window ||
        "SpeechRecognition" in window
      )
    ) {
      return;
    }

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language === "en" ? "en-US" : language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [language]);

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  // ─── TTS ───────────────────────────────────────────────────────────────────

  function speakText(text: string) {
    if (!ttsEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.lang = language;
    window.speechSynthesis.speak(utterance);
  }

  // ─── Send Message ──────────────────────────────────────────────────────────

  async function sendMessage(text?: string) {
    const messageText = text || input.trim();
    if (!messageText || isLoading || isEscalated) return;

    // Handle escalation trigger
    if (messageText === "__ESCALATE__") {
      setShowEscalationForm(true);
      return;
    }

    setInput("");
    setNetworkError(false);

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      content: messageText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: messageText }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          setSessionError(true);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            content: data.error,
            error: true,
          },
        ]);
        return;
      }

      // Build assistant message
      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: data.answerSummary || data.text || "",
        structuredResponse: data.answerSummary
          ? (data as StructuredResponse)
          : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Speak the summary
      if (assistantMsg.structuredResponse) {
        speakText(assistantMsg.structuredResponse.answerSummary);
      } else if (assistantMsg.content) {
        speakText(assistantMsg.content);
      }

      // Handle auto-escalation from AI
      if (data.escalated) {
        setIsEscalated(true);
      }
    } catch {
      setNetworkError(true);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: "Network error. Please check your connection and try again.",
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Feedback Handlers ─────────────────────────────────────────────────────

  function handleSolved() {
    // Track solved event
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "solved",
        sessionId,
      }),
    }).catch(() => {});
  }

  function handleNotSolved() {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "not_solved",
        sessionId,
      }),
    }).catch(() => {});
  }

  function handleFollowUp(question: string) {
    sendMessage(question);
  }

  function handleEscalationSubmit(caseId: string) {
    setShowEscalationForm(false);
    setIsEscalated(true);
    setEscalationEmail(caseId);

    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: "assistant",
        content: `Your support case has been created (Case #${caseId}). A support agent will reach out to you shortly.`,
      },
    ]);
  }

  // ─── Session Error ─────────────────────────────────────────────────────────

  if (sessionError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-900 mb-2">
            Session Not Found
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            This session may have expired or the link is invalid.
          </p>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-dvh bg-slate-50">
      {/* ─── Header ────────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Brand logo placeholder */}
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {session?.brandName?.charAt(0) || "V"}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-slate-900 truncate">
                {session?.brandName
                  ? `${session.brandName} ${session.productName}`
                  : "Voice Assistant"}
              </h1>
              {session?.sku && (
                <p className="text-xs text-slate-500 truncate">
                  SKU: {session.sku}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* TTS toggle */}
            <button
              onClick={() => {
                setTtsEnabled(!ttsEnabled);
                if (ttsEnabled) window.speechSynthesis?.cancel();
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label={ttsEnabled ? "Mute voice" : "Unmute voice"}
            >
              {ttsEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            {/* Language selector */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="text-xs font-medium text-slate-600 bg-transparent border-0 focus:outline-none appearance-none pr-1 cursor-pointer"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Quick Actions ─────────────────────────────────────────────────────── */}
      {messages.length === 0 && !isEscalated && (
        <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => sendMessage(action.message)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0"
              >
                <action.icon className="w-3.5 h-3.5 text-slate-400" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Chat Area ─────────────────────────────────────────────────────────── */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <Mic className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-1">
              How can I help?
            </h2>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Tap the microphone or type a question about your product. You can
              also tap a quick action above.
            </p>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "user" ? (
              /* User message bubble */
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm text-white">
                {msg.content}
              </div>
            ) : (
              /* Assistant message */
              <div
                className={`max-w-[90%] rounded-2xl rounded-bl-md px-4 py-3 text-sm ${
                  msg.error
                    ? "bg-red-50 border border-red-200"
                    : "bg-white border border-slate-200 shadow-sm"
                }`}
              >
                {msg.structuredResponse ? (
                  <StructuredAnswer
                    response={msg.structuredResponse}
                    onSolved={handleSolved}
                    onNotSolved={handleNotSolved}
                    onFollowUp={handleFollowUp}
                    onEscalate={() => setShowEscalationForm(true)}
                  />
                ) : (
                  <p
                    className={
                      msg.error ? "text-red-700" : "text-slate-800 leading-relaxed"
                    }
                  >
                    {msg.content}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center">
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}

        {/* Network error retry */}
        {networkError && !isLoading && (
          <div className="flex justify-center">
            <button
              onClick={() => {
                setNetworkError(false);
                const lastUserMsg = [...messages]
                  .reverse()
                  .find((m) => m.role === "user");
                if (lastUserMsg) {
                  // Remove the error message and retry
                  setMessages((prev) =>
                    prev.filter((m) => !m.error || m.id !== prev[prev.length - 1]?.id)
                  );
                  sendMessage(lastUserMsg.content);
                }
              }}
              className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Escalation form */}
        {showEscalationForm && (
          <div className="max-w-sm mx-auto">
            <EscalationForm
              sessionId={sessionId}
              onSubmit={handleEscalationSubmit}
              onCancel={() => setShowEscalationForm(false)}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area ────────────────────────────────────────────────────────── */}
      {!isEscalated && !showEscalationForm && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Mic button */}
            <button
              onClick={isListening ? stopListening : startListening}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                isListening
                  ? "bg-red-500 text-white shadow-lg shadow-red-500/25 animate-pulse"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              }`}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            {/* Text input */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                isListening ? "Listening..." : "Type or speak your question..."
              }
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
              disabled={isLoading}
            />

            {/* Send button */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Listening indicator */}
          {isListening && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-500 font-medium">
                Listening... speak now
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── Escalated Banner ──────────────────────────────────────────────────── */}
      {isEscalated && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-4 text-center shrink-0">
          <p className="text-sm text-amber-800 font-medium">
            {escalationEmail
              ? `Your case has been created. A support agent will reach out to you.`
              : "A support agent will be with you shortly."}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            You can close this page. We&apos;ll follow up via email.
          </p>
        </div>
      )}
    </div>
  );
}
