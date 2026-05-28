// 발행 모달 안의 최종 [발행] 버튼 셀렉터 진단 (자동 완료, 발행 안 함)
//
// 글쓰기 페이지 → 발행 모달 열기 → 모달 안의 '발행' 텍스트 버튼들의
// 구조/조상/클래스를 덤프해 툴바 발행 버튼과 구분 가능한 셀렉터를 찾는다.
//
// 실행: node scripts/inspect-final-publish.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function loadEnv() {
  const out = {};
  for (const raw of fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

const env = loadEnv();
const blogId = env.NAVER_BLOG_ID?.trim();
const userDataDir =
  env.PLAYWRIGHT_USER_DATA_DIR?.trim() || path.resolve(process.cwd(), '.playwright-user-data');

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = context.pages()[0] ?? (await context.newPage());

await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, {
  waitUntil: 'domcontentloaded',
});
if (page.url().includes('nid.naver.com')) {
  console.log('[probe] 로그인 페이지 — 직접 로그인 (최대 5분)');
  try {
    const keep = page.locator('#keep[role="checkbox"]').first();
    await keep.waitFor({ timeout: 3000 });
    if ((await keep.getAttribute('aria-checked')) !== 'true') await keep.click();
  } catch {}
  await page.waitForURL((u) => !u.toString().includes('nid.naver.com'), { timeout: 300_000 });
}

const frame = page.frameLocator('iframe[name="mainFrame"]');
await frame.locator('.se-text-paragraph').first().waitFor({ timeout: 15000 });
console.log('  ✓ 에디터 감지');
try {
  const cancel = frame.getByRole('button', { name: '취소', exact: true }).first();
  await cancel.waitFor({ timeout: 2500 });
  await cancel.click();
} catch {}

// 발행 모달 열기
await frame.getByRole('button', { name: '발행' }).first().click();
await page.waitForTimeout(1200);
console.log('  ✓ 발행 모달 열림\n');

await page.screenshot({ path: path.resolve(process.cwd(), 'scripts/publish-modal-debug.png') });

// 모달 안의 발행 관련 버튼 + 모든 '발행' 텍스트 요소 덤프
const f = page.frame({ name: 'mainFrame' });
const dump = await f.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // 1) 텍스트가 정확히 '발행'인 말단 요소(숨김 포함) → 가까운 클릭가능 조상
  const exactEls = [...document.querySelectorAll('*')]
    .filter((el) => el.children.length === 0 && clean(el.textContent) === '발행')
    .slice(0, 10)
    .map((el) => {
      const btn = el.closest('button,a,[role="button"]') || el.parentElement || el;
      return {
        elTag: el.tagName,
        elCls: clean(el.className).slice(0, 60),
        btnTag: btn.tagName,
        btnCls: clean(btn.className).slice(0, 80),
        btnAria: btn.getAttribute('aria-label'),
        btnType: btn.getAttribute('type'),
        // 조상 모달 컨테이너 식별
        ancestorModal: !!el.closest(
          '[class*="layer" i],[class*="modal" i],[class*="publish" i],[class*="popup" i]',
        ),
        btnHtml: clean(btn.outerHTML).slice(0, 220),
      };
    });
  // 2) 발행 관련 클래스/aria
  const cls = [
    ...document.querySelectorAll(
      'button[class*="publish" i],button[class*="confirm" i],[class*="publish-btn" i]',
    ),
  ]
    .slice(0, 10)
    .map((b) => ({
      tag: b.tagName,
      cls: clean(b.className).slice(0, 80),
      text: clean(b.textContent).slice(0, 30),
      aria: b.getAttribute('aria-label'),
    }));
  // 3) 발행 모달 컨테이너 후보
  const modal = document.querySelector(
    '[class*="publish" i][class*="layer" i], [class*="publish" i][class*="popup" i], [class*="publish-setting" i]',
  );
  const modalCls = modal ? clean(modal.className).slice(0, 100) : '(못 찾음)';
  return { exactEls, classBased: cls, modalCls };
});

console.log('=== 텍스트="발행" 말단요소(숨김 포함) → 클릭 가능 조상 ===');
for (const e of dump.exactEls) {
  console.log(JSON.stringify(e));
}
console.log('\n=== publish/confirm 클래스 버튼 ===');
for (const c of dump.classBased) {
  console.log(JSON.stringify(c));
}
console.log(`\n=== 모달 컨테이너 클래스: ${dump.modalCls}`);

await page.waitForTimeout(2000);
await context.close();
console.log('\n[probe] 완료 (발행 안 함)');
