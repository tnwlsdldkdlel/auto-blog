import path from 'node:path';
import { chromium, type BrowserContext, type Page, type Locator } from 'playwright';
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
    throw new Error('NAVER_BLOG_ID가 .env.local에 설정되지 않았습니다.');
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
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless ?? false,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  const page = context.pages()[0] ?? (await context.newPage());

  const writeUrl = `https://blog.naver.com/${config.blogId}?Redirect=Write`;
  log('info', `글쓰기 페이지 진입: ${writeUrl}`);
  await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });

  return { context, page, logs, log };
}

/**
 * PRD §5.1 1단계: 스마트에디터 로딩 검증.
 * - 로그인 페이지 감지 시: 사용자가 직접 로그인할 수 있도록 별도 긴 대기 (기본 5분).
 * - 글쓰기 페이지 도달 후: contenteditable DOM 감지를 timeoutMs(기본 10초) 내에 완료.
 */
export async function waitForEditor(
  handle: BotHandle,
  timeoutMs = 10000,
  loginWaitMs = 300_000,
): Promise<void> {
  const { page, log } = handle;

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const url = page.url();
  const isLoginPage =
    url.includes('nid.naver.com') || url.includes('nidlogin.login');

  if (isLoginPage) {
    log(
      'info',
      `네이버 로그인 페이지 감지 — 띄워진 크롬 창에서 직접 로그인해 주세요 (최대 ${Math.round(loginWaitMs / 1000)}초 대기)`,
    );
    try {
      await page.waitForURL(
        (u) => {
          const s = u.toString();
          return !s.includes('nid.naver.com') && !s.includes('nidlogin.login');
        },
        { timeout: loginWaitMs },
      );
      log('info', '✓ 로그인 완료 — 글쓰기 페이지 로딩 대기');
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    } catch {
      throw new Error('LOGIN_TIMEOUT');
    }
  }

  log('info', `에디터 로딩 대기 (최대 ${timeoutMs}ms)...`);
  try {
    await page.locator('iframe[name="mainFrame"]').first().waitFor({ timeout: timeoutMs });
    const frame = page.frameLocator('iframe[name="mainFrame"]');
    await frame.locator('div[contenteditable="true"]').first().waitFor({ timeout: timeoutMs });
    log('info', '✓ 에디터 contenteditable 감지 완료');
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
