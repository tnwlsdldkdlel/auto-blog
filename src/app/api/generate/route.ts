import { NextRequest, NextResponse } from 'next/server';
import { zodResponseFormat } from 'openai/helpers/zod';
import { getOpenAIClient } from '@/lib/openai-client';
import { BlogPayloadSchema, type BlogPayload } from '@/types/blog-payload';
import { SYSTEM_PROMPT, buildUserMessage } from '@/lib/prompts';
import type { PublishApiResponse } from '@/types/automation';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const keyword = String(form.get('keyword') ?? '').trim();
    const toneNote = String(form.get('toneNote') ?? '');
    const files = form.getAll('images').filter((v): v is File => v instanceof File);

    if (!keyword) {
      return NextResponse.json<PublishApiResponse>(
        { ok: false, message: '키워드가 비어 있습니다.' },
        { status: 400 },
      );
    }
    if (files.length === 0) {
      return NextResponse.json<PublishApiResponse>(
        { ok: false, message: '이미지가 1장 이상 필요합니다.' },
        { status: 400 },
      );
    }

    const imageContents = await Promise.all(
      files.map(async (file) => ({
        type: 'image_url' as const,
        image_url: { url: await fileToDataUrl(file) },
      })),
    );

    const client = getOpenAIClient();
    const completion = await client.chat.completions.parse({
      model: 'gpt-4o-2024-08-06',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildUserMessage(keyword, toneNote, files.length) },
            ...imageContents,
          ],
        },
      ],
      response_format: zodResponseFormat(BlogPayloadSchema, 'BlogPayload'),
    });

    const payload: BlogPayload | null = completion.choices[0]?.message.parsed ?? null;
    if (!payload) {
      return NextResponse.json<PublishApiResponse>(
        { ok: false, message: 'AI_GENERATION_FAILED' },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    console.error('[/api/generate] error:', err);
    return NextResponse.json<PublishApiResponse>(
      { ok: false, message: `AI_GENERATION_FAILED: ${msg}` },
      { status: 500 },
    );
  }
}
