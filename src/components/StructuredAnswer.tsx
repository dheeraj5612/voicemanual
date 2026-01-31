"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Phone,
} from "lucide-react";
import type { StructuredResponse } from "@/types";

interface StructuredAnswerProps {
  response: StructuredResponse;
  onSolved: () => void;
  onNotSolved: () => void;
  onFollowUp: (question: string) => void;
  onEscalate: () => void;
}

export default function StructuredAnswer({
  response,
  onSolved,
  onNotSolved,
  onFollowUp,
  onEscalate,
}: StructuredAnswerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [showCitations, setShowCitations] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<"yes" | "no" | null>(null);

  function toggleStep(order: number) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(order)) {
        next.delete(order);
      } else {
        next.add(order);
      }
      return next;
    });
  }

  function handleSolved() {
    setFeedbackGiven("yes");
    onSolved();
  }

  function handleNotSolved() {
    setFeedbackGiven("no");
    onNotSolved();
  }

  return (
    <div className="space-y-3">
      {/* Answer Summary */}
      <p className="font-semibold text-slate-900 text-sm leading-relaxed">
        {response.answerSummary}
      </p>

      {/* Warnings Banner */}
      {response.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          {response.warnings.map((warning, i) => (
            <div key={i} className="flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">{warning}</p>
            </div>
          ))}
        </div>
      )}

      {/* Steps Accordion */}
      {response.steps.length > 0 && (
        <div className="rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {response.steps.map((step) => {
            const isExpanded = expandedSteps.has(step.order);
            return (
              <div key={step.order}>
                <button
                  onClick={() => toggleStep(step.order)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {step.order}
                  </span>
                  <span className="flex-1 text-sm text-slate-800 font-medium truncate">
                    {step.text}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pl-12">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {step.text}
                    </p>
                    {step.warning && (
                      <div className="mt-2 flex gap-2 items-start rounded-md bg-red-50 border border-red-200 p-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700 font-medium">
                          {step.warning}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Citations */}
      {response.citations.length > 0 && (
        <div>
          <button
            onClick={() => setShowCitations(!showCitations)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>
              {showCitations ? "Hide sources" : `${response.citations.length} source(s)`}
            </span>
            {showCitations ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
          {showCitations && (
            <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2.5 space-y-1.5">
              {response.citations.map((cite, i) => (
                <div key={i} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-700">
                    {cite.documentTitle}
                  </span>
                  <span className="text-slate-400">
                    {" "}
                    &mdash; Page {cite.page}, Section: {cite.section}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confidence indicator */}
      {response.confidence < 0.6 && (
        <p className="text-xs text-amber-600 italic">
          Confidence is low ({Math.round(response.confidence * 100)}%). You may want to
          rephrase your question or contact support.
        </p>
      )}

      {/* Escalation recommendation */}
      {response.escalationRecommended && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <Phone className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-800 font-medium">
              We recommend speaking with a support agent.
            </p>
            {response.escalationReason && (
              <p className="text-xs text-red-600 mt-0.5">
                {response.escalationReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Did this solve your issue? */}
      {feedbackGiven === null && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-2">Did this solve your issue?</p>
          <div className="flex gap-2">
            <button
              onClick={handleSolved}
              className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Yes
            </button>
            <button
              onClick={handleNotSolved}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              No
            </button>
          </div>
        </div>
      )}

      {/* Solved confirmation */}
      {feedbackGiven === "yes" && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-xs text-green-700 font-medium">
            Great, glad we could help!
          </p>
        </div>
      )}

      {/* Not solved — follow-up suggestions */}
      {feedbackGiven === "no" && (
        <div className="space-y-2 pt-1">
          {response.nextQuestions.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1.5">
                Try one of these follow-ups:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {response.nextQuestions.slice(0, 3).map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onFollowUp(q)}
                    className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={onEscalate}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            Talk to a person
          </button>
        </div>
      )}
    </div>
  );
}
