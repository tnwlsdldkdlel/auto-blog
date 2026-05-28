import path from 'node:path';
import { chromium, type BrowserContext, type Page, type Locator, type FrameLocator } from 'playwright';
import type { LogLine } from '@/types/automation';
import type { BlogPayload, BlogSection } from '@/types/blog-payload';

type TextSection = Extract<BlogSection, { type: 'text' }>;
const isText = (s: BlogSection): s is TextSection => s.type === 'text';

export interface BotConfig {
  blogId: string;
  userDataDir: string;
  headless?: boolean;
}

export interface BotHandle {
  context: BrowserContext;
  page: Page;
  logs: LogLine[];
  log: (level: LogLine['level'], message: string) => void;
}

export function resolveUserDataDir(): string {
  const fromEnv = process.env.PLAYWRIGHT_USER_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), '.playwright-user-data');
}

export function resolveBlogId(): string {
  const id = process.env.NAVER_BLOG_ID?.trim();
  if (!id) {
    throw new Error('NAVER_BLOG_ID가 .env에 설정되지 않았습니다.');
  }
  return id;
}

/**
 * Persistent Context를 띄우고 네이버 블로그 글쓰기 페이지로 진입한다.
 * 첫 실행 시 사용자가 직접 로그인해야 하며, 이후 세션이 유지된다.
 */
export async function launchBlogBot(config: BotConfig): Promise<BotHandle> {
  const logs: LogLine[] = [];
  const log: BotHandle['log'] = (level, message) => {
    const line: LogLine = { ts: Date.now(), level, message };
    logs.push(line);
    console.log(`[naver-bot] ${level.toUpperCase()} ${message}`);
  };

  log('info', `Persistent Context 시작: ${config.userDataDir}`);
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(config.userDataDir, {
      headless: config.headless ?? false,
      viewport: { width: 1280, height: 900 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
  } catch (err) {
    // user-data-dir 잠금: 직전 발행 창(반자동)이 아직 열려 있으면 같은 프로필을 못 연다.
    const m = err instanceof Error ? err.message : String(err);
    if (/ProcessSingleton|SingletonLock|already in use|in use by another|profile/i.test(m)) {
      throw new Error('BROWSER_ALREADY_OPEN');
    }
    throw err;
  }

  const page = context.pages()[0] ?? (await context.newPage());

  const writeUrl = `https://blog.naver.com/${config.blogId}?Redirect=Write`;
  log('info', `글쓰기 페이지 진입: ${writeUrl}`);
  await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });

  return { context, page, logs, log };
}

/**
 * 네이버 로그인 페이지에서 "로그인 상태 유지"를 켠다(사용자 로그인 전).
 * 실측(2026-05): 최상위 페이지(nid.naver.com)의 `#keep`(div[role=checkbox][aria-checked]).
 * 기본 OFF라 이게 꺼진 채 로그인하면 세션 쿠키만 발급돼 매 실행 재로그인이 발생한다.
 * 켜두면 영구 쿠키가 발급돼 persistent 프로필에 로그인이 유지된다.
 * best-effort — 컨트롤을 못 찾아도 로그인 진행은 막지 않는다.
 */
async function enableKeepLogin(page: Page, log: BotHandle['log']): Promise<void> {
  try {
    const keep = page.locator('#keep[role="checkbox"]').first();
    await keep.waitFor({ timeout: 3000 });
    const checked = await keep.getAttribute('aria-checked');
    if (checked === 'true') {
      log('info', '"로그인 상태 유지" 이미 ON');
      return;
    }
    await keep.click();
    log('info', '✓ "로그인 상태 유지" 자동 ON — 세션 영구 저장(다음 실행부터 재로그인 생략)');
  } catch {
    log('warn', '"로그인 상태 유지" 컨트롤 미감지 — 직접 켜주세요(안 켜면 매번 재로그인)');
  }
}

/**
 * PRD §5.1 1단계: 스마트에디터 로딩 검증.
 * - 로그인 페이지 감지 시: "로그인 상태 유지"를 자동 ON 한 뒤, 사용자가 직접 로그인하도록 긴 대기(기본 5분).
 * - 글쓰기 페이지 도달 후: 실제 편집 표면(.se-text-paragraph) 감지.
 *   (iframe 대기 + paragraph 대기에 각각 timeoutMs를 쓰므로 최악 약 2×timeoutMs 소요)
 */
export async function waitForEditor(
  handle: BotHandle,
  timeoutMs = 10000,
  loginWaitMs = 300_000,
): Promise<void> {
  const { page, log } = handle;

  await page.waitForLoadState('domcontentloaded').catch(() => { });
  const url = page.url();
  const isLoginPage =
    url.includes('nid.naver.com') || url.includes('nidlogin.login');

  if (isLoginPage) {
    log(
      'info',
      `네이버 로그인 페이지 감지 — 띄워진 크롬 창에서 직접 로그인해 주세요 (최대 ${Math.round(loginWaitMs / 1000)}초 대기)`,
    );
    await enableKeepLogin(page, log);
    try {
      await page.waitForURL(
        (u) => {
          const s = u.toString();
          return !s.includes('nid.naver.com') && !s.includes('nidlogin.login');
        },
        { timeout: loginWaitMs },
      );
      log('info', '✓ 로그인 완료 — 글쓰기 페이지 로딩 대기');
      await page.waitForLoadState('domcontentloaded').catch(() => { });
    } catch {
      throw new Error('LOGIN_TIMEOUT');
    }
  }

  log('info', `에디터 로딩 대기 (최대 ${timeoutMs}ms)...`);
  try {
    await page.locator('iframe[name="mainFrame"]').first().waitFor({ timeout: timeoutMs });
    const frame = page.frameLocator('iframe[name="mainFrame"]');
    // 준비 신호는 fillTitleAndBody/attachImages가 실제로 조작하는 편집 표면(.se-text-paragraph).
    // (div[contenteditable]은 숨김 클립보드 헬퍼와 섞여 불안정 — 실측 2026-05)
    await frame.locator('.se-text-paragraph').first().waitFor({ timeout: timeoutMs });
    log('info', '✓ 에디터 편집 영역(.se-text-paragraph) 감지 완료');
  } catch {
    throw new Error('NAVER_EDITOR_LOAD_FAILED');
  }
}

/**
 * "이전에 작성하던 글이 있습니다" 류 모달이 떠 있으면 "취소"를 클릭해 닫는다.
 * codegen 확인: getByRole('button', { name: '취소', exact: true }) 내부 iframe.
 */
export async function dismissRecoveryPopup(handle: BotHandle): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');
  const cancelBtn = frame.getByRole('button', { name: '취소', exact: true }).first();
  try {
    await cancelBtn.waitFor({ timeout: 2500 });
    await cancelBtn.click();
    log('info', '복구 팝업 닫음');
    await page.waitForTimeout(500);
  } catch {
    // 팝업 없음 — 정상
  }
}

/**
 * 제목 + 본문 텍스트 자동 입력.
 * codegen 결과로 placeholder("제목", "본문 추가") 매칭 + 클래스 fallback.
 */
export async function fillTitleAndBody(handle: BotHandle, payload: BlogPayload): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  log('info', `제목 입력: "${payload.title}"`);
  // codegen: getByRole('paragraph').filter({ hasText: '제목' })
  // 클래스 fallback: .se-section-documentTitle 영역의 paragraph
  const titleCandidates = [
    frame.locator('.se-section-documentTitle .se-text-paragraph').first(),
    frame.getByRole('paragraph').filter({ hasText: '제목' }).first(),
  ];
  await clickFirstAvailable(titleCandidates, 'title');
  await page.keyboard.insertText(payload.title);

  const textSections = payload.sections.filter(isText).map((s) => s.value);
  const bodyText = textSections.join('\n\n');

  log('info', `본문 입력: ${textSections.length}개 단락 (${bodyText.length}자)`);
  // codegen: locator('div').filter({ hasText: /^본문 추가$/ })
  const bodyCandidates = [
    frame.locator('.se-section-text .se-text-paragraph').first(),
    frame.locator('div').filter({ hasText: /^본문 추가$/ }).first(),
  ];
  await clickFirstAvailable(bodyCandidates, 'body');
  await page.keyboard.insertText(bodyText);

  log('info', '✓ 제목/본문 입력 완료');
}

/**
 * 본문 말미에 이미지들을 일괄 첨부.
 * codegen 확인: getByRole('button', { name: '사진 추가' }) → filechooser
 * 첨부 후 사이드 패널 "닫기" 모달이 뜨면 닫는다.
 */
export async function attachImages(handle: BotHandle, imagePaths: string[]): Promise<void> {
  if (imagePaths.length === 0) return;
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  log('info', `이미지 ${imagePaths.length}장 첨부 시작`);

  // 본문 끝으로 커서 이동
  const bodyArea = frame.locator('.se-section-text .se-text-paragraph').last();
  try {
    await bodyArea.click({ timeout: 2000 });
    await page.keyboard.press('End');
  } catch {
    // 본문 영역 못 찾아도 사진 버튼은 별도로 시도
  }

  const photoBtn = frame.getByRole('button', { name: '사진 추가' }).first();

  try {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      photoBtn.click(),
    ]);
    await chooser.setFiles(imagePaths);
    log('info', '✓ 사진 추가 버튼 → filechooser로 주입');
  } catch {
    // 폴백: hidden input[type=file]에 직접 주입
    log('warn', '사진 버튼 filechooser 실패 → input[type=file] 직접 주입 시도');
    const fileInput = frame.locator('input[type="file"]').first();
    await fileInput.setInputFiles(imagePaths);
  }

  // 이미지 업로드/렌더링 대기
  await page.waitForTimeout(2500 + imagePaths.length * 800);

  // 첨부 후 사이드 패널 "닫기" 모달 처리 (codegen 발견)
  const closeBtn = frame.getByRole('button', { name: '닫기', exact: true }).first();
  try {
    await closeBtn.waitFor({ timeout: 2000 });
    await closeBtn.click();
    log('info', '사진 첨부 후 사이드 패널 닫음');
    await page.waitForTimeout(500);
  } catch {
    // 패널 없으면 통과
  }

  log('info', '✓ 이미지 첨부 단계 완료');
}

/**
 * 본문 말미에 네이버 지도(장소) 컴포넌트를 첨부.
 * Phase 2: 검색어로 자동 매칭. 셀렉터 미스 시 전체 발행은 막지 않고 skip.
 */
export async function attachPlace(
  handle: BotHandle,
  place: { name: string; address: string; latitude: number | null; longitude: number | null },
): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  const query = `${place.name} ${place.address}`.trim();
  if (!query) {
    log('warn', 'place 입력값이 모두 비어 있음 — skip');
    return;
  }
  log('info', `장소 첨부 시작: "${query}"`);

  // 본문 끝 커서 이동 (codegen 일치)
  try {
    const bodyArea = frame.locator('div').filter({ hasText: /^본문 추가$/ }).first();
    await bodyArea.click({ timeout: 1500 });
  } catch {
    try {
      const bodyAreaFallback = frame.locator('.se-section-text .se-text-paragraph').last();
      await bodyAreaFallback.click({ timeout: 1500 });
    } catch {
      // 본문 위치 못 잡아도 툴바 버튼은 시도
    }
  }
  await page.keyboard.press('End').catch(() => { });

  // 1) '장소 추가' 툴바 버튼 — codegen 확인
  try {
    const placeBtn = frame.getByRole('button', { name: '장소 추가' }).first();
    await placeBtn.waitFor({ timeout: 3000 });
    await placeBtn.click();
    log('info', '✓ "장소 추가" 툴바 버튼 클릭');
  } catch {
    log('warn', '장소 버튼 미감지 — place 첨부 skip (전체 발행은 계속)');
    return;
  }

  // 2) 검색창 — codegen 확인: textbox '장소명을 입력하세요'
  const searchInput = frame.getByRole('textbox', { name: '장소명을 입력하세요' }).first();
  try {
    await searchInput.waitFor({ timeout: 3000 });
    await searchInput.click();
    await searchInput.fill(query);
    log('info', `검색어 입력: "${query}"`);
  } catch {
    log('warn', '"장소명을 입력하세요" 검색창 미감지 — skip');
    return;
  }

  // 자동완성 드롭다운 렌더 대기
  await page.waitForTimeout(1200);

  // 3) 자동완성 옵션 선택 (codegen: role=option) — 매칭 우선, 없으면 첫 번째
  const optionCandidates: Locator[] = [
    frame.getByRole('option').filter({ hasText: place.name || place.address }).first(),
    frame.getByRole('option').first(),
  ];
  let optionClicked = false;
  for (const loc of optionCandidates) {
    try {
      await loc.waitFor({ timeout: 1500 });
      await loc.click();
      optionClicked = true;
      log('info', '✓ 자동완성 옵션 선택');
      break;
    } catch {
      continue;
    }
  }

  // 4) Enter로 검색 실행 (codegen: 옵션 클릭 후 검색창 다시 클릭 + Enter)
  try {
    await searchInput.click();
    await page.keyboard.press('Enter');
    if (!optionClicked) log('info', '자동완성 옵션 없음 → Enter로 직접 검색');
  } catch {
    // 무시
  }

  await page.waitForTimeout(2000);

  // 5) 검색 결과 첫 항목의 '추가' 버튼 클릭.
  //    실측(2026-05): li.se-place-map-search-result-item 안의 .se-place-add-button은
  //    기본 display:none이고 행에 hover해야 노출된다. role/name으론 안 잡혀 CSS 클래스+hover로 접근.
  try {
    const firstItem = frame.locator('.se-place-map-search-result-item').first();
    await firstItem.waitFor({ timeout: 3000 });
    await firstItem.hover();
    await page.waitForTimeout(300);
    await firstItem.locator('.se-place-add-button').first().click({ timeout: 2000 });
    log('info', '✓ 검색 결과 첫 항목 "추가" 클릭');
  } catch {
    log('warn', '검색 결과 "추가" 버튼 미감지 — skip (검색 결과 없거나 UI 변경, 전체 발행은 계속)');
    return;
  }

  // 6) '확인' 버튼 (최종 삽입 확정) — codegen 확인
  try {
    const confirmBtn = frame.getByRole('button', { name: '확인' }).first();
    await confirmBtn.waitFor({ timeout: 2000 });
    await confirmBtn.click();
    log('info', '✓ "확인" 버튼 클릭');
  } catch {
    // 확인 모달 없으면 통과
  }

  await page.waitForTimeout(1000);
  log('info', '✓ 장소 첨부 완료');
}

/**
 * 발행 설정 모달을 연다.
 * 카테고리/공개범위/댓글·공감 옵션은 모두 이 모달 안에 있다(글쓰기 화면엔 없음).
 * codegen 실측(2026-05): iframe 내부 getByRole('button', { name: '발행' }).
 */
export async function openPublishModal(handle: BotHandle): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  const publishBtn = frame.getByRole('button', { name: '발행' }).first();
  await publishBtn.waitFor({ timeout: 5000 });
  await publishBtn.click();
  log('info', '✓ 발행 설정 모달 열기');
  await page.waitForTimeout(800);
}

/**
 * 카테고리 지정. **발행 모달이 열려 있어야 한다**(openPublishModal 선행 필수).
 * codegen 실측(2026-05):
 *   드롭다운: getByRole('button', { name: '카테고리 목록 버튼' })
 *   항목    : getByRole('button', { name: <카테고리명> })  (substring 매칭)
 * 실패 시 throw 안 하고 skip — 매칭 실패해도 기본 카테고리로 발행 계속.
 */
export async function setCategory(handle: BotHandle, categoryName: string): Promise<void> {
  const trimmed = categoryName.trim();
  if (!trimmed) return;
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  log('info', `카테고리 지정 시도: "${trimmed}"`);

  // 1) 카테고리 드롭다운 열기 — codegen: '카테고리 목록 버튼'
  const opener = frame.getByRole('button', { name: '카테고리 목록 버튼' }).first();
  try {
    await opener.waitFor({ timeout: 3000 });
    await opener.click();
    log('info', '✓ 카테고리 목록 열림');
  } catch {
    log('warn', '카테고리 목록 버튼 미감지 — skip (발행 모달이 열렸는지 확인)');
    return;
  }

  await page.waitForTimeout(500);

  // 2) 카테고리 항목 클릭 — codegen: 항목이 button(name=카테고리명)
  const item = frame.getByRole('button', { name: trimmed }).first();
  try {
    await item.waitFor({ timeout: 2000 });
    await item.click();
    log('info', `✓ 카테고리 "${trimmed}" 선택`);
  } catch {
    log('warn', `카테고리 "${trimmed}" 매칭 실패 — skip`);
    return;
  }

  await page.waitForTimeout(400);
}

/**
 * 토글(체크박스/라디오) 현재 상태를 읽는다. 못 읽으면 null.
 * 실측(2026-05): 네이버 발행옵션은 `<label for="id">텍스트</label>` + 별도 `input#id` 구조.
 * 따라서 label의 for → getElementById로 실제 input을 찾아 .checked를 읽는다.
 */
async function readToggleState(frame: FrameLocator, label: string): Promise<boolean | null> {
  const el = frame.getByText(label, { exact: true }).first();
  try {
    return await el.evaluate((node) => {
      // node는 <label>. for로 연결된 별도 input을 우선 조회.
      const forId = node.getAttribute('for');
      if (forId) {
        const input = node.ownerDocument.getElementById(forId) as HTMLInputElement | null;
        if (input && typeof input.checked === 'boolean') return input.checked;
      }
      // fallback: label 내부 input, 또는 aria 속성
      const inner = node.querySelector('input[type="checkbox"], input[type="radio"]') as
        | HTMLInputElement
        | null;
      if (inner) return inner.checked;
      const aria = node.getAttribute('aria-checked') ?? node.getAttribute('aria-pressed');
      if (aria !== null) return aria === 'true';
      return null;
    });
  } catch {
    return null;
  }
}

/**
 * 발행 옵션(공개범위/댓글/공감) 설정. **발행 모달이 열려 있어야 한다**.
 * codegen 실측(2026-05):
 *   공개범위: getByText('전체공개') / getByText('비공개')  — 라디오(클릭=설정, idempotent)
 *   댓글허용: getByText('댓글허용')   — 토글(클릭=상태 반전)
 *   공감허용: getByText('공감허용')   — 토글
 * 토글은 현재 상태를 읽어 원하는 값과 다를 때만 클릭한다. 상태 불명 시 보류(경고).
 * 반자동이므로 보류돼도 사람이 모달에서 직접 확인/조정 가능.
 */
export async function setPublishOptions(
  handle: BotHandle,
  options: { commentAllow: boolean; sympathyAllow: boolean; isPublic: 'all' | 'private' },
): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  // 1) 공개범위 — 라디오: 원하는 항목 클릭(설정). exact 우선, 실패 시 부분일치.
  const visLabel = options.isPublic === 'private' ? '비공개' : '전체공개';
  const visCandidates: Locator[] = [
    frame.getByText(visLabel, { exact: true }).first(),
    frame.getByText(visLabel).first(),
  ];
  let visSet = false;
  for (const loc of visCandidates) {
    try {
      await loc.waitFor({ timeout: 2000 });
      await loc.click();
      visSet = true;
      log('info', `✓ 공개범위: ${visLabel}`);
      break;
    } catch {
      continue;
    }
  }
  if (!visSet) log('warn', `공개범위 "${visLabel}" 미감지 — skip`);

  await page.waitForTimeout(300);

  // 2) 댓글허용 / 공감허용 — 토글: 현재 상태와 다를 때만 클릭
  await setToggle(handle, '댓글허용', options.commentAllow);
  await setToggle(handle, '공감허용', options.sympathyAllow);
}

/**
 * 토글을 원하는 상태로 맞춘다. 이미 같으면 클릭 안 함. 상태 불명이면 보류(경고).
 */
async function setToggle(handle: BotHandle, label: string, desired: boolean): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');
  const el = frame.getByText(label, { exact: true }).first();

  try {
    await el.waitFor({ timeout: 2000 });
  } catch {
    log('warn', `"${label}" 미감지 — skip`);
    return;
  }

  const want = desired ? '허용' : '비허용';
  const state = await readToggleState(frame, label);

  if (state === null) {
    log(
      'warn',
      `"${label}" 현재 상태 불명 — 자동 토글 보류(오작동 방지). 발행 모달에서 직접 ${want}으로 확인하세요`,
    );
    return;
  }
  if (state === desired) {
    log('info', `✓ "${label}" 이미 ${want} 상태 — 유지`);
    return;
  }
  try {
    await el.click();
    log('info', `✓ "${label}" → ${want}으로 변경`);
    await page.waitForTimeout(200);
  } catch {
    log('warn', `"${label}" 토글 클릭 실패 — skip`);
  }
}

/**
 * 임시저장 클릭.
 * codegen 확인: 저장 버튼은 iframe 내부의 getByRole('button', { name: '저장', exact: true }).
 */
export async function saveAsDraft(handle: BotHandle): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  const saveBtn = frame.getByRole('button', { name: '저장', exact: true }).first();
  try {
    await saveBtn.waitFor({ timeout: 3000 });
    await saveBtn.click();
    log('info', '✓ 임시저장 버튼 클릭 (iframe 내부 role=button)');
  } catch {
    throw new Error('SAVE_BUTTON_NOT_FOUND');
  }

  // 저장 확인 모달이 뜨면 확인
  const confirmBtn = frame.getByRole('button', { name: '확인', exact: true }).first();
  try {
    await confirmBtn.waitFor({ timeout: 2000 });
    await confirmBtn.click();
    log('info', '저장 확인 모달 확인');
  } catch {
    // 모달 없으면 통과
  }

  await page.waitForTimeout(2000);
}

/**
 * 후보 locator 중 먼저 visible해지는 것을 클릭. 모두 실패 시 throw.
 */
async function clickFirstAvailable(
  candidates: Locator[],
  label: string,
  timeoutPerCandidate = 2000,
): Promise<void> {
  for (const loc of candidates) {
    try {
      await loc.waitFor({ timeout: timeoutPerCandidate });
      await loc.click();
      return;
    } catch {
      continue;
    }
  }
  throw new Error(`SELECTOR_NOT_FOUND: ${label}`);
}
