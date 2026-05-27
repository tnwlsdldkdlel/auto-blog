// 발행 옵션 자동화 라이브 검증 + 토글 구조 진단 스크립트
//
// setPublishOptions의 셀렉터/상태읽기가 실제로 먹는지 확인한다.
// 토글 상태를 못 읽으면(null) 구조 파악을 위해 컨테이너 HTML을 덤프한다.
// ※ 최종 [발행]은 누르지 않음.
//
// 실행: node scripts/verify-options.mjs

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

const env = loadEnv();
const blogId = env.NAVER_BLOG_ID?.trim();
const userDataDir = env.PLAYWRIGHT_USER_DATA_DIR?.trim() || path.resolve(process.cwd(), '.playwright-user-data');

// naver-bot.ts의 readToggleState와 동일한 로직 (검증용 미러)
// 네이버: <label for="id">텍스트</label> + 별도 input#id → for로 input 찾아 .checked
function readStateFn(node) {
  const forId = node.getAttribute('for');
  if (forId) {
    const input = node.ownerDocument.getElementById(forId);
    if (input && typeof input.checked === 'boolean') return input.checked;
  }
  const inner = node.querySelector && node.querySelector('input[type="checkbox"], input[type="radio"]');
  if (inner) return inner.checked;
  const aria = node.getAttribute('aria-checked') ?? node.getAttribute('aria-pressed');
  if (aria !== null) return aria === 'true';
  return null;
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = context.pages()[0] ?? (await context.newPage());

console.log('[verify-opt] 글쓰기 진입');
await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });
const url = page.url();
if (url.includes('nid.naver.com') || url.includes('nidlogin.login')) {
  console.log('[verify-opt] 로그인 페이지 — 직접 로그인하세요 (최대 5분)');
  await page.waitForURL(
    (u) => !u.toString().includes('nid.naver.com') && !u.toString().includes('nidlogin.login'),
    { timeout: 300_000 },
  );
}

const frame = page.frameLocator('iframe[name="mainFrame"]');
await frame.locator('div[contenteditable="true"]').first().waitFor({ timeout: 15000 });
console.log('  ✓ 에디터 감지');
try {
  const cancel = frame.getByRole('button', { name: '취소', exact: true }).first();
  await cancel.waitFor({ timeout: 2500 });
  await cancel.click();
} catch {}

// 발행 모달 열기
await frame.getByRole('button', { name: '발행' }).first().click();
await page.waitForTimeout(900);
console.log('  ✓ 발행 모달 열림\n');

// 각 옵션 컨트롤: 감지 여부 + 상태 + 컨테이너 HTML 덤프
for (const label of ['전체공개', '비공개', '댓글허용', '공감허용']) {
  const el = frame.getByText(label, { exact: true }).first();
  try {
    await el.waitFor({ timeout: 2500 });
  } catch {
    console.log(`[${label}] ⚠ 미감지 (exact)`);
    continue;
  }
  const info = await el.evaluate((node, fnStr) => {
    const readState = new Function('node', 'return (' + fnStr + ')(node)');
    const cand = node.closest('[role="checkbox"],[role="switch"],label,button,li') ?? node.parentElement ?? node;
    return {
      tag: node.tagName,
      role: node.getAttribute('role'),
      state: readState(node),
      candTag: cand.tagName,
      candClass: typeof cand.className === 'string' ? cand.className : null,
      candHtml: (cand.outerHTML || '').replace(/\s+/g, ' ').slice(0, 260),
    };
  }, readStateFn.toString());
  console.log(`[${label}] state=${info.state} tag=${info.tag} role=${info.role}`);
  console.log(`         cand=${info.candTag}.${info.candClass}`);
  console.log(`         html=${info.candHtml}\n`);
}

// 토글 동작 확인: 댓글허용 클릭 전/후 상태 비교
console.log('[toggle test] 댓글허용 클릭 전후 상태 비교');
const commentEl = frame.getByText('댓글허용', { exact: true }).first();
const before = await commentEl.evaluate((n, f) => new Function('node', 'return (' + f + ')(node)')(n), readStateFn.toString());
await commentEl.click();
await page.waitForTimeout(400);
const after = await commentEl.evaluate((n, f) => new Function('node', 'return (' + f + ')(node)')(n), readStateFn.toString());
console.log(`  before=${before} → after=${after} ${before !== after ? '✓ 상태 변화 감지됨(토글+상태읽기 OK)' : '⚠ 변화 없음(상태읽기 실패 가능)'}`);
// 원상복구
await commentEl.click().catch(() => {});

console.log('\n[verify-opt] 검증 끝. 5초 후 창 닫음 (발행 안 누름).');
await page.waitForTimeout(5000);
await context.close();
console.log('[verify-opt] 완료');
