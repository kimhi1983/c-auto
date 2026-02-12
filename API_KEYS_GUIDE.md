# AI API 키 발급 가이드 🔑

C-Auto는 **Claude**와 **Gemini** 두 가지 AI를 사용합니다.

## 📋 필수 API 키

### 1. Anthropic Claude API 키 ⭐ (추천 - 메인 AI)

**특징:**
- 가장 정확하고 한국어 지원 우수
- 이메일 분석 및 업무 처리에 최적화
- 무료 크레딧: $5 (약 20만 토큰)

**발급 방법:**

1. **Anthropic 콘솔 접속**
   ```
   https://console.anthropic.com/
   ```

2. **로그인/회원가입**
   - Google 계정으로 간편 로그인 가능
   - 이메일 인증

3. **API 키 발급**
   - 왼쪽 메뉴 **"API Keys"** 클릭
   - **"Create Key"** 버튼 클릭
   - 키 이름 입력 (예: "c-auto")
   - **복사 버튼 클릭** (한 번만 표시됨!)

4. **키 형식 확인**
   ```
   sk-ant-api03-xxx...
   ```

---

### 2. Google Gemini API 키 ⭐ (추천 - 무료)

**특징:**
- 완전 무료 (제한: 분당 60회)
- 빠른 응답 속도
- 한국어 지원 우수

**발급 방법:**

1. **Google AI Studio 접속**
   ```
   https://makersuite.google.com/app/apikey
   ```
   또는
   ```
   https://aistudio.google.com/app/apikey
   ```

2. **Google 계정으로 로그인**
   - Gmail 계정 사용

3. **API 키 생성**
   - **"Get API Key"** 또는 **"Create API Key"** 클릭
   - 프로젝트 선택 또는 새로 생성
   - **"Create API key in new project"** 권장

4. **키 복사**
   ```
   AIzaSy...
   ```

---

### 3. OpenAI GPT API 키 (선택사항)

**특징:**
- GPT-4o 모델 사용 가능
- 유료 ($0.005/1K 토큰)
- 무료 크레딧: 첫 가입 시 $5 (3개월 유효)

**발급 방법:**

1. **OpenAI 플랫폼 접속**
   ```
   https://platform.openai.com/api-keys
   ```

2. **로그인/회원가입**
   - Google 또는 Microsoft 계정으로 가입 가능

3. **API 키 생성**
   - **"Create new secret key"** 클릭
   - 이름 입력 (예: "c-auto")
   - **복사 버튼 클릭** (한 번만 표시됨!)

4. **결제 정보 등록** (선택사항)
   - Settings → Billing
   - 무료 크레딧 소진 후 필요

5. **키 형식 확인**
   ```
   sk-proj-...
   ```

---

## 🔧 API 키 설정 방법

### 로컬 개발 환경

1. **`.env` 파일 생성**
   ```bash
   # .env.example을 복사
   cp .env.example .env
   ```

2. **API 키 입력**
   ```env
   # Claude (필수)
   ANTHROPIC_API_KEY=sk-ant-api03-xxx...

   # Gemini (필수)
   GOOGLE_API_KEY=AIzaSy...

   # GPT (선택사항)
   OPENAI_API_KEY=sk-proj-...
   ```

3. **저장 후 서버 재시작**
   ```bash
   python -m uvicorn app.main:app --reload
   ```

---

### Render 클라우드 배포

1. **Render Dashboard 접속**
   - https://render.com/

2. **Web Service 선택**
   - 본인의 c-auto 서비스 클릭

3. **Environment 탭 클릭**

4. **환경 변수 추가**

   **Add Environment Variable** 버튼을 눌러 각각 추가:

   ```
   Key: ANTHROPIC_API_KEY
   Value: sk-ant-api03-xxx...
   ```

   ```
   Key: GOOGLE_API_KEY
   Value: AIzaSy...
   ```

   ```
   Key: OPENAI_API_KEY (선택사항)
   Value: sk-proj-...
   ```

5. **Save Changes** 클릭

6. **자동 재배포 대기** (1-2분)

---

## 💰 비용 비교

| AI 모델 | 무료 크레딧 | 유료 비용 | 권장 용도 |
|---------|-------------|-----------|-----------|
| **Claude** | $5 | $3/1M 토큰 | 메인 AI (이메일 분석) |
| **Gemini** | 무제한 | 무료 | 백업 AI (파일 검색) |
| **GPT** | $5 (3개월) | $5/1M 토큰 | 선택사항 |

**추천 조합:**
- ✅ **Claude + Gemini** (완전 무료로 시작 가능!)
- 💵 GPT는 선택사항 (필요시 추가)

---

## 🧪 테스트 방법

### 로컬 서버 테스트

1. **서버 실행**
   ```bash
   python -m uvicorn app.main:app --reload
   ```

2. **브라우저에서 테스트**

   **Claude 테스트:**
   ```
   http://localhost:8000/ai-chat?query=안녕하세요&model=claude
   ```

   **Gemini 테스트:**
   ```
   http://localhost:8000/ai-chat?query=안녕하세요&model=gemini
   ```

   **GPT 테스트 (선택):**
   ```
   http://localhost:8000/ai-chat?query=안녕하세요&model=gpt
   ```

3. **예상 응답**
   ```json
   {
     "status": "success",
     "answer": "안녕하세요! 무엇을 도와드릴까요?",
     "model": "claude"
   }
   ```

---

### Render 배포 후 테스트

배포 완료 후 본인의 도메인으로 테스트:

```
https://c-auto.yourdomain.com/ai-chat?query=안녕하세요&model=claude
https://c-auto.yourdomain.com/ai-chat?query=안녕하세요&model=gemini
```

---

## 🔒 보안 주의사항

### ⚠️ 절대 하지 말아야 할 것

1. **API 키를 GitHub에 올리지 마세요**
   - `.env` 파일은 `.gitignore`에 포함되어 있음
   - 코드에 직접 입력 금지

2. **API 키를 공유하지 마세요**
   - 개인만 사용
   - 팀원과도 각자 발급

3. **키가 노출되었다면 즉시 재발급**
   - Anthropic Console → API Keys → Delete
   - Google AI Studio → Revoke
   - OpenAI Platform → Revoke

---

## 🆘 문제 해결

### Q1: "API 키가 설정되지 않았습니다" 오류

**원인:** 환경 변수가 제대로 설정되지 않음

**해결:**
1. `.env` 파일 확인
2. `ANTHROPIC_API_KEY=` 값이 비어있지 않은지 확인
3. 서버 재시작

---

### Q2: "Invalid API Key" 오류

**원인:** API 키가 잘못되었거나 만료됨

**해결:**
1. 키를 다시 복사해서 붙여넣기
2. 앞뒤 공백 제거
3. 새 키 발급

---

### Q3: "Rate limit exceeded" 오류

**원인:** 무료 할당량 초과

**해결:**
- **Gemini**: 1분 대기 (분당 60회 제한)
- **Claude**: 무료 크레딧 소진 → 결제 정보 등록
- **GPT**: 무료 크레딧 소진 → 결제 정보 등록

---

## 📊 사용량 모니터링

### Claude 사용량 확인
```
https://console.anthropic.com/settings/usage
```

### Gemini 사용량 확인
```
https://aistudio.google.com/app/apikey
→ API 키 클릭 → Usage 확인
```

### OpenAI 사용량 확인
```
https://platform.openai.com/usage
```

---

## 💡 Pro Tips

1. **Claude를 메인으로 사용**
   - 가장 정확한 한국어 분석
   - 이메일 분석 및 업무 처리에 최적

2. **Gemini를 백업으로 사용**
   - 완전 무료
   - Claude API가 느릴 때 대체

3. **GPT는 선택사항**
   - 필요시에만 추가
   - 유료 크레딧 필요

4. **API 키 주기적 갱신**
   - 보안을 위해 3-6개월마다 재발급 권장

---

## 🎉 완료!

API 키 설정이 완료되면:
- ✅ Claude로 이메일 분석
- ✅ Gemini로 파일 검색
- ✅ GPT로 추가 작업 (선택)

모든 AI 기능이 정상 작동합니다! 🚀
