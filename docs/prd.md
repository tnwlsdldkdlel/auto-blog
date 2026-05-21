# 📝 Product Requirement Document (PRD)

## 1. 프로젝트 개요 (Overview)
*   **프로젝트명:** 맛집 블로그 자동 발행 봇 (가칭: TastyWrite)
*   **목적:** 사용자가 업로드한 이미지와 핵심 키워드를 기반으로 AI가 맛집 리뷰 맞춤형 원고를 생성하고, Playwright를 이용해 네이버 블로그에 백그라운드로 자동 업로드 및 발행(또는 임시저장)하는 로컬 웹 애플리케이션 구축.
*   **주요 가치:** 
    *   원클릭으로 이미지 분석부터 블로그 포스팅까지 원스톱 해결
    *   네이버 스마트에디터 ONE의 복잡한 입력 과정을 자동화하여 콘텐츠 생산성 극대화
    *   로컬 구동 방식을 통한 네이버의 서버 IP 차단 및 로그인 캡차(CAPTCHA) 리스크 우회

---

## 2. 기술 스택 (Technical Stacks)

| 분류 | 기술 스택 | 비고 |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | 프론트엔드 UI 및 로컬 API Route(백엔드) 통합 관리 |
| **Language** | TypeScript | 정적 타입을 통한 데이터 구조 및 API 안정성 확보 |
| **Styling** | Tailwind CSS | 직관적이고 빠른 대시보드 UI 컴포넌트 마크업 |
| **State** | Zustand | 봇 구동 상태, 실시간 로그, 업로드 이미지 상태 관리 |
| **Automation** | Playwright | Headless 브라우저 제어 및 네이버 블로그 포스팅 자동화 |
| **AI API** | OpenAI GPT-4o 또는 Gemini 1.5 Pro | Vision API를 통한 이미지 분석 및 구조화된 JSON 본문 생성 |

---

## 3. 핵심 기능 정의 (Core Features)

### 3.1. 컨텐츠 입력 및 AI 분석 (Frontend & Backend API)
*   **멀티 이미지 업로드:** 드래그 앤 드롭을 지원하는 이미지 업로드 UI (맛집 사진 다중 선택 가능).
*   **메타데이터 입력:** 메인 키워드(예: 강남역 맛집) 및 추가 요청 사항(예: 내돈내산 톤앤매너) 입력 폼 제공.
*   **구조화된 AI 원고 생성:** Vision AI를 호출할 때, Playwright가 파싱하기 쉽도록 텍스트와 이미지가 매핑된 **JSON 규격**으로 출력을 강제(Structured Outputs 기능 활용).

### 3.2. Playwright 백그라운드 자동화 (Automation Engine)
*   **Persistent Context 활용:** 로컬 크롬 브라우저의 유저 데이터 디렉토리를 로드하여 이미 로그인된 네이버 세션을 그대로 재활용 (캡차 우회).
*   **네이버 스마트에디터 ONE 호환 주입:** 
    *   `div[contenteditable="true"]` 엘리먼트에 포커싱 후 `page.keyboard.insertText()`를 활용해 실제 타이핑 이벤트 시뮬레이션.
    *   숨겨진 `input[type="file"]` 요소를 찾아 `setInputFiles()`로 로컬 이미지 파일 순차적 주입.
*   **발행 제어 토글:** 사용자의 선택에 따라 `임시저장` 또는 `즉시 발행` 분기 처리.

### 3.3. 실시간 진행 상태 모니터링 (Real-time Logging)
*   백그라운드에서 실행되는 Playwright의 진행 상황(예: 이미지 업로드 중, 본문 입력 중 등)을 **Server-Sent Events (SSE)** 또는 주기적 Polling을 통해 프론트엔드로 전송.
*   사용자는 대시보드의 터미널 형태 로그 창에서 현재 봇의 동작 상태를 실시간으로 확인 가능.

### 3.4. 경쟁사 콘텐츠 분석 파이프라인 (Fact Extraction)

상위 노출 블로그의 객관 정보(주차/영업시간/메뉴 가격 등)를 수집해 내 원고에 정보성 큐레이션 형태로 녹여넣는다. 단순 글쓰기 비서 → **정보성 포스팅을 찍어내는 SEO 엔진**으로 격상시키는 핵심 레이어.

**데이터 파이프라인 (4-Stage)**

```
[1. 입력]    이미지 업로드 + 메인 키워드
     ↓
[2. 수집]    Playwright가 네이버 검색 → 상위 3개 블로그 본문 스크래핑
     ↓
[3. 정제]    LLM에게 스크랩 텍스트를 주고 "식당 정보 요약본(RefinedStoreInfo)" JSON 추출
     ↓
[4. 생성]    Vision LLM에게 [내 사진] + [RefinedStoreInfo] 조합하여 BlogPayload 생성
```

> 💡 **왜 3단계(정제)가 필요한가?** 상위 3개 블로그 본문 전체를 최종 프롬프트에 통째로 넣으면 토큰 비용도 높고 AI가 혼란스러워한다. 중간에 Fact Extractor 단계를 둬서 "주차·영업시간·대표메뉴만 뽑아라"로 압축해야 깔끔하다.

**네이버 블로그 크롤링 기술 노트**

*   **`#mainFrame` 전환 필수:** 네이버 블로그 상세는 `<iframe>` 안에 본문이 갇혀 있다. `page.frameLocator('#mainFrame')` 진입 후 텍스트 추출.
*   **본문 셀렉터:** `.se-main-container` 또는 `.se-text` 클래스 영역에서 `.allInnerTexts()`로 일괄 수집.
*   **속도 조절:** 3개 블로그 순차 진입 사이에 1~2초 랜덤 딜레이 (스크래핑 차단 회피).

---

## 4. 데이터 구조 (Data Structure)

AI가 생성하여 백엔드와 Playwright 스크립트 간에 주고받을 표준 데이터 포맷은 다음과 같이 정의합니다.

### 4.1. RefinedStoreInfo — Fact Extractor 산출물

3단계(정제)에서 추출되는 객관 정보 요약본. **4단계(원고 생성)의 재료**로 들어간다.

```typescript
interface RefinedStoreInfo {
  parking: string;       // ex) "건물 지하 2시간 무료 가능"
  businessHours: string; // ex) "매일 11:30 ~ 22:00 (브레이크타임 없음)"
  locationTip: string;   // ex) "강남역 11번 출구에서 도보 3분 거리"
  popularMenus: { name: string; price: string }[]; // 대표 메뉴 및 가격
}
```

### 4.2. BlogPayload — 최종 발행 페이로드

```typescript
interface BlogPayload {
  title: string;
  tags: string[];
  categoryCode: string; // 네이버 카테고리 ID (맛집 등)

  // 맛집의 핵심: 네이버 지도 첨부를 위한 메타데이터
  place?: {
    name: string;      // 식당 이름 (ex: OO삼겹살 강남점)
    address: string;   // 도로명 주소
    latitude: number;  // 위도 (네이버 지도 핀트용)
    longitude: number; // 경도
  };

  sections: (
    | { type: 'text'; value: string }
    | { type: 'image'; index: number; caption?: string }
  )[];

  options: {
    commentAllow: boolean;        // 댓글 허용 여부
    sympathyAllow: boolean;       // 공감 허용 여부
    isPublic: 'all' | 'private';  // 전체공개 / 비공개
  };
}
```

---

## 5. 실패 경로 최소 스펙 (Unhappy Path)

혼자 디버깅 가능한 수준의 최소 예외 처리만 정의한다. 핵심은 **봇이 죽었을 때 UI가 멍 때리지 않게 하는 것**과 **이미 입력한 내용이 날아가지 않게 하는 것**.

### 5.1. 1단계 — 네이버 스마트에디터 로딩 실패
- **트리거:** 발행 URL 진입 후 10초 이내 `div[contenteditable="true"]` DOM 미감지
- **처리:** `await context.close()`로 브라우저 즉시 종료
- **API 응답:** `status: 500, message: "NAVER_EDITOR_LOAD_FAILED"`
- **UI 반영:** 로그 창에 빨간색 에러 라인 출력 + 봇 상태 `idle` 복귀

### 5.2. 2단계 — 작성 중 셀렉터 미스/예외 발생
- **트리거:** 본문 입력·이미지 주입 도중 셀렉터 미발견 또는 Playwright 예외 throw
- **처리:** **입력된 내용을 날리지 않기 위해** 임시저장 버튼(`button[데이터-임시저장]` 등)을 강제 클릭 후 종료
- **API 응답:** `status: 500, message: "PARTIAL_WRITE_SAVED_AS_DRAFT"`
- **UI 반영:** 노란색 경고 + "네이버 블로그 임시저장함에서 확인 요망" 안내

---

## 6. AI 환각 방지 프롬프트 가이드라인

남의 블로그 정보를 내 원고에 녹일 때 AI가 거짓말(안 먹은 메뉴를 먹었다고 하거나 없는 경험을 지어내는 것)을 못 하도록 **출처별 역할 분담**을 프롬프트에 명시한다.

### 6.1. 출처 분리 원칙 (Source Separation)

| 출처 | 입력 데이터 | 허용 사용처 | 금지 |
|---|---|---|---|
| **A. User Images** | 사용자가 업로드한 이미지 | 맛 평가, 시각적 묘사, 매장 분위기 묘사 | 사진에 없는 메뉴/요소 언급 금지 |
| **B. RefinedStoreInfo** | Fact Extractor 산출물 | 주차 팁, 찾아가는 길, 영업시간, 메뉴 가격 | 출처 B의 사실을 사용자의 1인칭 경험으로 둔갑 금지 |

### 6.2. 시스템 프롬프트 골격

```
당신은 맛집 포스팅 생성 AI다. 다음 두 출처를 엄격히 구분해 사용하라.

[출처 A: 제공된 이미지(User Images)]
- '맛에 대한 평가', '시각적 묘사', '매장 분위기'는 오직 이 이미지에 존재하는
  요소만 기반으로 작성한다. 사진에 없는 메뉴를 먹었다고 거짓말하지 말 것.

[출처 B: 식당 정보 요약본(RefinedStoreInfo)]
- '주차 팁', '찾아가는 길', '영업시간', '정확한 메뉴판 가격' 등 객관 사실은
  이 데이터만 참고하여 포스팅 하단·중간에 '정보성 큐레이션 컴포넌트'
  형태로 녹여낸다. 사용자의 1인칭 경험("내가 주차해보니~")으로 둔갑 금지.

[출력 형식]
- 반드시 BlogPayload JSON 스키마로만 응답.
- 추측·창작·일반론적 미사여구로 분량 채우기 금지.
```

### 6.3. 검증 룰 (선택 사항)
- 발행 직전 미리보기 단계에서 사용자가 거짓 정보 발견 시 **"이 섹션 삭제"** 원클릭 가능하도록 UI 제공.

---

## 7. Phase 1 MVP 범위 (Scope Anchor)

> **MVP 목표:** 사진 + 키워드 → 네이버 블로그 **임시저장**까지 한 번 자동으로 도달.
> **유일한 성공 기준:** 임시저장함에 글이 들어가 있고, 사진 첨부 + 본문이 깨지지 않았다.

이 섹션은 **닻(Anchor)** 역할을 한다. 개발 중 욕심이 생겨 Phase 2+ 기능에 손대고 싶을 때 이 문서로 돌아와 "지금은 MVP만"을 상기한다.

### 7.1. Phase 1에 포함 (Must)

| 분류 | 범위 |
|---|---|
| **입력 UI** | 멀티 이미지 드래그앤드롭 + 키워드 입력창 + 발행 버튼 1개 |
| **AI 원고 생성** | Vision LLM 1회 호출 → `BlogPayload` JSON 반환 |
| **Playwright 자동화** | Persistent Context로 로그인 세션 재활용 + 본문 입력 + 이미지 첨부 |
| **발행 분기** | **임시저장만 지원** (즉시 발행은 Phase 2) — 잘못된 글이 바로 노출되는 사고 방지 |
| **로그** | `console.log` + 화면 하단 단순 텍스트 출력 (SSE 아님) |
| **실패 처리** | **§5.1 1단계만** — 에디터 10초 미로딩 시 종료 + 에러 표시 |

### 7.2. Phase 1에서 빠짐 (Defer)

| 기능 | 미루는 Phase | 이유 |
|---|---|---|
| 경쟁사 크롤링 4-Stage (§3.4) | **Phase 3** | MVP 시간의 80%를 잡아먹을 위험. 1편이라도 발행되는 걸 먼저 봐야 의미 있음 |
| 네이버 지도 `place` 첨부 | **Phase 2** | 좌표 API 연동·지도 UI 자동화가 별도 난이도. 일단 텍스트 주소만 |
| `categoryCode` / `commentAllow` / `isPublic` | **Phase 2** | 네이버 기본값으로 충분 |
| 즉시 발행 | **Phase 2** | 임시저장으로 검수 후 수동 발행 |
| 출처 A/B 엄격 분리 프롬프트 (§6) | **Phase 2** | 일단 "사진에 없는 메뉴 언급 금지" 한 줄로 단순화 |
| §5.2 2단계 실패(임시저장 강제 클릭) | **Phase 2** | 1단계만 있어도 디버깅 가능 |
| SSE 실시간 로그 | **Phase 2** | console.log + 화면 텍스트로 충분 |

### 7.3. Phase 1 작업 순서 (권장)

```
Day 1-2 : Next.js 골격 + 업로드 UI + Zustand 상태
Day 3   : OpenAI Vision API 호출 → BlogPayload JSON 받기
Day 4-5 : Playwright Persistent Context로 네이버 로그인 세션 확보
          + 글쓰기 페이지 진입 + contenteditable 텍스트 입력
Day 6   : setInputFiles로 이미지 첨부 + 임시저장 버튼 클릭
Day 7   : 1단계 실패 처리 + End-to-End 통과
```

**Phase 1 데드라인:** 1주일 안에 "임시저장함에 내 글 떠 있는 스크린샷" 확보.

### 7.4. 후속 Phase 로드맵 (참고용)

- **Phase 2 — 맛집 디테일:** `place` 첨부, 발행 옵션, 즉시 발행, 출처 분리 프롬프트, §5.2 2단계 실패, SSE
- **Phase 3 — SEO 엔진화:** §3.4 경쟁사 4-Stage 크롤링 + `RefinedStoreInfo` 정제
- **Phase 4 — 운영 안정성:** 셀렉터 추상화 레이어, 발행 이력 저장, AI 비용 추적