# 🍴 auto-blog

맛집 블로그 자동 발행 봇 (Phase 1 MVP).
사진 + 키워드 → GPT-4o Vision으로 원고 생성 → Playwright로 네이버 블로그에 **임시저장**.

> 자세한 스펙은 [`docs/prd.md`](docs/prd.md) 참고. Phase 1 범위는 §7.

---

## 첫 실행 가이드

### 1. 환경 변수 작성

`.env.local.example`를 `.env.local`로 복사 후 채워 넣는다.

```env
OPENAI_API_KEY=sk-...
NAVER_BLOG_ID=your_blog_id
PLAYWRIGHT_USER_DATA_DIR=
```

`PLAYWRIGHT_USER_DATA_DIR`는 비워두면 프로젝트 루트의 `.playwright-user-data/`(gitignore됨)에 별도 세션을 만든다.

### 2. Playwright 브라우저 설치

```bash
npx playwright install chromium
```

### 3. dev 서버 실행

```bash
npm run dev
```

`http://localhost:3000` 접속.

### 4. 첫 발행 시도

1. 이미지 1장 이상 업로드 + 키워드 입력
2. **"임시저장으로 발행"** 클릭
3. 새 크롬 창이 뜨고 네이버 로그인 페이지로 이동 → **직접 로그인 (1회만)**
4. 다시 발행 버튼 클릭하면 세션이 재활용되어 자동 진행
5. 성공 시 네이버 블로그 임시저장함에서 글 확인

---

## Phase 1 동작 범위

| 동작                                | 지원                |
| ----------------------------------- | ------------------- |
| 멀티 이미지 업로드 + 키워드 입력    | ✅                  |
| GPT-4o Vision 원고 자동 생성        | ✅                  |
| 네이버 블로그 자동 진입 + 본문 입력 | ✅                  |
| 이미지 일괄 첨부                    | ✅ (본문 말미 일괄) |
| **임시저장**                        | ✅                  |
| 즉시 발행                           | ❌ Phase 2          |
| 네이버 지도(place) 첨부             | ❌ Phase 2          |
| 경쟁사 정보 자동 수집(SEO)          | ❌ Phase 3          |

자세한 후속 Phase 로드맵은 PRD §7.4.

---

## 실패 시

| 메시지                                      | 의미                                        | 대응                                                         |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `NAVER_EDITOR_LOAD_FAILED`                  | 글쓰기 페이지 진입 후 10초 내 에디터 미감지 | 로그인 상태/네트워크 확인. 직접 글쓰기 페이지 한 번 열어보기 |
| `OPENAI_API_KEY가 ... 설정되지 않았습니다.` | `.env.local` 누락                           | 위 1번 가이드 참고                                           |
| `SAVE_BUTTON_NOT_FOUND`                     | 네이버 UI 변경으로 저장 버튼 셀렉터 미스    | `src/lib/naver-bot.ts`의 `saveBtnCandidates` 셀렉터 추가     |
