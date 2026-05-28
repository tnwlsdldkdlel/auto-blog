// 카테고리 자동화 라이브 검증 스크립트 (Task #15)
//
// naver-bot.ts의 openPublishModal + setCategory 셀렉터가 실제로 먹는지 확인.
// ※ 최종 [발행]은 누르지 않음 — 발행 모달 열고 카테고리만 선택(안전).
//
// 실행:
//   node scripts/verify-category.mjs            # 기본 카테고리 '놀고'
//   node scripts/verify-category.mjs "맛집"      # 카테고리명 지정

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const categoryName = (process.argv[2] ?? '놀고').trim();
const env = loadEnv();
const blogId = env.NAVER_BLOG_ID?.trim();
const userDataDir =
  env.PLAYWRIGHT_USER_DATA_DIR?.trim() || path.resolve(process.cwd(), '.playwright-user-data');

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = context.pages()[0] ?? (await context.newPage());

console.log(`[verify] 글쓰기 진입 (카테고리 검증 대상: "${categoryName}")`);
await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });

const url = page.url();
if (url.includes('nid.naver.com') || url.includes('nidlogin.login')) {
  console.log('[verify] 로그인 페이지 — 창에서 직접 로그인하세요 (최대 5분)');
  await page.waitForURL(
    (u) => !u.toString().includes('nid.naver.com') && !u.toString().includes('nidlogin.login'),
    { timeout: 300_000 },
  );
}

const frame = page.frameLocator('iframe[name="mainFrame"]');
await frame.locator('.se-text-paragraph').first().waitFor({ timeout: 15000 });
ok('에디터 감지');

// 복구 팝업 닫기
try {
  const cancel = frame.getByRole('button', { name: '취소', exact: true }).first();
  await cancel.waitFor({ timeout: 2500 });
  await cancel.click();
  ok('복구 팝업 닫음');
} catch {
  /* 없음 */
}

console.log('\n[verify] STEP 1 — openPublishModal');
try {
  const publishBtn = frame.getByRole('button', { name: '발행' }).first();
  await publishBtn.waitFor({ timeout: 5000 });
  await publishBtn.click();
  await page.waitForTimeout(800);
  ok("'발행' 버튼 클릭 → 모달 열림");
} catch (e) {
  warn(`'발행' 버튼 실패: ${e.message}`);
}

console.log('\n[verify] STEP 2 — 카테고리 목록 버튼');
let openerOk = false;
try {
  const opener = frame.getByRole('button', { name: '카테고리 목록 버튼' }).first();
  await opener.waitFor({ timeout: 3000 });
  await opener.click();
  await page.waitForTimeout(500);
  openerOk = true;
  ok("'카테고리 목록 버튼' 클릭 → 목록 열림");
} catch (e) {
  warn(`'카테고리 목록 버튼' 실패: ${e.message}`);
}

console.log(`\n[verify] STEP 3 — 카테고리 항목 "${categoryName}" 클릭`);
if (openerOk) {
  try {
    const item = frame.getByRole('button', { name: categoryName }).first();
    await item.waitFor({ timeout: 2000 });
    await item.click();
    await page.waitForTimeout(400);
    ok(`카테고리 "${categoryName}" 선택 성공`);
  } catch (e) {
    warn(`카테고리 "${categoryName}" 매칭 실패: ${e.message}`);
  }
}

console.log('\n[verify] 검증 끝. 5초 후 창을 닫습니다 (발행은 누르지 않음).');
await page.waitForTimeout(5000);
await context.close();
console.log('[verify] 완료');
