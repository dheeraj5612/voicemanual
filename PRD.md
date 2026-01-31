# VoiceManual -- Product Requirements Document

**Version:** 1.0
**Last updated:** 2026-01-31
**Status:** MVP Definition

---

## 1. Product Vision

VoiceManual is an AI-powered assistant that helps end-customers set up, troubleshoot, and maintain physical products through voice and text interaction. Customers access the assistant by scanning a QR code printed on the product or its packaging, which launches a mobile-first web application.

Every response is grounded in manufacturer-approved content -- product manuals, troubleshooting knowledge bases, warranty policies, and service bulletins. The system never fabricates information. When it cannot resolve a question with high confidence, or when a safety-sensitive scenario is detected, it escalates to human support with a full transcript, SKU context, and source references.

Manufacturers gain an analytics dashboard that surfaces top intents, deflection estimates, unresolved questions, and per-SKU breakdowns to continuously improve both the AI and their documentation.

---

## 2. Users and Buyers

### Primary User: End-Customer

The person who has purchased or received a physical product and needs help setting it up, troubleshooting an issue, understanding warranty coverage, or locating replacement parts. They access VoiceManual by scanning a QR code -- no app install, no login required.

Characteristics:
- Interacting on a mobile device in most cases
- May be non-technical; clarity and simplicity are critical
- Often frustrated or time-pressured (product is not working)
- May prefer voice interaction (hands-on with the product) or text (quiet environment)

### Buyer: Support/CX Leader at a Hardware Brand

The decision-maker who purchases VoiceManual on behalf of a manufacturer. Initially targeting direct-to-consumer (D2C) hardware brands where the brand controls the support experience end-to-end.

Characteristics:
- Measured on ticket volume, handle time, customer satisfaction (CSAT), and return rate
- Wants demonstrable ROI within the first pilot period
- Needs confidence that the AI will not create liability (incorrect safety guidance, false warranty claims)
- Requires analytics to justify continued investment

---

## 3. Top Outcomes

| # | Outcome | Measurable Target (Pilot) |
|---|---------|--------------------------|
| 1 | **Reduce support tickets and handle time** | 20-30% contact deflection during pilot; measurable ticket reduction in partner reporting |
| 2 | **Improve first-time setup success** | Higher session completion rate for setup-category questions; fewer repeat contacts within 48 hours |
| 3 | **Reduce returns via "before you return" flow** | Measurable return-prevention conversion -- sessions that begin with return intent and end resolved |

---

## 4. Non-Negotiables

These properties must hold true in every release. They are not features to be prioritized; they are constraints the system must satisfy at all times.

### 4.1 No Hallucinations

The system answers only from approved, ingested sources. Every document-based claim in a response must carry a citation (document name, page number, section). If the retrieval pipeline cannot find relevant content, the system must say so and either ask a clarifying question or escalate. The acceptable hallucination rate is effectively zero.

### 4.2 SKU-Aware

The QR code encodes brand, product, SKU, region, language, and optionally firmware version. The retrieval and answering pipelines must filter strictly by these parameters. A customer scanning the QR on Model X must never receive instructions from Model Y's manual. Cross-SKU leakage is treated as a severity-1 defect.

### 4.3 Safe Escalation

When the system has low confidence, encounters conflicting sources, detects safety-sensitive content (electrical, gas, fire, sharp tools, medical, child safety, warranty-voiding procedures), or the customer explicitly requests a human, it must escalate. Escalation creates a case record containing the full transcript, SKU details, retrieval sources used, steps already tried, and the customer's contact information.

---

## 5. MVP Scope (8-12 Weeks)

### 5.1 In Scope

**QR-to-Web-App Flow**
- QR code encodes deep link with parameters: `brand_id`, `product_id`, `sku`, `region`, `language`, `firmware`
- Scanning opens a mobile-first web application (no install) with the correct product context pre-loaded
- Product name, model, and brand displayed immediately upon load

**Text Chat + Optional Voice I/O**
- Text input as the primary interaction mode
- Optional voice input via Web Speech API (browser-native STT)
- Optional voice output via ElevenLabs TTS
- Graceful degradation if voice APIs are unavailable

**Knowledge Ingestion**
- Ingest PDF product manuals with page-number preservation
- Ingest troubleshooting knowledge base articles (HTML/markdown)
- Ingest warranty policy documents
- Ingest service bulletins
- Heading-aware chunking (200-500 tokens, 50-100 token overlap, no splits inside numbered steps or warning blocks)
- Versioned knowledge packages per product/SKU

**Retrieval-Grounded Responses with Citations**
- Hybrid retrieval: keyword search + vector similarity
- Filtering by product, SKU, region, language, document version
- Every response includes: brief answer summary, numbered steps (when applicable), citations (document name, page, section), optional warnings, and suggested next questions
- Confidence score attached to every response

**Safe Fallback + Escalation**
- Insufficient retrieval evidence triggers "I can't confirm" response with clarifying questions
- Safety-sensitive categories trigger visible warning + forced escalation
- Customer can request human help at any time
- Escalation captures: customer email, issue category, full transcript, steps tried, retrieval sources

**Basic Analytics Dashboard**
- Top intents by frequency
- Deflection estimate (sessions resolved without escalation)
- Unresolved questions (low confidence or escalated)
- Per-SKU filtering
- Scan-to-session conversion rate

### 5.2 Out of Scope for MVP

- Full brand voice cloning (custom TTS voice training per brand)
- On-device integration (embedded SDK in product firmware)
- Multi-channel delivery (SMS, WhatsApp, RCS)
- Complex CRM workflow integrations (Salesforce, HubSpot pipelines)
- Multi-language support beyond the language encoded in the QR code
- Customer authentication or account linking
- In-app payments or upsell flows

---

## 6. Functional Requirements

### 6.1 QR Deep Link

The QR code URL encodes the following parameters:

| Parameter | Required | Example |
|-----------|----------|---------|
| `brand_id` | Yes | `acme-corp` |
| `product_id` | Yes | `smart-thermostat` |
| `sku` | Yes | `ST-2000-US` |
| `region` | Yes | `us` |
| `language` | Yes | `en` |
| `firmware` | No | `2.1.4` |

The web app must validate all required parameters on load and display a clear error if any are missing or unrecognized.

### 6.2 Text and Voice Input

- Text input: standard chat input field, submit on enter or button press
- Voice input: tap-to-speak button, uses Web Speech API `SpeechRecognition`, displays interim transcript, submits on silence detection
- Input validation: Zod schema validation on all API requests, max message length enforced

### 6.3 Structured Response Format

Every AI response follows a strict JSON schema:

```json
{
  "answerSummary": "Brief plain-language answer",
  "steps": [
    {
      "order": 1,
      "text": "Step instruction text",
      "warning": "Optional safety warning for this step"
    }
  ],
  "citations": [
    {
      "documentId": "doc_abc123",
      "documentTitle": "Smart Thermostat ST-2000 User Manual",
      "page": 14,
      "section": "Initial Setup > Wi-Fi Configuration"
    }
  ],
  "warnings": ["General safety warnings if applicable"],
  "confidence": 0.95,
  "nextQuestions": ["Suggested follow-up questions"],
  "escalationRecommended": false
}
```

The UI renders this as:
- Answer summary at the top
- Expandable step-by-step accordion
- Expandable citation list (document name + page)
- Warning banners (if present)
- Quick-reply buttons for suggested next questions
- "Did this resolve your issue?" yes/no prompt

### 6.4 Safety Triggers

The following categories trigger a visible warning banner and forced escalation:

| Category | Examples |
|----------|----------|
| Electrical | Wiring, voltage, circuit breaker, grounding |
| Gas/Fire | Gas lines, pilot light, combustion, flammable materials |
| Sharp Tools | Blade replacement, cutting mechanisms |
| Medical | Health-related product use, injury risk |
| Child Safety | Child lock, small parts, choking hazard |
| Warranty-Voiding | Procedures that void manufacturer warranty |

When a safety trigger fires, the system must:
1. Display a warning banner to the customer
2. Recommend professional assistance
3. Force escalation to human support
4. Log the trigger event for analytics

### 6.5 Escalation Case Creation

When escalation occurs (safety trigger, low confidence, customer request), the system creates a case containing:

- Customer email (collected via prompt)
- Issue category (auto-detected or customer-selected)
- Full conversation transcript
- SKU and product details
- Retrieval sources consulted
- Steps already tried
- Confidence score at time of escalation
- Optional: customer-uploaded photo of the issue

MVP delivery: case stored in database + email webhook notification to support team. Future: Zendesk, Freshdesk, Intercom integrations.

### 6.6 Quick Action Buttons

The chat interface presents quick-start buttons on session load:

- **Setup** -- "Help me set up this product"
- **Troubleshoot** -- "Something is not working"
- **Parts** -- "I need part numbers or specifications"
- **Warranty** -- "Questions about my warranty"
- **Contact** -- "I want to speak with a human"

---

## 7. Quality Requirements

| Attribute | Target |
|-----------|--------|
| Availability | 99.9% uptime (excludes scheduled maintenance) |
| Response time (text) | P95 < 2.5 seconds end-to-end |
| Citation coverage | 0% uncited document-based answers |
| Hallucination rate | Effectively 0% (golden-set regression enforced) |
| Observability | Every response logs: retrieval set, prompt version, model version, confidence score |
| Data retention | Session data retained for 90 days (configurable per brand) |
| Security | HTTPS only, no PII in URLs, API keys server-side only |

---

## 8. Metrics

### Customer-Facing Metrics

| Metric | Definition |
|--------|------------|
| QR scan-to-session rate | % of QR scans that result in at least one message sent |
| Resolution rate | % of sessions where customer confirms issue resolved |
| Escalation rate | % of sessions that escalate to human support |
| Repeat contact rate | % of customers who start a new session within 48 hours for the same product |
| Time to resolution | Median time from first message to "resolved" confirmation |

### Business Metrics

| Metric | Definition |
|--------|------------|
| Deflection estimate | Sessions resolved without escalation / total sessions |
| Return-prevention conversion | Sessions starting with return intent that end resolved |
| Top unresolved questions | Questions with low confidence or escalation, ranked by frequency |
| Ticket reduction | Delta in support ticket volume before/after pilot (partner-reported) |

### Operational Metrics

| Metric | Definition |
|--------|------------|
| Per-SKU breakdown | All above metrics filterable by SKU |
| Retrieval hit rate | % of questions where retrieval returns at least one chunk above similarity threshold |
| Safety trigger frequency | Count and category of safety trigger events |
| Model latency | P50, P95, P99 response times for AI inference |

---

## 9. Pilot Plan

### Scope

- **1 brand partner** (D2C hardware company)
- **1-3 SKUs** within a single product line
- **3 document types** per SKU: product manual, troubleshooting knowledge base, warranty policy

### Duration

- 4 weeks of active pilot after MVP deployment
- Weekly check-ins with brand partner
- Daily monitoring of safety triggers and escalation patterns

### Success Criteria

| Criterion | Threshold |
|-----------|-----------|
| Contact deflection | 20-30% of sessions resolved without human contact |
| Ticket reduction | Measurable decrease in support tickets for pilot SKUs (partner-reported) |
| Zero unsafe hallucinations | No fabricated safety instructions, part numbers, torque values, or warranty terms during entire pilot |
| Customer satisfaction | Positive or neutral feedback on > 70% of rated sessions |
| Response quality | Golden-set regression tests pass on every deployment |

### Data Collection

- All sessions recorded (transcript, retrieval sets, confidence scores, outcomes)
- Weekly export of unresolved questions for manual review
- Safety trigger events reviewed within 24 hours
- Customer feedback collected via post-session "Was this helpful?" prompt

### Exit Criteria for Scaling

- Pilot success criteria met for 3 consecutive weeks
- No severity-1 defects (cross-SKU leakage, unsafe hallucination, data breach) during pilot
- Brand partner confirms willingness to expand to additional SKUs
- Analytics dashboard provides actionable insights (at least 3 documentation improvements identified)

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hallucinated safety instructions | Low | Critical | Strict RAG with citation enforcement; safety keyword blocklist; golden-set regression tests |
| Cross-SKU content leakage | Medium | High | Mandatory SKU filtering at retrieval layer; acceptance tests per SKU boundary |
| Poor PDF parsing quality | Medium | Medium | Manual QA of ingested chunks; fallback to manual text entry; iterative parser improvements |
| Low QR scan adoption | Medium | Medium | QR placement guidance for brand partner; fallback URL entry; onboarding instructions |
| High escalation rate | Medium | Low | Iterative prompt tuning; expand knowledge base based on unresolved questions |
| Voice recognition errors | Medium | Low | Text input as primary mode; voice as progressive enhancement; retry prompts |

---

## 11. Future Roadmap (Post-MVP)

These items are explicitly out of scope for the MVP but represent the intended evolution:

1. **Multi-channel delivery** -- SMS, WhatsApp, RCS as additional entry points beyond QR web app
2. **CRM integrations** -- Native Zendesk, Freshdesk, Intercom connectors for escalation
3. **Brand voice cloning** -- Custom TTS voice training per brand
4. **Visual troubleshooting** -- Customer uploads photo, AI identifies product state and guides next steps
5. **Multi-language expansion** -- Dynamic language detection and response in customer's preferred language
6. **Proactive notifications** -- Service bulletins and firmware updates pushed to customers who previously scanned
7. **Self-service returns** -- Integrated return flow that attempts resolution before generating return label
8. **On-device SDK** -- Embedded assistant in product companion apps or firmware
