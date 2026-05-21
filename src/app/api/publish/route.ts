import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BlogPayloadSchema } from '@/types/blog-payload';
import {
  launchBlogBot,
  waitForEditor,
  dismissRecoveryPopup,
  fillTitleAndBody,
  attachImages,
  attachPlace,
  setCategory,
  saveAsDraft,
  resolveUserDataDir,
  resolveBlogId,
} from '@/lib/naver-bot';
import type { PublishApiResponse } from '@/types/automation';

export const runtime = 'nodejs';
// 로그인 대기(최대 5분) + 자동화(1~2분) 여유를 위해 600초로 확장.
// (dev 환경에선 무시되지만 명시 의도 보존.)
export const maxDuration = 600;

async function saveTempImages(files: File[]): Promise<{ dir: string; paths: string[] }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-blog-'));
  const paths = await Promise.all(
    files.map(async (file, idx) => {
      const ext = path.extname(file.name) || '.jpg';
      const dest = path.join(dir, `img-${idx}${ext}`);
      const buf = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(dest, buf);
      return dest;
    }),
  );
  return { dir, paths };
}

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;
  let context: Awaited<ReturnType<typeof launchBlogBot>>['context'] | null = null;

  try {
    const form = await req.formData();
    const payloadJson = String(form.get('payload') ?? '');
    const files = form.getAll('images').filter((v): v is File => v instanceof File);

    if (!payloadJson) {
      return NextResponse.json<PublishApiResponse>(
        { ok: false, message: 'payload가 비어 있습니다.' },
        { status: 400 },
      );
    }

    const parsedRaw = JSON.parse(payloadJson);
    const parseResult = BlogPayloadSchema.safeParse(parsedRaw);
    if (!parseResult.success) {
      return NextResponse.json<PublishApiResponse>(
        { ok: false, message: `payload 스키마 검증 실패: ${parseResult.error.message}` },
        { status: 400 },
      );
    }
    const payload = parseResult.data;

    const saved = await saveTempImages(files);
    tempDir = saved.dir;

    const handle = await launchBlogBot({
      blogId: resolveBlogId(),
      userDataDir: resolveUserDataDir(),
      headless: false,
    });
    context = handle.context;

    await waitForEditor(handle, 10000);
    await dismissRecoveryPopup(handle);

    // Day 5: 제목 + 본문 텍스트 입력
    await fillTitleAndBody(handle, payload);

    // Day 6: 이미지 첨부
    await attachImages(handle, saved.paths);

    // Phase 2: 장소(네이버 지도) 첨부 — name 또는 address 중 하나만 있어도 시도, 실패해도 발행은 계속
    if (payload.place && (payload.place.name || payload.place.address)) {
      try {
        await attachPlace(handle, payload.place);
      } catch (placeErr) {
        const msg = placeErr instanceof Error ? placeErr.message : 'unknown';
        handle.log('warn', `장소 첨부 중 예외 — 발행은 계속: ${msg}`);
      }
    } else {
      handle.log('info', 'payload.place 없음 — 장소 첨부 skip');
    }

    // 카테고리 지정 (있을 때만, 실패해도 발행은 계속)
    if (payload.categoryCode && payload.categoryCode.trim()) {
      try {
        await setCategory(handle, payload.categoryCode);
      } catch (catErr) {
        const msg = catErr instanceof Error ? catErr.message : 'unknown';
        handle.log('warn', `카테고리 지정 중 예외 — 발행은 계속: ${msg}`);
      }
    }

    // 임시저장
    await saveAsDraft(handle);

    // 사용자가 결과 화면 확인할 시간 (Phase 1: 즉시 종료하지 않음)
    await handle.page.waitForTimeout(3000);

    await context.close();
    context = null;

    return NextResponse.json<PublishApiResponse & { payloadTitle?: string }>({
      ok: true,
      message: 'SAVED_AS_DRAFT',
      payloadTitle: payload.title,
      logs: handle.logs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    console.error('[/api/publish] error:', err);

    if (context) {
      try {
        await context.close();
      } catch {
        // ignore close errors
      }
    }

    const isEditorFail = msg === 'NAVER_EDITOR_LOAD_FAILED';
    return NextResponse.json<PublishApiResponse>(
      { ok: false, message: isEditorFail ? 'NAVER_EDITOR_LOAD_FAILED' : msg },
      { status: 500 },
    );
  } finally {
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
