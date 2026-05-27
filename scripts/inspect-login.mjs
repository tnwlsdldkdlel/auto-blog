// 네이버 로그인 페이지의 "로그인 상태 유지" 컨트롤 셀렉터 진단 (자격증명 불필요)
//
// 세션 영구저장 버그 해결용. 로그인 페이지로 진입해 "로그인 상태 유지"
// 관련 요소(체크박스/라벨)의 구조를 덤프한다. 자동 완료(사용자 조작 X).
//
// 실행: node scripts/inspect-login.mjs

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

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = context.pages()[0] ?? (await context.newPage());

console.log('[login-probe] 글쓰기 진입(로그인 페이지로 리다이렉트 기대)');
await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const url = page.url();
console.log(`[login-probe] 현재 URL: ${url}`);
if (!url.includes('nid.naver.com') && !url.includes('nidlogin')) {
  console.log('[login-probe] ⚠ 로그인 페이지가 아님(이미 로그인 상태일 수 있음). 그래도 keep 요소 탐색 시도.');
}

// "로그인 상태 유지" 관련 요소 전수 탐색
const result = await page.evaluate(() => {
  const out = { byText: [], byKeep: [], checkboxes: [] };
  // 1) 텍스트로 찾기
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || '').trim();
    if (t === '로그인 상태 유지' && n.children.length <= 1) {
      out.byText.push({
        tag: n.tagName,
        id: n.id || null,
        cls: typeof n.className === 'string' ? n.className : null,
        htmlFor: n.getAttribute('for'),
        html: (n.outerHTML || '').replace(/\s+/g, ' ').slice(0, 200),
      });
    }
  }
  // 2) id/class에 keep 포함
  document.querySelectorAll('[id*="keep" i],[class*="keep" i]').forEach((el) => {
    out.byKeep.push({
      tag: el.tagName,
      id: el.id || null,
      cls: typeof el.className === 'string' ? el.className : null,
      type: el.getAttribute('type'),
      checked: el.tagName === 'INPUT' ? el.checked : null,
      ariaChecked: el.getAttribute('aria-checked'),
      role: el.getAttribute('role'),
      html: (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 200),
    });
  });
  // 3) 모든 체크박스
  document.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    out.checkboxes.push({ id: el.id || null, cls: typeof el.className === 'string' ? el.className : null, checked: el.checked });
  });
  return out;
});

console.log('\n=== "로그인 상태 유지" 텍스트 매칭 ===');
console.log(JSON.stringify(result.byText, null, 2));
console.log('\n=== id/class에 "keep" 포함 ===');
console.log(JSON.stringify(result.byKeep, null, 2));
console.log('\n=== 페이지 내 모든 체크박스 ===');
console.log(JSON.stringify(result.checkboxes, null, 2));

await context.close();
console.log('\n[login-probe] 완료');
