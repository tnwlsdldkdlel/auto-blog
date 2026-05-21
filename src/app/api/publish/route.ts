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
  saveAsDraft,
  resolveUserDataDir,
  resolveBlogId,
} from '@/lib/naver-bot';
import type { PublishApiResponse } from '@/types/automation';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function saveTempImages(files: File[]): Promise<{ dir: string; paths: string[] }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tastywrite-'));
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

    // Day 6: 이미지 첨부 + 임시저장
    await attachImages(handle, saved.paths);
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
