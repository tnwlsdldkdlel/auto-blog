import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
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
 * 10초 이내 contenteditable DOM이 떠야 한다.
 */
export async function waitForEditor(handle: BotHandle, timeoutMs = 10000): Promise<void> {
  const { page, log } = handle;
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
 * "이전에 작성하던 글이 있습니다" 류 모달이 떠 있으면 "새로 작성"을 클릭해 닫는다.
 * 없으면 조용히 통과.
 */
export async function dismissRecoveryPopup(handle: BotHandle): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');
  const cancelBtn = frame.locator('button:has-text("취소")').first();
  try {
    await cancelBtn.waitFor({ timeout: 2000 });
    await cancelBtn.click();
    log('info', '복구 팝업 닫음');
  } catch {
    // 팝업 없음 — 정상
  }
}

/**
 * Day 5: 제목 + 본문 텍스트 자동 입력.
 * Phase 1에서는 text section만 합쳐 입력하고, image는 Day 6에서 본문 말미에 일괄 첨부.
 */
export async function fillTitleAndBody(handle: BotHandle, payload: BlogPayload): Promise<void> {
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  log('info', `제목 입력: "${payload.title}"`);
  const titleArea = frame
    .locator('.se-section-documentTitle .se-text-paragraph')
    .first();
  await titleArea.click();
  await page.keyboard.insertText(payload.title);

  const textSections = payload.sections.filter(isText).map((s) => s.value);
  const bodyText = textSections.join('\n\n');

  log('info', `본문 입력: ${textSections.length}개 단락 (${bodyText.length}자)`);
  const bodyArea = frame.locator('.se-section-text .se-text-paragraph').first();
  await bodyArea.click();
  await page.keyboard.insertText(bodyText);

  log('info', '✓ 제목/본문 입력 완료');
}

/**
 * Day 6: 본문 말미에 이미지들을 일괄 첨부.
 * 사진 툴바 버튼 클릭 → filechooser로 로컬 파일 주입.
 * (sections 순서대로 본문 중간 배치는 Phase 2.)
 */
export async function attachImages(handle: BotHandle, imagePaths: string[]): Promise<void> {
  if (imagePaths.length === 0) return;
  const { page, log } = handle;
  const frame = page.frameLocator('iframe[name="mainFrame"]');

  log('info', `이미지 ${imagePaths.length}장 첨부 시작`);

  // 본문 끝으로 커서 이동
  const bodyArea = frame.locator('.se-section-text .se-text-paragraph').last();
  await bodyArea.click();
  await page.keyboard.press('End');

  // 사진 버튼 셀렉터 후보들 (네이버는 종종 마이너 변경됨)
  const photoBtnCandidates = [
    'button.se-image-toolbar-button',
    'button[aria-label*="사진"]',
    '.se-toolbar-item-image button',
    'button:has-text("사진")',
  ];

  let clicked = false;
  for (const sel of photoBtnCandidates) {
    const btn = frame.locator(sel).first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 1500 });
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        btn.click(),
      ]);
      await chooser.setFiles(imagePaths);
      clicked = true;
      log('info', `✓ 사진 버튼 매칭 셀렉터: ${sel}`);
      break;
    } catch {
      continue;
    }
  }

  if (!clicked) {
    // 폴백: hidden input[type=file]에 직접 주입
    log('warn', '사진 버튼 미감지 → input[type=file] 직접 주입 시도');
    const fileInput = frame.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(imagePaths);
  }

  // 이미지 업로드/렌더링 대기 (Phase 1: 고정 대기)
  await page.waitForTimeout(2500 + imagePaths.length * 800);
  log('info', '✓ 이미지 첨부 단계 완료');
}

/**
 * Day 6: 임시저장 클릭.
 * 네이버 스마트에디터의 "저장" 버튼은 본문 외부(상단 영역)에 있어 page 직접 접근.
 */
export async function saveAsDraft(handle: BotHandle): Promise<void> {
  const { page, log } = handle;

  const saveBtnCandidates = [
    'button.save_btn__bzc5B',
    'button:has-text("저장")',
    'a:has-text("저장")',
  ];

  for (const sel of saveBtnCandidates) {
    const btn = page.locator(sel).first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 1500 });
      await btn.click();
      log('info', `✓ 임시저장 버튼 클릭: ${sel}`);
      // 저장 확인 모달이 뜰 수도 있음
      const confirmBtn = page.locator('button:has-text("확인")').first();
      try {
        await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
        await confirmBtn.click();
        log('info', '저장 확인 모달 확인');
      } catch {
        // 모달 없으면 그냥 통과
      }
      await page.waitForTimeout(2000);
      return;
    } catch {
      continue;
    }
  }
  throw new Error('SAVE_BUTTON_NOT_FOUND');
}
