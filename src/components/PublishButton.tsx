'use client';

import { useBotStore } from '@/lib/store';
import type { BlogPayload } from '@/types/blog-payload';
import type { LogLine } from '@/types/automation';

interface GenerateResponse {
  ok: boolean;
  payload?: BlogPayload;
  message?: string;
}

interface PublishResponse {
  ok: boolean;
  message?: string;
  logs?: LogLine[];
}

export function PublishButton() {
  const status = useBotStore((s) => s.status);
  const images = useBotStore((s) => s.images);
  const keyword = useBotStore((s) => s.keyword);
  const toneNote = useBotStore((s) => s.toneNote);
  const setStatus = useBotStore((s) => s.setStatus);
  const appendLog = useBotStore((s) => s.appendLog);
  const resetLogs = useBotStore((s) => s.resetLogs);

  const isBusy = status === 'generating' || status === 'automating';
  const disabled = isBusy || images.length === 0 || keyword.trim().length === 0;

  const handleClick = async () => {
    resetLogs();
    setStatus('generating');
    appendLog({ level: 'info', message: `AI 원고 생성 시작 (이미지 ${images.length}장)...` });

    try {
      // Stage 1: /api/generate
      const genForm = new FormData();
      genForm.append('keyword', keyword);
      genForm.append('toneNote', toneNote);
      images.forEach((img) => genForm.append('images', img.file, img.file.name));

      const genRes = await fetch('/api/generate', { method: 'POST', body: genForm });
      const genData = (await genRes.json()) as GenerateResponse;
      if (!genRes.ok || !genData.ok || !genData.payload) {
        throw new Error(genData.message ?? `generate HTTP ${genRes.status}`);
      }

      const p = genData.payload;
      appendLog({ level: 'info', message: `✓ 제목: ${p.title}` });
      appendLog({ level: 'info', message: `✓ 태그: ${p.tags.join(', ')}` });
      appendLog({ level: 'info', message: `✓ 섹션 ${p.sections.length}개 생성 완료` });

      // Stage 2: /api/publish (Day 4: 페이지 진입 + 에디터 감지)
      setStatus('automating');
      appendLog({ level: 'info', message: '네이버 블로그 자동화 시작...' });

      const pubForm = new FormData();
      pubForm.append('payload', JSON.stringify(p));
      images.forEach((img) => pubForm.append('images', img.file, img.file.name));

      const pubRes = await fetch('/api/publish', { method: 'POST', body: pubForm });
      const pubData = (await pubRes.json()) as PublishResponse;

      pubData.logs?.forEach((line) => appendLog({ level: line.level, message: line.message }));

      if (!pubRes.ok || !pubData.ok) {
        const errMsg = pubData.message ?? `publish HTTP ${pubRes.status}`;
        if (errMsg === 'NAVER_EDITOR_LOAD_FAILED') {
          appendLog({
            level: 'error',
            message: '✗ 네이버 에디터 로딩 실패 (10초 타임아웃). 로그인 상태/네트워크 확인.',
          });
        } else {
          appendLog({ level: 'error', message: `✗ 발행 실패: ${errMsg}` });
        }
        setStatus('error');
        return;
      }

      appendLog({
        level: 'info',
        message: '✓ 임시저장 완료 — 네이버 블로그 임시저장함에서 확인하세요.',
      });
      setStatus('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'UNKNOWN';
      appendLog({ level: 'error', message: `실패: ${msg}` });
      setStatus('error');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
    >
      {status === 'generating'
        ? 'AI 원고 생성 중...'
        : status === 'automating'
          ? '네이버 자동화 중...'
          : '임시저장으로 발행'}
    </button>
  );
}
