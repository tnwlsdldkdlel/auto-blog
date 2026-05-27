// 장소(네이버 지도) 첨부 라이브 검증 + 진단 스크립트
//
// attachPlace 6단계를 미러링하되, '추가' 버튼이 안 잡히면 그 시점의
// 버튼 목록/스크린샷을 남겨 실제 UI를 진단한다. (발행은 안 누름)
//
// 실행:
//   node scripts/verify-place.mjs "스타벅스 강남R점"
//   node scripts/verify-place.mjs "백종원의 한신포차" "서울 강남구"

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

const placeName = (process.argv[2] ?? '스타벅스 강남R점').trim();
const placeAddress = (process.argv[3] ?? '').trim();
const query = `${placeName} ${placeAddress}`.trim();

const env = loadEnv();
const blogId = env.NAVER_BLOG_ID?.trim();
const userDataDir = env.PLAYWRIGHT_USER_DATA_DIR?.trim() || path.resolve(process.cwd(), '.playwright-user-data');
const shot = (name) => path.resolve(process.cwd(), `scripts/place-debug-${name}.png`);

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = context.pages()[0] ?? (await context.newPage());

console.log(`[verify-place] 검색어: "${query}"`);
await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });
const isLogin = (u) => u.includes('nid.naver.com') || u.includes('nidlogin');
if (isLogin(page.url())) {
  // 세션 유지 수정 적용 후엔 거의 안 뜨지만, 만약을 위해
  console.log('[verify-place] 로그인 페이지 — 직접 로그인하세요 (최대 5분)');
  try {
    const keep = page.locator('#keep[role="checkbox"]').first();
    await keep.waitFor({ timeout: 3000 });
    if ((await keep.getAttribute('aria-checked')) !== 'true') await keep.click();
  } catch {}
  await page.waitForURL((u) => !isLogin(u.toString()), { timeout: 300_000 });
}

const frame = page.frameLocator('iframe[name="mainFrame"]');
await frame.locator('div[contenteditable="true"]').first().waitFor({ timeout: 15000 });
console.log('  ✓ 에디터 감지');
try {
  const cancel = frame.getByRole('button', { name: '취소', exact: true }).first();
  await cancel.waitFor({ timeout: 2500 });
  await cancel.click();
} catch {}

// 본문 끝 커서
try {
  await frame.locator('div').filter({ hasText: /^본문 추가$/ }).first().click({ timeout: 1500 });
} catch {
  try { await frame.locator('.se-section-text .se-text-paragraph').last().click({ timeout: 1500 }); } catch {}
}
await page.keyboard.press('End').catch(() => {});

// 1) 장소 추가
try {
  await frame.getByRole('button', { name: '장소 추가' }).first().click({ timeout: 3000 });
  console.log('  ✓ STEP1 "장소 추가" 클릭');
} catch (e) {
  console.log(`  ✗ STEP1 "장소 추가" 미감지: ${e.message}`);
  await context.close();
  process.exit(0);
}

// 2) 검색창
const searchInput = frame.getByRole('textbox', { name: '장소명을 입력하세요' }).first();
try {
  await searchInput.click({ timeout: 3000 });
  await searchInput.fill(query);
  console.log('  ✓ STEP2 검색어 입력');
} catch (e) {
  console.log(`  ✗ STEP2 검색창 미감지: ${e.message}`);
  await context.close();
  process.exit(0);
}
await page.waitForTimeout(1300);

// 3) 자동완성 옵션
let optionClicked = false;
for (const loc of [
  frame.getByRole('option').filter({ hasText: placeName || placeAddress }).first(),
  frame.getByRole('option').first(),
]) {
  try {
    await loc.waitFor({ timeout: 1500 });
    await loc.click();
    optionClicked = true;
    console.log('  ✓ STEP3 자동완성 옵션 선택');
    break;
  } catch {}
}
if (!optionClicked) console.log('  · STEP3 자동완성 옵션 없음');

// 4) Enter 검색
try {
  await searchInput.click();
  await page.keyboard.press('Enter');
  console.log('  ✓ STEP4 Enter 검색 실행');
} catch {}
await page.waitForTimeout(2200);

await page.screenshot({ path: shot('after-search'), fullPage: false });
console.log(`  📸 검색 후 스크린샷: ${shot('after-search')}`);

// 5) '추가' 버튼
let addOk = false;
try {
  const firstItem = frame.locator('.se-place-map-search-result-item').first();
  await firstItem.waitFor({ timeout: 3000 });
  await firstItem.hover();
  await page.waitForTimeout(300);
  await firstItem.locator('.se-place-add-button').first().click({ timeout: 2000 });
  addOk = true;
  console.log('  ✓ STEP5 첫 항목 hover→"추가" 클릭 성공');
} catch (e) {
  console.log(`  ✗ STEP5 "추가" 클릭 실패: ${e.message}`);
  // 진단: 숨김 포함 DOM 구조 덤프 (Frame.evaluate)
  try {
    const f = page.frame({ name: 'mainFrame' });
    const dump = await f.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      // 1) 텍스트가 정확히 '추가'인 말단 요소(숨김 포함) → 가까운 클릭가능 조상
      const addEls = [...document.querySelectorAll('*')]
        .filter((el) => el.children.length === 0 && clean(el.textContent) === '추가')
        .slice(0, 6)
        .map((el) => {
          const clickable = el.closest('button,a,[role="button"],li') || el.parentElement || el;
          return { tag: el.tagName, cls: clean(el.className), clickableTag: clickable.tagName, clickableCls: clean(clickable.className), html: clean(clickable.outerHTML).slice(0, 220) };
        });
      // 2) '추가' 포함 버튼/링크(숨김 포함)
      const addBtns = [...document.querySelectorAll('button, a, [role="button"]')]
        .filter((b) => clean(b.textContent).includes('추가') || (b.getAttribute('aria-label') || '').includes('추가'))
        .slice(0, 10)
        .map((b) => ({ tag: b.tagName, aria: b.getAttribute('aria-label'), text: clean(b.textContent).slice(0, 24), cls: clean(b.className).slice(0, 60) }));
      // 3) 첫 .se-place-add-button 의 조상 체인 + 컴퓨티드 스타일(숨김 방식 파악)
      const btn = document.querySelector('.se-place-add-button');
      let chain = [];
      if (btn) {
        let cur = btn;
        for (let i = 0; i < 6 && cur; i++) {
          const cs = getComputedStyle(cur);
          chain.push({
            tag: cur.tagName,
            cls: clean(cur.className).slice(0, 70),
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
          });
          cur = cur.parentElement;
        }
      }
      return { addEls, addBtns, ancestorChain: chain };
    });
    console.log('  --- 텍스트="추가" 말단요소(숨김포함) ---');
    console.log('  ' + JSON.stringify(dump.addEls, null, 0));
    console.log('  --- "추가" 포함 버튼/링크(숨김포함) ---');
    console.log('  ' + JSON.stringify(dump.addBtns, null, 0));
    console.log('  --- .se-place-add-button 조상 체인 + 스타일 ---');
    for (const c of dump.ancestorChain) console.log('  ' + JSON.stringify(c));
  } catch (e2) {
    console.log(`  (DOM 덤프 실패: ${e2.message})`);
  }
}

// 6) '확인'
if (addOk) {
  try {
    const confirmBtn = frame.getByRole('button', { name: '확인' }).first();
    await confirmBtn.waitFor({ timeout: 2000 });
    await confirmBtn.click();
    console.log('  ✓ STEP6 "확인" 클릭');
  } catch {
    console.log('  · STEP6 확인 모달 없음(통과)');
  }
}

await page.screenshot({ path: shot('final'), fullPage: false });
console.log(`  📸 최종 스크린샷: ${shot('final')}`);
console.log(`\n[verify-place] ${addOk ? '✅ 장소 첨부 성공' : '⚠ 추가 단계 실패 — 위 진단 참고'}. 5초 후 닫음.`);
await page.waitForTimeout(5000);
await context.close();
console.log('[verify-place] 완료');
