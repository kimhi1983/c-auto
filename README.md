# 🚀 C-Auto: KPROS AI 스마트 비서 시스템

**C-Auto**는 수신된 이메일을 실시간으로 분석하여 부서별 업무를 자동화하고, 경영진의 의사결정을 지원하는 **AI 중심 업무 운영 플랫폼**입니다.

---

## 🏗️ 1. 시스템 아키텍처 (3-Layer Structure)

본 시스템은 'Antigravity' 설계 원칙에 따라 3단계 계층 구조로 운영됩니다.


### **Step 1: 수집 (Inbound Layer)**
* **연동 대상**: Gmail API, Hiworks(kpros@kpros.kr), Cloudflare Workers.
* **기능**: 실시간 메일 감지 및 본문/첨부파일(PDF, 이미지) 데이터 추출.

### **Step 2: 분석 (Intelligence Brain)**
* **AI 엔진**:
    * **Gemini 2.0 Flash**: 빠른 이메일 분류 (5개 카테고리, JSON 강제 출력)
    * **Claude Sonnet 4.5**: 고품질 답신 초안 생성
* **기능**:
    * **분류(Classification)**: 5개 핵심 카테고리 자동 배정 (100% 정확도)
    * **신뢰도(Confidence)**: 0~100점 AI 자체 신뢰도 스코어링
    * **데이터 추출**: 품목, 수량, 납기, 서류 종류 JSON 구조화
    * **답신 초안**: 카테고리별 맞춤형 답신 자동 생성

### **Step 3: 실행 (Action Layer)**
* **부서 명령**: Slack/메신저를 통한 실시간 업무 지시 하달.
* **ERP 연동**: Ecount API를 통한 전표/재고 데이터 자동 업데이트.
* **리포팅**: 처리 내역 업무일지 자동 기록 및 엑셀 저장.

---

## 📂 2. 부서별 운영 가이드 (Directives)

| 카테고리 | 담당 부서 | 주요 액션 (Action Item) |
| :--- | :--- | :--- |
| **A. 자료대응** | 기술/연구팀 | 성적서(COA), MSDS 등 기술 서류 자동 검색 및 회신 준비 |
| **B. 영업기획** | 영업팀 | 신규 발주(PO) 확인 및 Ecount 재고 대조 리포트 생성 |
| **C. 스케줄링** | 운영팀/이사님 | 수입 물류 스케줄 관리 및 구글 캘린더 자동 등록 |
| **D. 정보수집** | 시장전략팀 | 원료 단가 변동 및 화장품 시장 동향 DB 적재 |
| **E. 필터링** | 시스템관리 | 광고 및 단순 알림 메일 자동 분류 및 제외 |

---

## 🛠️ 3. 기술 스택 (Tech Stack)

* **Backend**: Python 3.14 (FastAPI)
* **AI Engines**:
    * Gemini 2.0 Flash (분류/데이터 추출)
    * Claude Sonnet 4.5 (답신 생성/문서 작성)
* **Infrastructure**: Cloudflare Pages & Workers, Docker
* **Integration**: Ecount ERP API, Gmail/Hiworks API
* **Database**: Cloudflare D1, Dropbox (엑셀 저장)

---

## 🧪 4. 테스트 실행 방법

### 4.1 이메일 분류 시스템 테스트
```bash
cd /e/c-auto
python -m app.modules.email_bot test
```
**결과**: 5개 카테고리 100% 정확도 (COA→A, 견적→B, 스케줄→C, 뉴스→D, 광고→E)

### 4.2 실제 메일 1개 분석
```bash
python -m app.modules.email_bot
```

### 4.3 실제 메일 5개 분석 후 엑셀 기록
```bash
python -m app.modules.email_bot record
```

---

## 🚀 5. 로드맵

1. **Phase 1**: 웹 대시보드 UI 연동 및 DB 동기화 ✅ **완료**
2. **Phase 2**: AI 분석 엔진 고도화 (5개 카테고리 100% 정확도) ✅ **완료**
3. **Phase 3**: 자동 답신 시스템 및 ERP 전표 자동 생성 (예정)
4. **Phase 4**: 완전 무인 업무 체계 완성 (예정)
