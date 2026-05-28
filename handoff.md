# 🤝 Handoff — auto-blog 작업 인수인계

> 작성 시점: 2026-05-21 / 최종 갱신: 2026-05-27 / 작성자: 사용자(mplanit) + Claude Code 세션 기준
> 이 문서는 다음 작업 세션에서 빠르게 컨텍스트를 잡기 위한 짧은 메모입니다.

---

## 한 줄 요약

**Phase 1 MVP 완료 → Phase 2 완료 + 완전 자동 발행 토글 라이브 검증 완료 — 기본은 반자동(사람이 최종 [발행]), 토글 ON 시 `seOnePublishBtn` data-testid로 자동 발행까지 동작 확인(2026-05-28). Prettier 도입+베이스라인 적용. 남은 건 SSE 로그, Phase 3(경쟁사 크롤링).**

---

## ✅ 동작 검증 완료

| 영역                                                                                 | 상태                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Next.js 16 + Tailwind 4 + TS 스캐폴딩                                                | ✅                                                     |
| 이미지 멀티 업로드 + 키워드/톤노트/식당명/주소/옵션 입력 UI                          | ✅                                                     |
| GPT-4o Vision → BlogPayload JSON Structured Outputs                                  | ✅ (zod `nullable` + `union` 필수)                     |
| Playwright Persistent Context 세션 재활용                                            | ✅ (`.playwright-user-data/`)                          |
| **세션 영구 저장** — 로그인 페이지에서 `#keep`("로그인 상태 유지") 자동 ON           | ✅ 1차 로그인→2차 재실행 로그인 생략 검증 (2026-05-27) |
| **에디터 로딩 감지** — `.se-text-paragraph` 기준(숨김 contenteditable 헬퍼 회피)     | ✅ 안정화 (2026-05-28)                                 |
| 로그인 페이지 감지 시 최대 5분 사용자 로그인 대기                                    | ✅                                                     |
| 제목/본문 자동 입력 + 복구 팝업 회피                                                 | ✅                                                     |
| 이미지 일괄 첨부(filechooser) + 첨부 후 사이드 패널 닫기                             | ✅                                                     |
| **네이버 지도 place 첨부** (장소 추가 → 검색 → 자동완성 → **행 hover→추가** → 확인)  | ✅ 본문 `se-placesMap` 삽입까지 DOM 검증 (2026-05-28)  |
| **발행 모달 열기 + 카테고리 자동 선택** (발행 → 카테고리 목록 버튼 → 항목)           | ✅ 라이브 검증 완료 (2026-05-26)                       |
| **발행 옵션 자동화** (공개범위 라디오 + 댓글/공감 토글, 상태 읽어 mismatch만 클릭)   | ✅ 라이브 검증 완료 (2026-05-27)                       |
| **실제 앱 전체 플로우** (사진+키워드 → AI 생성 → 자동화 → 발행 모달 → 실제 1편 발행) | ✅ 1회 발행 검증 완료 (2026-05-27)                     |
| 임시저장 클릭 (`saveAsDraft`, 함수는 남아있으나 현재 플로우 미사용)                  | ✅ (현재 반자동으로 대체)                              |
| §5.1 1단계 실패 처리(에디터 미감지)                                                  | ✅                                                     |
| §5.2 글 보존 — **본문 진입(`editorReady`) 후** 어떤 실패든 브라우저 안 닫고 글 유지  | ✅ catch 분기로 강화 (2026-05-28)                      |
| 브라우저 잔존 충돌 처리 — 이전 발행 창 열린 채 재시도 시 `BROWSER_ALREADY_OPEN` 안내 | ✅ (2026-05-28, 코드리뷰 후속)                         |
| **완전 자동 발행 토글** — UI 토글 + `clickFinalPublish()`(seOnePublishBtn) + PUBLISHED/AUTO_PUBLISH_TIMEOUT 응답 | ✅ 라이브 1편 발행 검증 완료 (2026-05-28) |
| Prettier 설정 + 베이스라인 적용                                                      | ✅ (2026-05-28) — `npm run format` / `format:check`    |

---

## ⏳ 미완 / 다음 작업 후보

| 항목                                | 상태                 | 비고                                                                                                                                                                                                                  |
| ----------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~카테고리 자동화 E2E 검증~~        | ✅ 완료 (2026-05-26) | Task #15. 발행 모달 안에 있음 확인 + 라이브 검증 통과                                                                                                                                                                 |
| ~~공개범위/댓글/공감 자동화~~       | ✅ 완료 (2026-05-27) | `setPublishOptions` 추가. 토글은 `for`→input `.checked` 읽어 mismatch만 클릭                                                                                                                                          |
| ~~세션 영구 저장 안 됨~~            | ✅ 완료 (2026-05-27) | `enableKeepLogin()` — 로그인 전 `#keep` 자동 ON. 영구 쿠키 발급돼 재로그인 불필요                                                                                                                                     |
| ~~장소 첨부 — 추가 버튼 미감지~~    | ✅ 완료 (2026-05-28) | 셀렉터 버그였음(입력 문제 아님). `.se-place-add-button`이 행 hover 시에만 노출 → hover 후 클릭. 본문 `se-placesMap` 삽입까지 DOM 검증 완료                                                                            |
| ~~즉시 발행 토글(완전 자동 발행)~~  | ✅ 완료 (2026-05-28) | `clickFinalPublish` + UI 토글 구현 + 라이브 1편 발행 검증 완료. 셀렉터는 `[data-testid="seOnePublishBtn"]`(네이버 stable test id) |
| **SSE 실시간 로그**                 | ❌                   | 현재 fetch 종료 시 한꺼번에 로그 받음. 로그인 대기 중 UX 답답함 해결용                                                                                                                                                |
| **경쟁사 크롤링 4-Stage (Phase 3)** | ❌                   | PRD §3.4 SEO Fact Extraction. RefinedStoreInfo + Fact Extractor + 본문 큐레이션                                                                                                                                       |
| **코드리뷰 잔여(우선순위 낮음)**    | ❌                   | ①매직넘버 타임아웃 상수화 ②scripts↔naver-bot 셀렉터 중복 제거(공유 모듈) ③attachPlace/setPublishOptions inline 타입을 BlogPayload 참조로 ④attachImages 업로드 대기를 시간→신호 기반으로 ⑤`saveAsDraft` dead code 처리 |

---

## 🚀 재시작 가이드

```powershell
# 프로젝트 디렉토리
cd C:\Users\mplanit\Documents\project\nn

# dev 서버 띄우기 (포트 3000~3002 자동)
npm run dev

# 실제 발행 시도
# → http://localhost:3000 접속 후 사진+키워드+(선택)식당명/주소 입력 후 발행창 열기
#   → 뜬 크롬 창에서 카테고리·내용 확인 후 [발행] 직접 클릭

# 셀렉터만 빠르게 검증/재캡처할 때 (dev 서버 없이)
node scripts/inspect-category.mjs       # 카테고리 셀렉터 캡처(Inspector 레코더)
node scripts/verify-category.mjs "놀고"  # openPublishModal+setCategory 라이브 검증
node scripts/inspect-options.mjs        # 발행옵션 셀렉터 캡처(모달 자동 열림)
node scripts/verify-options.mjs         # setPublishOptions 라이브 검증 + 토글 DOM 진단
node scripts/inspect-login.mjs          # 로그인 페이지 keep 컨트롤 진단(probe)
node scripts/verify-session.mjs         # 세션 영구저장 검증(1차 로그인→2차 재실행 판정)
node scripts/verify-place.mjs "스타벅스 강남R점"  # 장소 첨부 라이브 검증 + DOM 진단
node scripts/inspect-final-publish.mjs  # 모달 안 최종 [발행] 버튼 구조 진단(probe, 발행 안 함)

# 포맷
npm run format        # 전체 정리(쓰기)
npm run format:check  # 차이만 확인(쓰기 X)
```

`.env`(주의: `.env.local` 아님)에 `OPENAI_API_KEY` + `NAVER_BLOG_ID` + `PLAYWRIGHT_USER_DATA_DIR` 채워 있어야 함. `.playwright-user-data/`에 세션 캐시됨 — **"로그인 상태 유지" 자동 ON 처리로 첫 로그인 후 영구 유지**(재로그인 불필요).

---

## 🔑 핵심 셀렉터 (네이버 스마트에디터 ONE, 2026-05 기준)

| 위치                                         | 셀렉터                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iframe                                       | `iframe[name="mainFrame"]`                                                                                                                                                                 |
| **에디터 로딩 감지**                         | `.se-text-paragraph` 첫 요소 visible 대기 (❌ `div[contenteditable="true"]`은 숨김 클립보드 헬퍼와 섞여 불안정)                                                                            |
| 제목                                         | `.se-section-documentTitle .se-text-paragraph` 또는 `role=paragraph filter="제목"`                                                                                                         |
| 본문                                         | `.se-section-text .se-text-paragraph` 또는 `div filter="본문 추가"`                                                                                                                        |
| 사진 추가                                    | `getByRole('button', { name: '사진 추가' })` → filechooser                                                                                                                                 |
| 첨부 후 닫기                                 | `getByRole('button', { name: '닫기', exact: true })`                                                                                                                                       |
| 장소 추가                                    | `getByRole('button', { name: '장소 추가' })`                                                                                                                                               |
| 장소 검색창                                  | `getByRole('textbox', { name: '장소명을 입력하세요' })`                                                                                                                                    |
| 자동완성 옵션                                | `getByRole('option')` 첫 번째 또는 hasText 매칭                                                                                                                                            |
| **장소 검색결과 추가**                       | `.se-place-map-search-result-item`(행) **hover** → 내부 `.se-place-add-button` 클릭 ✅ (추가버튼은 기본 `display:none`, 행 hover 시 노출. `getByRole('button',{name:'추가'})`로는 못 잡음) |
| 장소 삽입 확인                               | `getByRole('button', { name: '확인' })` → 본문에 `se-component se-placesMap` 삽입됨                                                                                                        |
| 저장(임시저장)                               | iframe 내부 `getByRole('button', { name: '저장', exact: true })`                                                                                                                           |
| **발행 모달 열기**                           | iframe 내부 `getByRole('button', { name: '발행' })` ✅                                                                                                                                     |
| **카테고리 드롭다운**                        | iframe 내부 `getByRole('button', { name: '카테고리 목록 버튼' })` ✅ (실측. 기존 `'카테고리'` 추측은 오답이었음)                                                                           |
| **카테고리 항목**                            | iframe 내부 `getByRole('button', { name: '<카테고리명>' })` ✅ (substring 매칭)                                                                                                            |
| **공개범위(라디오)**                         | iframe 내부 `getByText('전체공개')` / `getByText('비공개')` ✅ (label for=`open_public`/`open_private`)                                                                                    |
| **댓글허용/공감허용(토글)**                  | iframe 내부 `getByText('댓글허용')` / `getByText('공감허용')` ✅ (label for=`publish-option-comment`/`publish-option-sympathy`. 상태는 for→input `.checked`로 읽음)                        |
| **최종 발행 버튼** (모달 안)                 | iframe 내부 `[data-testid="seOnePublishBtn"]` ✅ (네이버가 직접 부여한 stable test id. CSS-modules 해시는 빌드마다 바뀌므로 의존 금지) |
| **로그인 상태 유지** (로그인 페이지, 최상위) | `#keep[role="checkbox"]` (div, `aria-checked`). 기본 OFF → 로그인 전 자동 클릭 ✅                                                                                                          |

> ⚠️ 네이버는 종종 마이너 UI 변경. 깨지면 `npx playwright codegen --viewport-size=1280,900 "https://blog.naver.com/<ID>?Redirect=Write"` 로 재캡처.

---

## ⚠️ 알려진 제약/주의사항

1. **OpenAI Structured Outputs 제약**
   - zod `.optional()`은 안 됨 → 항상 `.nullable()`
   - `.discriminatedUnion()`은 `oneOf`로 변환되어 거부됨 → `.union()` 사용
   - `.default()`도 strict 모드 충돌 가능 — 사용 X

2. **Vercel 배포 부적합**
   - 사용자가 `https://vercel.com/ohsujins-projects-f9745280/auto-blog`에 자동 배포 연결해뒀지만 Playwright/Persistent Context를 Vercel(서버리스)에서 못 돌림. push하면 빌드는 통과해도 `/api/publish`는 무조건 런타임 에러. **로컬 전용 도구.**

3. **네이버 ToS 리스크**
   - 자동화 도구 사용은 네이버 약관 위반. 1인 사용 + 발행량 적게(하루 1~2건) 유지. 빈도 높이면 계정 위험↑.

4. **GPT-4o Vision 비용**
   - 1편당 대략 $0.05~0.15. 결제 카드 등록 필요.

5. **PRD/메모리 위치**
   - `docs/prd.md`는 git ignore됨 (로컬 전용 기획 문서)
   - 사용자 메모리는 `C:\Users\mplanit\.claude\projects\C--Users-mplanit-Documents-project-nn\memory\` — 인디 해킹 필터링 원칙, 프로젝트 컨텍스트, git 커밋 규칙 등이 저장돼 있음

---

## 📋 git 히스토리 (이 세션)

```
feat: 완전 자동 발행 토글 - clickFinalPublish(seOnePublishBtn) + UI 토글
style: Prettier 전체 적용 - 코드/문서/스크립트 일괄 포맷
chore: Prettier 도입 - format 스크립트 + 설정
refactor: 코드리뷰 후속 - 글 보존 분기 + 브라우저 잠금 에러 매핑 + quick win
fix: 에디터 로딩 감지 안정화(.se-text-paragraph) + 장소 본문삽입 DOM 검증
fix: 장소 첨부 - 검색결과 행 hover 후 추가 버튼 클릭(셀렉터 버그 수정)
fix: 세션 영구 저장 - 로그인 시 "로그인 상태 유지" 자동 ON
feat: Phase 2 - 발행 옵션(공개범위/댓글/공감) 자동화 + 라이브 검증
feat: Phase 2 - 카테고리 자동화 실측 검증 + 반자동 발행 모달 전환
docs: 2026-05-21 일일 핸드오프 추가
feat: Phase 2 - 카테고리/공개범위/댓글공감 옵션 UI + setCategory 자동화 1차
feat: Phase 2 - 네이버 지도 place 첨부 자동화
fix: Phase 1 실측 보정 - OpenAI 스키마 호환과 셀렉터 강화
chore: 프로젝트명 TastyWrite → auto-blog 변경
feat: TastyWrite Phase 1 MVP 구현
chore: 프로젝트 규약 정리
Initial commit from Create Next App
```

---

## 🎯 권장 다음 작업

우선순위 순:

1. **Phase 3 — 경쟁사 크롤링 4-Stage** (PRD §3.4) — 진짜 SEO 엔진화. RefinedStoreInfo + Fact Extractor + 본문 큐레이션
2. **SSE 실시간 로그** — 로그인 대기 UX (단, 세션 유지로 재로그인 사라져 체감 우선순위↓)
3. **코드리뷰 잔여** — 매직넘버 상수화 / scripts↔naver-bot 중복 제거 / inline 타입 공유 등 (위 미완 표)
4. (선택) 실제 발행 1회 — 사진+실제 식당명으로 통합 발행 한 번 더 돌려 최종 눈 확인 (OpenAI 비용)

---

좋은 퇴근 되시고, 다음 세션에서 이 문서부터 읽으면 1분 안에 컨텍스트 잡힘.
