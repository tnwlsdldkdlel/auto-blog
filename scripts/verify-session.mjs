// 세션 영구 저장 수정 검증 스크립트
//
// 1) persistent context 실행 → 로그인 페이지면 "로그인 상태 유지"(#keep) 자동 ON
// 2) 사용자가 1회 로그인 → 컨텍스트 닫기(쿠키 flush)
// 3) 재실행 → 로그인 페이지로 가는지 / 에디터로 바로 가는지 판정
//
// 실행: node scripts/verify-session.mjs

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
const writeUrl = `https://blog.naver.com/${blogId}?Redirect=Write`;
const isLogin = (u) => u.includes('nid.naver.com') || u.includes('nidlogin');

async function launch() {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}

// naver-bot.ts의 enableKeepLogin와 동일 로직(검증용 미러)
async function enableKeepLogin(page) {
  try {
    const keep = page.locator('#keep[role="checkbox"]').first();
    await keep.waitFor({ timeout: 3000 });
    const checked = await keep.getAttribute('aria-checked');
    if (checked === 'true') {
      console.log('  ✓ "로그인 상태 유지" 이미 ON');
      return;
    }
    await keep.click();
    const after = await keep.getAttribute('aria-checked');
    console.log(`  ✓ "로그인 상태 유지" 클릭 (aria-checked: ${checked} → ${after})`);
  } catch {
    console.log('  ⚠ "로그인 상태 유지" 컨트롤 미감지');
  }
}

// === 1차 실행 ===
console.log('[1차] persistent context 실행');
let { ctx, page } = await launch();
await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

if (isLogin(page.url())) {
  console.log('[1차] 로그인 페이지 — 상태유지 켜고, 직접 로그인하세요 (최대 5분)');
  await enableKeepLogin(page);
  await page.waitForURL((u) => !isLogin(u.toString()), { timeout: 300_000 });
  console.log('[1차] ✓ 로그인 완료');
} else {
  console.log('[1차] 이미 로그인 상태였음 (로그인 페이지 안 뜸)');
  // 그래도 다음 비교를 위해 진행
}

await page.waitForTimeout(1500);
console.log('[1차] 컨텍스트 닫기(쿠키 flush)');
await ctx.close();
await new Promise((r) => setTimeout(r, 1500));

// === 2차 실행 (재로그인 필요 여부 판정) ===
console.log('\n[2차] persistent context 재실행 — 세션 유지 여부 확인');
({ ctx, page } = await launch());
await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const url2 = page.url();
console.log(`[2차] URL: ${url2}`);
if (isLogin(url2)) {
  console.log(
    '\n❌ 결과: 2차에서도 로그인 페이지 — 세션 유지 실패(쿠키가 여전히 세션 쿠키일 가능성)',
  );
} else {
  console.log('\n✅ 결과: 2차에서 로그인 생략 — 세션 영구 저장 성공! 재로그인 불필요');
}

await page.waitForTimeout(3000);
await ctx.close();
console.log('[verify-session] 완료');
