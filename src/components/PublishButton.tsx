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
  const placeName = useBotStore((s) => s.placeName);
  const placeAddress = useBotStore((s) => s.placeAddress);
  const categoryName = useBotStore((s) => s.categoryName);
  const isPublic = useBotStore((s) => s.isPublic);
  const commentAllow = useBotStore((s) => s.commentAllow);
  const sympathyAllow = useBotStore((s) => s.sympathyAllow);
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

      // 사용자가 식당명 또는 주소 중 하나만 입력해도 그 값을 BlogPayload.place로 강제 덮어쓰기
      const userPlaceName = placeName.trim();
      const userPlaceAddress = placeAddress.trim();
      if (userPlaceName || userPlaceAddress) {
        p.place = {
          name: userPlaceName,
          address: userPlaceAddress,
          latitude: null,
          longitude: null,
        };
        const display = [userPlaceName, userPlaceAddress].filter(Boolean).join(' / ');
        appendLog({ level: 'info', message: `✓ 사용자 입력 장소로 덮어쓰기: ${display}` });
      } else if (p.place) {
        appendLog({ level: 'info', message: `✓ AI 추론 장소: ${p.place.name} / ${p.place.address}` });
      }

      // 사용자가 설정한 발행 옵션으로 항상 덮어쓰기
      p.options = { commentAllow, sympathyAllow, isPublic };
      const trimmedCategory = categoryName.trim();
      if (trimmedCategory) {
        p.categoryCode = trimmedCategory;
        appendLog({ level: 'info', message: `✓ 카테고리 지정: "${trimmedCategory}"` });
      }

      // Stage 2: /api/publish
      setStatus('automating');
      appendLog({ level: 'info', message: '네이버 블로그 자동화 시작...' });
      appendLog({
        level: 'info',
        message: '※ 로그인 안 된 경우 새로 뜬 크롬 창에서 직접 로그인해 주세요 (최대 5분 대기).',
      });

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
