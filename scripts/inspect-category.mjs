// 카테고리 셀렉터 캡처용 검증 스크립트 (Task #15)
//
// 목적: setCategory()의 셀렉터가 실제 네이버 스마트에디터 ONE UI와 맞는지
//      codegen으로 검증/보정하기 위함.
//
// 핵심: 기존 .playwright-user-data 세션을 그대로 재활용하므로 재로그인 불필요.
//      (일반 `npx playwright codegen`은 새 브라우저라 매번 로그인해야 함)
//
// 실행:
//   node scripts/inspect-category.mjs
//
// 동작:
//   1) 로그인된 persistent context로 글쓰기 페이지 진입
//   2) 에디터 로딩 대기 + 복구 팝업 닫기
//   3) page.pause()로 Playwright Inspector(레코더)를 띄움
//      → Inspector에서 "Record" 누르고 카테고리 드롭다운 + 카테고리 항목을
//        직접 클릭하면 정확한 locator 코드가 생성됨. 그걸 복사해서 전달.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// --- .env 수동 로드 (standalone node는 Next.js처럼 자동 로드 안 함) ---
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env 파일을 찾을 수 없습니다.');
  }
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // 양쪽 따옴표 제거
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = loadEnv();
const blogId = env.NAVER_BLOG_ID?.trim();
if (!blogId) throw new Error('NAVER_BLOG_ID가 .env에 없습니다.');

const userDataDir =
  env.PLAYWRIGHT_USER_DATA_DIR?.trim() || path.resolve(process.cwd(), '.playwright-user-data');

console.log(`[inspect] persistent context: ${userDataDir}`);
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});

const page = context.pages()[0] ?? (await context.newPage());

const writeUrl = `https://blog.naver.com/${blogId}?Redirect=Write`;
console.log(`[inspect] 글쓰기 페이지 진입: ${writeUrl}`);
await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });

// 로그인 페이지면 사용자가 직접 로그인할 때까지 대기 (최대 5분)
const url = page.url();
if (url.includes('nid.naver.com') || url.includes('nidlogin.login')) {
  console.log('[inspect] 로그인 페이지 감지 — 창에서 직접 로그인하세요 (최대 5분 대기)');
  await page.waitForURL(
    (u) => {
      const s = u.toString();
      return !s.includes('nid.naver.com') && !s.includes('nidlogin.login');
    },
    { timeout: 300_000 },
  );
}

// 에디터 iframe + contenteditable 대기
try {
  await page.locator('iframe[name="mainFrame"]').first().waitFor({ timeout: 15000 });
  const frame = page.frameLocator('iframe[name="mainFrame"]');
  await frame.locator('.se-text-paragraph').first().waitFor({ timeout: 15000 });
  console.log('[inspect] ✓ 에디터 감지');

  // 복구 팝업이 있으면 닫기
  const cancelBtn = frame.getByRole('button', { name: '취소', exact: true }).first();
  try {
    await cancelBtn.waitFor({ timeout: 2500 });
    await cancelBtn.click();
    console.log('[inspect] 복구 팝업 닫음');
  } catch {
    // 팝업 없음 — 정상
  }
} catch {
  console.log('[inspect] ⚠ 에디터 감지 실패 — 그래도 Inspector는 띄웁니다');
}

console.log('\n========================================================');
console.log(' Playwright Inspector가 열립니다.');
console.log(' 1) 상단의 "Record" 버튼을 누르세요.');
console.log(' 2) 발행 설정의 [카테고리] 드롭다운을 클릭하세요.');
console.log(' 3) 원하는 카테고리 항목을 클릭하세요.');
console.log(' 4) Inspector에 생성된 locator 코드를 복사해서 전달해 주세요.');
console.log(' (참고: 카테고리 UI는 발행 모달 안에 있을 수 있습니다.');
console.log('  그 경우 우측 하단 "발행" 버튼을 먼저 눌러 모달을 여세요.)');
console.log('========================================================\n');

await page.pause();

await context.close();
