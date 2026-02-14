/**
 * AI Service - Cloudflare Workers AI 기반
 * KPROS 이메일 자동화 시스템 v2
 *
 * Anthropic/Gemini API는 Workers에서 IP 차단 이슈로
 * Cloudflare Workers AI (@cf/meta/llama-3.1-70b-instruct) 사용
 */

const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-70b-instruct";

/**
 * Workers AI 호출
 */
async function callWorkersAI(
  ai: Ai,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 2048
): Promise<string> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await ai.run(WORKERS_AI_MODEL as any, {
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  });

  return (response as any).response || "";
}

/**
 * AI 호출 (짧은 응답)
 */
export async function askAI(
  ai: Ai,
  prompt: string,
  maxTokens = 1024
): Promise<string> {
  return callWorkersAI(ai, prompt, undefined, maxTokens);
}

/**
 * AI 호출 (장문 응답 - 문서 작성용)
 */
export async function askAILong(
  ai: Ai,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  return callWorkersAI(
    ai,
    prompt,
    systemPrompt || "당신은 한국 비즈니스 문서 작성 전문가입니다.",
    maxTokens
  );
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

// ─── KPROS 이메일 5분류 시스템 ───

export const KPROS_EMAIL_SYSTEM_PROMPT = `당신은 KPROS(화장품 원료 전문기업)의 AI 스마트 비서입니다.
이사님을 보좌하며 수신 메일을 분석하고 최적의 업무 처리를 수행합니다.

[기본 규칙]
1. 모든 외부 메일 답변은 "정중하고 프로페셔널한 비즈니스 한국어"로 작성합니다.
2. 답변 서두에 "안녕하세요, KPROS입니다."를 포함합니다.
3. 이사님께 보고할 때는 핵심만 간결하게 전달합니다.
4. 판단이 어려운 건은 needs_approval을 true로 설정합니다.

[메일 분류 카테고리 (5종)]
A: 자료대응 - 카탈로그, MSDS, CoA, 인증서, 사양서 등 파일 요청
B: 영업기회 - 견적, 발주, 단가 문의, 구매 의사
C: 스케줄링 - 미팅 요청, 일정 조율, 방문 제안
D: 정보수집 - 원료 단가 변동, 시장 동향, 뉴스레터, 공지
E: 필터링 - 스팸, 광고, 업무 무관 메일

[카테고리 판별 키워드]
A: "카탈로그","MSDS","인증서","CoA","사양서","자료 요청","파일 부탁","보내주세요","전달 부탁","첨부","규격서"
B: "견적","단가","가격","발주","주문","구매","MOQ","납기","수량","리드타임","quote","PO"
C: "미팅","회의","방문","일정","시간","면담","화상회의","줌","Zoom","Teams","스케줄"
D: "단가 인상","가격 변동","시장 동향","뉴스레터","공지","안내","통보","시황","트렌드"
E: 위 A~D에 해당하지 않으며 대량발송 형식이거나 업무와 무관한 내용

[복합 판별] 복수 카테고리 요소 시 비즈니스 가치 우선: B > C > A > D > E. note에 복합 분류 표시.

[카테고리별 처리 규칙]
■ A: 요청 자료/제품명 추출, 드롭박스 검색 키워드(한글/영문) 생성, 답변 필수문구 "요청하신 자료를 첨부하여 드립니다."
■ B: 품목/수량/납기 테이블 추출, 중요도 평가(상:500만+/중:일반/하:소량), 답변톤 적극적 영업, AI가 단가 직접 기재 금지, 필수문구 "문의해 주셔서 감사합니다. 검토 후 상세 견적서를 보내드리겠습니다."
■ C: 미팅 목적/일시/방식/장소 추출, 수락 버전 답변 작성
■ D: 원료명/변동유형/변동폭/적용시점 추출, 원가 영향 1줄 분석, 외부 답변 불필요
■ E: 응대 없음, 1줄 기록만

[답신 안전 규칙 - 반드시 준수]
1. 견적서, 단가, 가격 정보를 답신에 절대 포함하지 마세요. "검토 후 별도 안내" 문구로 대체합니다.
2. 사내 기밀 자료(원가, 마진율, 내부 문서)를 언급하지 마세요.
3. 확정되지 않은 납기/재고/생산 일정을 답신에 기재하지 마세요. "확인 후 안내" 문구로 대체합니다.
4. 계약, 법적 효력이 있는 약속 문구(~보장합니다, ~약속드립니다)를 사용하지 마세요.
5. B카테고리 답신에서 구체적 금액/단가/할인율을 절대 기재하지 마세요.
6. 첨부파일 내용을 추측하여 답신에 기재하지 마세요.

반드시 JSON만 출력하세요. 다른 설명이나 마크다운 없이 순수 JSON 객체만 출력하세요.`;

export function classifyEmailPrompt(sender: string, subject: string, body: string): string {
  return `다음 수신 이메일을 분석하여 정확히 JSON 형식으로만 답하세요. 다른 설명 없이 JSON만 출력.

[수신 메일]
발신자: ${sender}
제목: ${subject}
내용:
${(body || '').slice(0, 2000)}

[출력 JSON]
{
  "code": "A/B/C/D/E 중 하나",
  "category": "자료대응/영업기회/스케줄링/정보수집/필터링 중 하나",
  "priority": "high/medium/low",
  "importance": "상/중/하",
  "summary": "핵심 요약 1~2문장",
  "action_items": "AI 수행 액션 요약 2~3줄",
  "draft_reply": "발송 가능 답변 초안. D/E카테고리는 빈 문자열",
  "draft_subject": "RE: 원본제목. 답변 불필요 시 빈 문자열",
  "search_keywords": ["드롭박스 검색 키워드 (A카테고리). 불필요 시 빈 배열"],
  "director_report": "이사님 보고용 3줄 이내 요약",
  "needs_approval": true,
  "company_name": "발신 회사명",
  "sender_info": "발신자 이름 (직책)",
  "estimated_revenue": "예상 매출 (B카테고리만, 불가 시 빈 문자열)",
  "note": "비고",
  "confidence": 85
}`;
}

/**
 * KPROS 이메일 고급 분류 - Workers AI
 */
export async function classifyEmailAdvanced(
  ai: Ai,
  sender: string,
  subject: string,
  body: string
): Promise<string> {
  return askAILong(
    ai,
    classifyEmailPrompt(sender, subject, body),
    KPROS_EMAIL_SYSTEM_PROMPT,
    2048
  );
}
