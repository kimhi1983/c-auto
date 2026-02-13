/**
 * AI Service - Claude (Anthropic) + Gemini (Google) 연동
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Claude API 호출 (짧은 응답)
 */
export async function askClaude(
  apiKey: string,
  prompt: string,
  model = "claude-sonnet-4-20250514",
  maxTokens = 1024
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

/**
 * Claude API 호출 (장문 응답 - 문서 작성용)
 */
export async function askClaudeLong(
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemPrompt || "당신은 한국 비즈니스 문서 작성 전문가입니다.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

/**
 * Gemini API 호출 (빠른 분류/추출용)
 */
export async function askGemini(
  apiKey: string,
  prompt: string,
  model = "gemini-1.5-flash"
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });

  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
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

// ─── 이메일 8분류 프롬프트 ───

export function classifyEmailPrompt(sender: string, subject: string, body: string): string {
  return `다음 이메일을 분석해서 정확히 JSON 형식으로만 답해줘. 다른 설명 없이 JSON만 출력해.

발신자: ${sender}
제목: ${subject}
내용: ${(body || '').slice(0, 1000)}

형식:
{
  "category": "발주/요청/견적요청/문의/공지/미팅/클레임/기타 중 하나",
  "priority": "high/medium/low 중 하나",
  "summary": "이메일 내용을 한 문장으로 요약 (한국어)",
  "confidence": 0~100 사이 정수
}`;
}
