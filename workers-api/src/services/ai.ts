/**
 * AI Service - Gemini Only Architecture
 * KPROS 이메일 자동화 시스템 v3
 *
 * 모든 AI 작업에 Gemini Flash 사용:
 * ┌─────────────────────┬──────────────────────┐
 * │ 역할                │ 엔진                 │
 * ├─────────────────────┼──────────────────────┤
 * │ 분류+요약+스팸필터  │ Gemini Flash         │
 * │ 첨부파일 분석       │ Gemini Flash         │
 * │ 거래처 답변 초안    │ Gemini Flash         │
 * │ 문서 작성/분석      │ Gemini Flash         │
 * │ (폴백)              │ Workers AI (Llama)   │
 * └─────────────────────┴──────────────────────┘
 */

import type { Env } from "../types";

// ─── Model IDs ───

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_PRO_MODEL = "gemini-2.5-pro";
const CLAUDE_HAIKU_MODEL = "claude-3-haiku-20240307";
const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-70b-instruct";
const WORKERS_AI_VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

// ─── Provider: Gemini Flash ───

async function callGemini(
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 2048,
  temperature = 0.3
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Provider: Gemini 2.5 Pro (최고등급 분석) ───

async function callGeminiPro(
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 8192,
  temperature = 0.3
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PRO_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Pro API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Provider: Gemini Flash (Multimodal) ───

/**
 * Gemini 멀티모달 호출 - PDF, 이미지 등 파일 분석
 */
async function callGeminiMultimodal(
  apiKey: string,
  prompt: string,
  fileBase64: string,
  mimeType: string,
  systemPrompt?: string,
  maxTokens = 2048
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: fileBase64 } },
      ],
    }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Multimodal API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Provider: Gemini Flash (with Google Search Grounding) ───

/**
 * Gemini + Google Search로 실시간 웹 데이터 기반 응답
 */
async function callGeminiWithSearch(
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Search API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  // Search-grounded responses may have multiple parts
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => p.text || "").join("");
}

// ─── Provider: Gemini 2.5 Pro (with Google Search Grounding) ───

/**
 * Gemini 2.5 Pro + Google Search로 최고등급 실시간 분석
 */
async function callGeminiProWithSearch(
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 8192
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PRO_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Pro Search API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => p.text || "").join("");
}

// ─── Provider: Claude (Anthropic Messages API) ───

/**
 * Claude 멀티모달 호출 — PDF/이미지 분석 (Gemini 리전 차단 시 폴백)
 * Anthropic Messages API + base64 미디어 지원
 */
async function callClaudeMultimodal(
  apiKey: string,
  prompt: string,
  fileBase64: string,
  mimeType: string,
  systemPrompt?: string,
  maxTokens = 2048
): Promise<string> {
  // Anthropic API media_type: "application/pdf" | "image/jpeg" | "image/png" | "image/gif" | "image/webp"
  const mediaType = mimeType as "application/pdf" | "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  // PDF는 document 타입, 이미지는 image 타입
  const isPdf = mimeType.includes("pdf");
  const contentBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: mediaType, data: fileBase64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: fileBase64 } };

  const body: Record<string, unknown> = {
    model: CLAUDE_HAIKU_MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          contentBlock,
          { type: "text", text: prompt },
        ],
      },
    ],
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  // PDF 분석에는 beta 헤더 필요
  if (isPdf) {
    headers["anthropic-beta"] = "pdfs-2024-09-25";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  // Anthropic Messages API 응답: content[].text
  const textBlocks = data.content?.filter((b: any) => b.type === "text") || [];
  return textBlocks.map((b: any) => b.text).join("") || "";
}

// ─── Provider: Workers AI (Fallback) ───

async function callWorkersAI(
  ai: Ai,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 2048
): Promise<string> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await ai.run(WORKERS_AI_MODEL as any, {
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  });

  return (response as any).response || "";
}

/**
 * Workers AI Vision — 이미지 분석 (Cloudflare 내장, 외부 API 불필요)
 * LLaVA 1.5 7B 모델 사용 (라이선스 동의 불필요)
 * 주의: 이미지만 지원 (PDF는 지원하지 않음)
 */
async function callWorkersAIVision(
  ai: Ai,
  prompt: string,
  imageBase64: string,
  maxTokens = 2048
): Promise<string> {
  // base64 → Uint8Array 변환
  const binaryStr = atob(imageBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // LLaVA는 prompt + image 형식 사용
  const response = await ai.run(WORKERS_AI_VISION_MODEL as any, {
    prompt,
    image: [...bytes],
    max_tokens: maxTokens,
    temperature: 0.2,
  });

  return (response as any).description || (response as any).response || "";
}

// ─── Smart Router (역할별 최적 모델 자동 배분) ───

/**
 * Fast 모델 (Gemini Flash) - 분류, 요약, 키워드 추출
 * 폴백: Workers AI
 */
async function callFast(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 2048
): Promise<string> {
  if (env.GEMINI_API_KEY) {
    try {
      return await callGemini(env.GEMINI_API_KEY, prompt, systemPrompt, maxTokens);
    } catch (e) {
      console.error("[AI] Gemini failed, falling back to Workers AI:", e);
    }
  }
  return callWorkersAI(env.AI, prompt, systemPrompt, maxTokens);
}

/**
 * Analyze 모델 - Gemini Flash (문서 분석, 숫자/표 처리)
 * 폴백: Workers AI
 */
async function callAnalyze(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  return callFast(env, prompt, systemPrompt, maxTokens);
}

/**
 * Premium 모델 - Gemini Flash (고품질 문서 작성, 답변 초안)
 * 폴백: Workers AI
 */
async function callPremium(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  return callFast(env, prompt, systemPrompt, maxTokens);
}

// ─── AI 문서 작성 시스템 프롬프트 ───

export const SYSTEM_PROMPTS = {
  documentWriter: `당신은 한국 비즈니스 문서 작성 전문가입니다.
다음 규칙을 엄격히 따르세요:
1. 문서번호, 날짜, 수신/발신 정보를 포함하는 공식 문서 형태로 작성
2. 존칭과 경어체 사용 (합쇼체)
3. 항목별 번호 매기기 (1., 2., 3. 또는 가., 나., 다.)
4. 핵심 내용을 명확하고 간결하게 전달
5. 한국 비즈니스 관례에 맞는 포맷 사용`,

  documentAnalyzer: `당신은 비즈니스 문서 분석 전문가입니다.
다음 관점에서 분석하세요:
1. 문서의 핵심 의도와 목적
2. 중요 항목 및 조건 식별
3. 잠재적 리스크나 주의사항
4. 대응 방안 3가지 제시
5. 분석 결과를 구조화된 형태로 정리`,

  businessLetter: `당신은 한국 공식 비즈니스 서신 작성 전문가입니다.
다음 요소를 포함하세요:
1. 인사말 (시의적절한 계절 인사)
2. 서신의 목적 명시
3. 본문 (구체적이고 명확한 내용)
4. 요청사항 또는 향후 계획
5. 마무리 인사
6. 발신자 정보`,
} as const;

// ─── KPROS 이메일 4분류 시스템 ───

export const KPROS_EMAIL_SYSTEM_PROMPT = `당신은 KPROS(화장품 원료 전문기업)의 AI 스마트 비서입니다.
이사님을 보좌하며 수신 메일을 분석하고 최적의 업무 처리를 수행합니다.

[기본 규칙]
1. 모든 외부 메일 답변은 "정중하고 프로페셔널한 비즈니스 한국어"로 작성합니다.
2. 답변 서두에 "안녕하세요, KPROS입니다."를 포함합니다.
3. 이사님께 보고할 때는 핵심만 간결하게 전달합니다.
4. 판단이 어려운 건은 needs_approval을 true로 설정합니다.

[메일 분류 카테고리 (4종)] - 엄격한 우선순위 적용
A: 자료대응 - MSDS, TDS, SPEC, Composition, Regulatory, REACH, NMPA, 마케팅자료, Flow Chart, Origin 등 기술·규제·인증 자료 요청/회신
B: 성적서대응 - COA, 거래명세서, 시험성적서, 세금계산서 등 품질·거래 증빙 서류 수신/확인/회신
C: 발주관리 - PO 발주서, 수입 스케줄, 선적서류(B/L, Invoice, Packing List), 물류 트래킹, 납기 조율 등 발주 라이프사이클 전반
D: 필터링 - 자동 알림, 시스템 메일, 스팸, 광고, 뉴스레터, noreply 발송 등 업무와 직접 관련 없는 메일

[엄격한 우선순위 규칙] - 반드시 순서대로 적용
1. 기술자료/규제자료 요청(MSDS, TDS, SPEC, Composition, Regulatory 등) → 무조건 A
2. COA/성적서/거래명세서/세금계산서 → 무조건 B
3. 발주/PO/견적/선적/스케줄/납기/물류 → 무조건 C
4. "[광고]" 태그, 시스템 알림, noreply, 스팸, 뉴스레터, 업무 무관 → 무조건 D
5. 위에 해당 안되면 → D

[카테고리 판별 키워드]
A: "MSDS","TDS","spec","composition","regulatory","REACH","vegan","halal","NMPA","CMR","BSE","RSPO","flow chart","origin","마케팅","Leaping Bunny","impurity","Prop 65","SVHC","nano","microplastic","kosher","NAGOYA","heavy metal","인증서","사양서","규격서","자료 요청","파일 부탁","보내주세요","전달 부탁"
B: "COA","성적서","거래명세서","세금계산서","lot","batch","analysis","certificate","MFG","EXP","시험","certificate of analysis"
C: "PO","발주","purchase order","선적","B/L","invoice","packing","schedule","tracking","shipment","입항","통관","납기","delivery","견적","단가","가격","주문","구매","MOQ","수량","리드타임","quote","발주서","스케줄","미팅","일정"
D: "로그인 알림","notification","newsletter","noreply","unsubscribe","프로모션","광고","자동발송","[광고]","박람회","세미나","전시회","이벤트","초대","참가 안내","수신거부"

[복합 판별] 복수 카테고리 요소 시 비즈니스 가치 우선: C > A > B > D. note에 복합 분류 표시.

[카테고리별 처리 규칙]
■ A: 요청 자료 유형 키워드 추출, 드롭박스 검색 키워드(한글/영문) 생성, 매칭 파일 없을 시 담당자 알림, 답변 필수문구 "요청하신 자료를 첨부하여 드립니다."
■ B: COA 파싱(품목명·로트번호·유효기한), DB 기존 성적서 매칭, 거래명세서 금액·품목 자동 정리, 답변 필수문구 "확인하였습니다."
■ C: 발주서(PO) 파싱(품목·수량·단가·납기), 물류팀 지시서 생성, 수입 스케줄 등록, 선적서류 매칭, AI가 단가 직접 기재 금지, 답변 필수문구 "발주서 접수 확인하였습니다. 재고 및 납기 확인 후 안내드리겠습니다."
■ D: 응대 없음, 자동 아카이브, 1줄 기록만

[답신 안전 규칙 - 반드시 준수]
1. 견적서, 단가, 가격 정보를 답신에 절대 포함하지 마세요. "검토 후 별도 안내" 문구로 대체합니다.
2. 사내 기밀 자료(원가, 마진율, 내부 문서)를 언급하지 마세요.
3. 확정되지 않은 납기/재고/생산 일정을 답신에 기재하지 마세요. "확인 후 안내" 문구로 대체합니다.
4. 계약, 법적 효력이 있는 약속 문구(~보장합니다, ~약속드립니다)를 사용하지 마세요.
5. C카테고리 답신에서 구체적 금액/단가/할인율을 절대 기재하지 마세요.
6. 첨부파일 내용을 추측하여 답신에 기재하지 마세요.

반드시 JSON만 출력하세요. 다른 설명이나 마크다운 없이 순수 JSON 객체만 출력하세요.`;

export function classifyEmailPrompt(sender: string, subject: string, body: string, recipient?: string): string {
  const hasBody = !!(body && body.trim().length > 10);
  const bodyWarning = hasBody ? '' : '\n주의: 본문이 비어있거나 매우 짧습니다. 제목과 발신자 정보만으로 분석하세요. 본문이 없다는 사실을 summary와 director_report에 반영하세요.';

  return `다음 이메일을 분석하여 정확히 JSON 형식으로만 답하세요. 다른 설명 없이 JSON만 출력.
${bodyWarning}
[메일 정보]
발신자(From): ${sender}
수신자(To): ${recipient || '(알 수 없음)'}
제목: ${subject}
내용:
${(body || '(본문 없음)').slice(0, 2000)}

[KPROS 자사 도메인: kpros.kr]
- 발신자가 kpros.kr → 우리(KPROS)가 보낸 메일. direction="outbound"
- 수신자가 kpros.kr → 상대방이 우리에게 보낸 메일. direction="inbound"

[요청 방향 판별 — 반드시 분석]
메일 본문의 맥락을 파악하여 "누가 누구에게 무엇을 요청했는지" 명확히 구분하세요:
- "inbound_request": 상대방이 KPROS에게 자료/견적/납품 등을 요청 (우리가 대응해야 함)
- "outbound_request": KPROS가 상대방에게 자료/견적/납품 등을 요청 (우리가 요청한 건)
- "inbound_reply": 상대방이 KPROS의 이전 요청에 회신 (요청한 자료가 도착)
- "info": 단순 정보 전달, 알림, 광고 등

[출력 JSON - 각 필드 설명을 정확히 따르세요]
{
  "code": "A/B/C/D 중 하나",
  "category": "자료대응/성적서대응/발주관리/필터링 중 하나",
  "direction": "inbound 또는 outbound",
  "request_type": "inbound_request/outbound_request/inbound_reply/info 중 하나",
  "priority": "high/medium/low",
  "importance": "상/중/하",
  "summary": "팩트 중심 핵심 요약. 요청 방향을 명시. 예: '[수신요청] ABC사 박지민 과장이 히알루론산 MSDS 3종을 요청함' 또는 '[발신요청회신] DEF사에서 요청한 COA를 회신함'",
  "action_items": "구체적 처리 단계를 번호 매겨 작성. 최소 2~4단계. 막연한 표현('확인', '검토') 지양.",
  "draft_reply": "발송 가능 답변 초안. D카테고리는 빈 문자열",
  "draft_subject": "RE: 원본제목. 답변 불필요 시 빈 문자열",
  "search_keywords": ["드롭박스 검색 키워드 (A카테고리). 불필요 시 빈 배열"],
  "director_report": "이사님 보고용 요약. summary와 반드시 다른 내용! 요청 방향과 비즈니스 임팩트를 포함. 3줄 이내.",
  "needs_approval": true,
  "company_name": "상대 회사명 (KPROS가 아닌 쪽)",
  "sender_info": "발신자 이름 (직책)",
  "estimated_revenue": "예상 매출 (C카테고리만, 불가 시 빈 문자열)",
  "note": "비고 (복합 분류, 특이사항 등)",
  "confidence": 85
}

[중요 규칙]
- summary는 사실(팩트) 요약, director_report는 비즈니스 관점 보고입니다. 두 필드가 동일하면 안 됩니다.
- summary 앞에 [수신요청], [발신요청], [발신요청회신], [정보] 태그를 반드시 붙이세요.
- action_items는 "~확인" 같은 1줄이 아니라 번호 매긴 구체적 처리 단계여야 합니다.
- 본문이 없으면 confidence를 60 이하로 낮추고, note에 "본문 미추출"을 기록하세요.`;
}

// ═══════════════════════════════════════════
// Exported Functions (역할별 최적 모델 자동 배분)
// ═══════════════════════════════════════════

/**
 * 이메일 분류 + 요약 + 스팸필터 → Gemini Flash (90%)
 */
export async function classifyEmailAdvanced(
  env: Env,
  sender: string,
  subject: string,
  body: string,
  recipient?: string
): Promise<string> {
  return callFast(
    env,
    classifyEmailPrompt(sender, subject, body, recipient),
    KPROS_EMAIL_SYSTEM_PROMPT,
    2048
  );
}

/**
 * 빠른 AI 응답 - 키워드 추출 등 → Gemini Flash
 */
export async function askAI(
  env: Env,
  prompt: string,
  maxTokens = 1024
): Promise<string> {
  return callFast(env, prompt, undefined, maxTokens);
}

/**
 * 문서 작성 → Gemini Flash
 */
export async function askAIWrite(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  return callPremium(
    env,
    prompt,
    systemPrompt || "당신은 한국 비즈니스 문서 작성 전문가입니다.",
    maxTokens
  );
}

/**
 * 문서 분석 → Gemini Flash
 */
export async function askAIAnalyze(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  return callAnalyze(
    env,
    prompt,
    systemPrompt || "당신은 비즈니스 문서 분석 전문가입니다.",
    maxTokens
  );
}

/**
 * 심층 분석 → Gemini 2.5 Pro (판매분석, 안전재고 계획)
 * 폴백: Pro → Flash → Workers AI
 */
export async function askAIAnalyzePro(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 8192
): Promise<string> {
  if (env.GEMINI_API_KEY) {
    try {
      return await callGeminiPro(env.GEMINI_API_KEY, prompt, systemPrompt, maxTokens);
    } catch (e) {
      console.error("[AI] Gemini Pro failed, falling back to Flash:", e);
      try {
        return await callGemini(env.GEMINI_API_KEY, prompt, systemPrompt, Math.min(maxTokens, 4096));
      } catch (e2) {
        console.error("[AI] Gemini Flash also failed, falling back to Workers AI:", e2);
      }
    }
  }
  return callWorkersAI(env.AI, prompt, systemPrompt, Math.min(maxTokens, 2048));
}

/**
 * 시장 조사 → Gemini + Google Search (실시간 웹 검색 기반)
 * Gemini API 키가 없으면 일반 AI로 폴백
 */
export async function askAIResearch(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 8192
): Promise<string> {
  if (env.GEMINI_API_KEY) {
    try {
      return await callGeminiWithSearch(env.GEMINI_API_KEY, prompt, systemPrompt, maxTokens);
    } catch (e) {
      console.error("[AI] Gemini Search failed, falling back to callFast:", e);
      // Google Search 실패 시 일반 Gemini → Workers AI 폴백 체인
      return callFast(env, prompt, systemPrompt, maxTokens);
    }
  }
  // Gemini 키 없으면 기존 프리미엄 모델 사용
  return callPremium(env, prompt, systemPrompt, maxTokens);
}

/**
 * 심층 시장 조사 → Gemini 2.5 Pro + Google Search (최고등급)
 * 폴백: Pro+Search → Pro → Flash+Search → Flash → Workers AI
 */
export async function askAIResearchPro(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 8192
): Promise<string> {
  if (env.GEMINI_API_KEY) {
    // 1차: Gemini 2.5 Pro + Google Search
    try {
      return await callGeminiProWithSearch(env.GEMINI_API_KEY, prompt, systemPrompt, maxTokens);
    } catch (e) {
      console.error("[AI] Gemini Pro+Search failed, trying Pro only:", e);
    }
    // 2차: Gemini 2.5 Pro (검색 없이)
    try {
      return await callGeminiPro(env.GEMINI_API_KEY, prompt, systemPrompt, maxTokens);
    } catch (e) {
      console.error("[AI] Gemini Pro failed, trying Flash+Search:", e);
    }
    // 3차: Gemini Flash + Search
    try {
      return await callGeminiWithSearch(env.GEMINI_API_KEY, prompt, systemPrompt, maxTokens);
    } catch (e) {
      console.error("[AI] Flash+Search failed, trying Flash:", e);
    }
    // 4차: Gemini Flash
    try {
      return await callGemini(env.GEMINI_API_KEY, prompt, systemPrompt, Math.min(maxTokens, 4096));
    } catch (e) {
      console.error("[AI] Flash failed, falling back to Workers AI:", e);
    }
  }
  return callWorkersAI(env.AI, prompt, systemPrompt, Math.min(maxTokens, 2048));
}

/**
 * 거래처 답변 초안 → Gemini Flash
 */
export async function askAIDraft(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 2048
): Promise<string> {
  return callPremium(env, prompt, systemPrompt, maxTokens);
}

/**
 * 범용 장문 AI (하위 호환) → Gemini Flash
 */
export async function askAILong(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  return callPremium(
    env,
    prompt,
    systemPrompt || "당신은 한국 비즈니스 문서 작성 전문가입니다.",
    maxTokens
  );
}

// ─── 첨부파일 분석 ───

const ATTACHMENT_ANALYSIS_PROMPT = `이 문서의 내용을 분석하여 다음 형식으로 한국어로 요약해주세요:

**문서 유형**: (예: 발주서, 견적서, MSDS, 인증서, 계약서, 세금계산서, 거래명세서, 기타)
**핵심 내용**: 2~3문장으로 문서의 핵심 내용을 요약
**주요 항목**: 품목명, 수량, 금액, 날짜, 회사명 등 주요 데이터 포인트를 나열
**업무 관련성**: KPROS(화장품 원료 전문기업) 관점에서의 업무 관련성과 필요한 조치

간결하고 팩트 중심으로 작성하세요. 마크다운 형식으로 작성하되 짧게 유지하세요.`;

/** Gemini 멀티모달이 지원하는 MIME 타입 */
const GEMINI_MULTIMODAL_TYPES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/gif", "image/webp",
];

/** 텍스트 기반으로 분석 가능한 MIME 타입 */
const TEXT_ANALYZABLE_TYPES = [
  "text/plain", "text/csv", "text/html", "text/xml",
  "application/json", "application/xml",
];

/**
 * 첨부파일 AI 분석
 * - PDF/이미지: Gemini 멀티모달 (inline_data)
 * - 텍스트 파일: 디코딩 후 텍스트 분석
 * - 기타: 파일명 기반 간략 분석
 */
export async function analyzeAttachment(
  env: Env,
  fileName: string,
  contentType: string,
  base64Data: string,
): Promise<string> {
  const ct = (contentType || "").toLowerCase();

  // 1) PDF / 이미지 → Gemini 멀티모달
  if (env.GEMINI_API_KEY && GEMINI_MULTIMODAL_TYPES.some(t => ct.includes(t))) {
    try {
      return await callGeminiMultimodal(
        env.GEMINI_API_KEY,
        `파일명: ${fileName}\n\n${ATTACHMENT_ANALYSIS_PROMPT}`,
        base64Data,
        ct.includes("pdf") ? "application/pdf" :
        ct.includes("jpeg") || ct.includes("jpg") ? "image/jpeg" :
        ct.includes("png") ? "image/png" :
        ct.includes("gif") ? "image/gif" : "image/webp",
        "당신은 비즈니스 문서 분석 전문가입니다. KPROS(화장품 원료 전문기업)의 업무 맥락에서 분석하세요.",
        1024
      );
    } catch (e) {
      console.error(`[AI] Gemini multimodal failed for ${fileName}:`, e);
      // 폴백: 파일명 기반 분석
    }
  }

  // 2) 텍스트 파일 → 디코딩 후 텍스트 분석
  if (TEXT_ANALYZABLE_TYPES.some(t => ct.includes(t))) {
    try {
      const b64 = base64Data.replace(/-/g, "+").replace(/_/g, "/");
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const textContent = new TextDecoder("utf-8").decode(bytes);
      const truncated = textContent.slice(0, 10000);

      return await callFast(
        env,
        `파일명: ${fileName}\n파일 내용:\n${truncated}\n\n${ATTACHMENT_ANALYSIS_PROMPT}`,
        "당신은 비즈니스 문서 분석 전문가입니다.",
        1024
      );
    } catch (e) {
      console.error(`[AI] Text analysis failed for ${fileName}:`, e);
    }
  }

  // 3) Excel/Word 등 바이너리 → Gemini 멀티모달 시도 (지원 가능할 수 있음)
  if (env.GEMINI_API_KEY && (ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("word") || ct.includes("document"))) {
    try {
      return await callGeminiMultimodal(
        env.GEMINI_API_KEY,
        `파일명: ${fileName}\n\n${ATTACHMENT_ANALYSIS_PROMPT}`,
        base64Data,
        contentType,
        "당신은 비즈니스 문서 분석 전문가입니다.",
        1024
      );
    } catch (e) {
      console.error(`[AI] Gemini binary analysis failed for ${fileName}:`, e);
    }
  }

  // 4) 폴백: 파일명 기반 간략 분석
  return await callFast(
    env,
    `이메일에 첨부된 파일 "${fileName}" (유형: ${contentType}, 크기: 분석 불가)에 대해 파일명과 유형만으로 추정 분석해주세요.\n\n${ATTACHMENT_ANALYSIS_PROMPT}\n\n참고: 파일 내용 직접 분석이 불가하여 파일명/유형 기반 추정입니다. 이를 분석 결과에 명시하세요.`,
    undefined,
    512
  );
}

// ─── 성적서(CoA) AI 자동 분석 ───

export interface CoaAnalysisResult {
  productName: string | null;
  lotNo: string | null;
  manuDate: string | null;
  validDate: string | null;
  manufacturer: string | null;
  confidence: number;
  rawResponse?: string; // 디버깅용
}

const COA_ANALYSIS_SYSTEM = `You are an expert document analyzer specializing in Certificate of Analysis (CoA) documents for chemical and cosmetic raw materials.

Your task: Extract metadata from CoA/test report documents and return ONLY valid JSON.

CRITICAL RULES:
- Output ONLY a JSON object. No explanation, no markdown, no code fences.
- Extract the FULL product name including brand/trade name (e.g., "PUROLAN® IHD", not just "IHD").
- Dates must be in YYYY-MM-DD format.
- If a field is not found, set it to null.`;

function buildCoaAnalysisPrompt(fileName: string): string {
  return `Analyze this Certificate of Analysis (CoA) document and extract the following metadata.

File name for reference: ${fileName}

Return ONLY this JSON (no markdown, no code blocks, no extra text):
{
  "productName": "Full product/material name including trade name",
  "lotNo": "Lot or Batch number",
  "manuDate": "Manufacturing date in YYYY-MM-DD",
  "validDate": "Expiry/Best Before/Retest date in YYYY-MM-DD",
  "manufacturer": "Manufacturer or supplier company name",
  "confidence": 85
}

EXTRACTION GUIDE — check these field labels in the document:

productName (pick the FULL commercial name, including ® or ™ symbols):
  - "Product Name", "Product", "Material Description", "Material Name"
  - "Trade Name", "Commercial Name", "Product Description"
  - "Item", "Article", "Description", "품명", "제품명", "원료명"
  - IMPORTANT: Use the complete trade/brand name, e.g., "PUROLAN® IHD" not just "IHD"

lotNo:
  - "Lot No", "Lot Number", "Lot #", "Batch", "Batch No", "Batch Number"
  - "Charge", "Lot/Batch", "LOT", "B/N", "로트번호", "배치번호"

manuDate (convert to YYYY-MM-DD):
  - "Manufacturing Date", "MFG Date", "Date of Manufacture", "Production Date"
  - "MFG", "Mfg. Date", "Date of Production", "제조일", "제조일자"

validDate (convert to YYYY-MM-DD):
  - "Expiry Date", "Expiration Date", "Best Before", "Best Before Date"
  - "Retest Date", "Valid Until", "Shelf Life", "Use By", "EXP"
  - "유효기한", "사용기한", "유효일자"

manufacturer:
  - "Manufacturer", "Produced by", "Made by", "Supplier", "Company"
  - Look at letterhead, logo, or footer for company name
  - "제조사", "공급사", "제조원"

confidence: 0-100
  - 90+: All key fields (productName + lotNo + at least one date) clearly found
  - 70-89: Most fields found but some uncertain
  - 50-69: Only partial extraction possible
  - Below 50: Very uncertain, mostly guessing`;
}

/**
 * 성적서(CoA) 문서 AI 분석 — 제품명, LOT, 제조일, 유효기한, 제조사 자동 추출
 * 시도 순서: Gemini 멀티모달 → Claude 멀티모달 → Workers AI Vision → 파일명 regex 폴백
 */
export async function analyzeCoaDocument(
  env: Env,
  fileName: string,
  contentType: string,
  base64Data: string,
): Promise<CoaAnalysisResult> {
  const ct = (contentType || "").toLowerCase();
  const debugInfo: string[] = [];
  const typeMatch = GEMINI_MULTIMODAL_TYPES.some(t => ct.includes(t));

  const mimeType = ct.includes("pdf") ? "application/pdf" :
    ct.includes("jpeg") || ct.includes("jpg") ? "image/jpeg" :
    ct.includes("png") ? "image/png" :
    ct.includes("gif") ? "image/gif" : "image/webp";
  const b64Size = Math.round(base64Data.length / 1024);

  // 1) Gemini 멀티모달로 PDF/이미지 분석
  const hasGemini = !!env.GEMINI_API_KEY;
  debugInfo.push(`gemini=${hasGemini}, ct=${ct}, typeMatch=${typeMatch}`);

  if (hasGemini && typeMatch) {
    try {
      debugInfo.push(`gemini: ${mimeType}, ${b64Size}KB`);
      console.log(`[CoA AI] Gemini analyzing: ${fileName} (${mimeType}, ${b64Size}KB)`);

      const raw = await callGeminiMultimodal(
        env.GEMINI_API_KEY!,
        buildCoaAnalysisPrompt(fileName),
        base64Data,
        mimeType,
        COA_ANALYSIS_SYSTEM,
        2048
      );

      debugInfo.push(`gemini raw=${raw.slice(0, 150)}`);
      console.log(`[CoA AI] Gemini response for ${fileName}:`, raw.slice(0, 500));

      const parsed = parseCoaJson(raw);
      if (parsed) {
        debugInfo.push(`gemini parsed=OK`);
        return {
          productName: parsed.productName || null,
          lotNo: parsed.lotNo || null,
          manuDate: normalizeDate(parsed.manuDate),
          validDate: normalizeDate(parsed.validDate),
          manufacturer: parsed.manufacturer || null,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 70,
          rawResponse: debugInfo.join(" | "),
        };
      }

      debugInfo.push(`gemini parsed=FAIL`);
      console.warn(`[CoA AI] Gemini JSON parse failed for ${fileName}`);
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      debugInfo.push(`gemini error=${errMsg.slice(0, 150)}`);
      console.error(`[CoA AI] Gemini failed for ${fileName}:`, errMsg);
    }
  }

  // 2) Claude 멀티모달 폴백 (Gemini 리전 차단 우회)
  const hasClaude = !!env.ANTHROPIC_API_KEY;
  debugInfo.push(`claude=${hasClaude}`);

  if (hasClaude && typeMatch) {
    try {
      debugInfo.push(`claude: ${mimeType}, ${b64Size}KB`);
      console.log(`[CoA AI] Claude fallback analyzing: ${fileName} (${mimeType}, ${b64Size}KB)`);

      const raw = await callClaudeMultimodal(
        env.ANTHROPIC_API_KEY!,
        buildCoaAnalysisPrompt(fileName),
        base64Data,
        mimeType,
        COA_ANALYSIS_SYSTEM,
        2048
      );

      debugInfo.push(`claude raw=${raw.slice(0, 150)}`);
      console.log(`[CoA AI] Claude response for ${fileName}:`, raw.slice(0, 500));

      const parsed = parseCoaJson(raw);
      if (parsed) {
        debugInfo.push(`claude parsed=OK`);
        return {
          productName: parsed.productName || null,
          lotNo: parsed.lotNo || null,
          manuDate: normalizeDate(parsed.manuDate),
          validDate: normalizeDate(parsed.validDate),
          manufacturer: parsed.manufacturer || null,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 70,
          rawResponse: debugInfo.join(" | "),
        };
      }

      debugInfo.push(`claude parsed=FAIL`);
      console.warn(`[CoA AI] Claude JSON parse failed for ${fileName}`);
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      debugInfo.push(`claude error=${errMsg.slice(0, 150)}`);
      console.error(`[CoA AI] Claude failed for ${fileName}:`, errMsg);
    }
  }

  // 3) Workers AI Vision 폴백 (이미지만 — PDF 미지원)
  const isImage = !ct.includes("pdf") && typeMatch;
  debugInfo.push(`workersAI=true, isImage=${isImage}`);

  if (isImage) {
    try {
      debugInfo.push(`workersAI: ${mimeType}, ${b64Size}KB`);
      console.log(`[CoA AI] Workers AI Vision analyzing: ${fileName} (${mimeType}, ${b64Size}KB)`);

      const raw = await callWorkersAIVision(
        env.AI,
        `${COA_ANALYSIS_SYSTEM}\n\n${buildCoaAnalysisPrompt(fileName)}`,
        base64Data,
        2048
      );

      debugInfo.push(`workersAI raw=${raw.slice(0, 150)}`);
      console.log(`[CoA AI] Workers AI response for ${fileName}:`, raw.slice(0, 500));

      const parsed = parseCoaJson(raw);
      if (parsed) {
        debugInfo.push(`workersAI parsed=OK`);
        return {
          productName: parsed.productName || null,
          lotNo: parsed.lotNo || null,
          manuDate: normalizeDate(parsed.manuDate),
          validDate: normalizeDate(parsed.validDate),
          manufacturer: parsed.manufacturer || null,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
          rawResponse: debugInfo.join(" | "),
        };
      }

      debugInfo.push(`workersAI parsed=FAIL`);
      console.warn(`[CoA AI] Workers AI JSON parse failed for ${fileName}`);
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      debugInfo.push(`workersAI error=${errMsg.slice(0, 150)}`);
      console.error(`[CoA AI] Workers AI Vision failed for ${fileName}:`, errMsg);
    }
  }

  // 4) 최종 폴백: 파일명 기반 regex 추출
  debugInfo.push(`fallback=filename`);
  console.log(`[CoA AI] Using filename fallback for: ${fileName}`);
  const result = extractFromFileName(fileName);
  result.rawResponse = debugInfo.join(" | ");
  return result;
}

/** JSON 응답 파싱 — 여러 형식 처리 */
function parseCoaJson(raw: string): any | null {
  // 빈 응답 체크
  if (!raw || raw.trim().length === 0) return null;

  // 방법 1: 직접 파싱
  try {
    return JSON.parse(raw.trim());
  } catch {}

  // 방법 2: 마크다운 코드블록 제거 후 파싱
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 방법 3: 첫 번째 { } 블록 추출
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {}
  }

  return null;
}

/** 다양한 날짜 형식을 YYYY-MM-DD로 정규화 */
function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = dateStr.trim();

  // 이미 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

  // YYYY.MM.DD
  const dotMatch = d.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) return `${dotMatch[1]}-${dotMatch[2].padStart(2, "0")}-${dotMatch[3].padStart(2, "0")}`;

  // YYYY/MM/DD
  const slashMatch = d.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[3].padStart(2, "0")}`;

  // DD.MM.YYYY or DD/MM/YYYY
  const euMatch = d.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (euMatch) return `${euMatch[3]}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`;

  // MM/DD/YYYY
  const usMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;

  // YYYYMMDD
  const compactMatch = d.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;

  return d; // 변환 불가 시 원본 반환
}

/** 파일명에서 제품명/LOT 패턴 추출 (폴백용) */
function extractFromFileName(fileName: string): CoaAnalysisResult {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");

  // COA, 성적서, certificate 등 키워드 제거
  const cleaned = nameWithoutExt.replace(/(?:COA|coa|성적서|certificate|Certificate|CERTIFICATE)[_\-\s]*/gi, "").trim();

  // LOT/Batch 패턴 추출 (접두어 있는 경우)
  const lotPrefixed = cleaned.match(/(?:LOT|Lot|lot|batch|BATCH|Batch|B\.?N\.?)[_\-\s.:]*([A-Z0-9][\w\-]+)/i);

  // 세그먼트 분리 (언더스코어, 하이픈, 공백)
  const segments = cleaned.split(/[_\-]+/).map(s => s.trim()).filter(s => s.length > 0);
  let lotNo: string | null = lotPrefixed?.[1] || null;
  let productSegments: string[] = segments;

  if (!lotNo && segments.length >= 2) {
    const last = segments[segments.length - 1];
    // 영문+숫자 혼합 패턴 (LOT번호로 추정):
    // "IH2412041E", "BGSXFAG135", "LOT2025001", "ABC123DEF" 등
    // 조건: 영문과 숫자가 모두 포함되고, 공백이 없는 단일 토큰
    const hasAlpha = /[A-Z]/i.test(last);
    const hasDigit = /\d/.test(last);
    const isAlphaNum = /^[A-Z0-9]+$/i.test(last);
    if (hasAlpha && hasDigit && isAlphaNum && last.length >= 5) {
      lotNo = last;
      productSegments = segments.slice(0, -1);
    }
  }

  // 제품명: COA/certificate 제거 후 남은 의미 있는 세그먼트 결합
  const productParts = productSegments.filter(
    s => !/^(?:COA|coa|성적서|certificate|cert|test|report|analysis)$/i.test(s)
  );
  const productName = productParts.join(" ").trim() || nameWithoutExt;

  return {
    productName: productName || null,
    lotNo,
    manuDate: null,
    validDate: null,
    manufacturer: null,
    confidence: lotNo ? 15 : 5,
  };
}

/**
 * AI 엔진 상태 정보 (프론트엔드 표시용)
 */
export function getAIEngineStatus(env: Env): {
  gemini: boolean;
  workersAI: boolean;
  models: Array<{ role: string; engine: string; status: string }>;
} {
  const gemini = !!env.GEMINI_API_KEY;

  return {
    gemini,
    workersAI: true,
    models: [
      {
        role: "분류+요약+스팸필터",
        engine: gemini ? "Gemini Flash" : "Workers AI (Llama)",
        status: gemini ? "active" : "fallback",
      },
      {
        role: "첨부파일 분석",
        engine: gemini ? "Gemini Flash" : "Workers AI (Llama)",
        status: gemini ? "active" : "fallback",
      },
      {
        role: "문서 작성/답변 초안",
        engine: gemini ? "Gemini Flash" : "Workers AI (Llama)",
        status: gemini ? "active" : "fallback",
      },
      {
        role: "판매분석/안전재고",
        engine: gemini ? "Gemini 2.5 Pro" : "Workers AI (Llama)",
        status: gemini ? "active" : "fallback",
      },
    ],
  };
}
