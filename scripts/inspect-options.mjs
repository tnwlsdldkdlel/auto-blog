// 발행 옵션(공개범위/댓글/공감) 셀렉터 캡처 스크립트 (Task: 옵션 자동화)
//
// 발행 모달까지 자동으로 연 뒤 Inspector에서 멈춘다.
// → Inspector에서 "Record" 켜고 아래 토글들을 직접 클릭해 셀렉터 캡처:
//     - 공개범위: 전체공개 / 비공개
//     - 댓글 허용 (체크박스/토글)
//     - 공감 허용 (체크박스/토글)
//   생성된 locator 코드를 복사해서 전달.
//
// 실행:
//   node scripts/inspect-options.mjs

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

console.log(`[inspect] 글쓰기 진입: https://blog.naver.com/${blogId}?Redirect=Write`);
await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });

const url = page.url();
if (url.includes('nid.naver.com') || url.includes('nidlogin.login')) {
  console.log('[inspect] 로그인 페이지 — 창에서 직접 로그인하세요 (최대 5분)');
  await page.waitForURL(
    (u) => !u.toString().includes('nid.naver.com') && !u.toString().includes('nidlogin.login'),
    { timeout: 300_000 },
  );
}

const frame = page.frameLocator('iframe[name="mainFrame"]');
try {
  await frame.locator('.se-text-paragraph').first().waitFor({ timeout: 15000 });
  console.log('[inspect] ✓ 에디터 감지');

  // 복구 팝업 닫기
  try {
    const cancel = frame.getByRole('button', { name: '취소', exact: true }).first();
    await cancel.waitFor({ timeout: 2500 });
    await cancel.click();
    console.log('[inspect] 복구 팝업 닫음');
  } catch {
    /* 없음 */
  }

  // 발행 모달 열기 (openPublishModal와 동일: '발행' 버튼)
  const publishBtn = frame.getByRole('button', { name: '발행' }).first();
  await publishBtn.waitFor({ timeout: 5000 });
  await publishBtn.click();
  await page.waitForTimeout(800);
  console.log('[inspect] ✓ 발행 설정 모달 열림');
} catch (e) {
  console.log(`[inspect] ⚠ 사전 단계 일부 실패(${e.message}) — 그래도 Inspector는 띄웁니다`);
}

console.log('\n========================================================');
console.log(' Playwright Inspector가 열립니다.');
console.log(' 1) 상단 "Record" 버튼 ON.');
console.log(' 2) 발행 모달에서 아래를 직접 클릭(토글)하세요:');
console.log('    - 공개범위: 전체공개 / 비공개');
console.log('    - 댓글 허용');
console.log('    - 공감 허용');
console.log(' 3) 생성된 locator 코드를 복사해 전달해 주세요.');
console.log(' ※ 최종 [발행]은 누르지 마세요(검증용).');
console.log('========================================================\n');

await page.pause();

await context.close();
