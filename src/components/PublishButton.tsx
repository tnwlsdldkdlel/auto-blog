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
        appendLog({
          level: 'info',
          message: `✓ AI 추론 장소: ${p.place.name} / ${p.place.address}`,
        });
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
        switch (errMsg) {
          case 'PARTIAL_WRITE_BROWSER_OPEN':
            // 일부 단계 실패했지만 작성된 글은 크롬 창에 남아 있음 — 하드 에러로 취급하지 않음
            appendLog({
              level: 'warn',
              message:
                '⚠ 자동화 일부 단계가 실패했지만 작성된 글은 크롬 창에 남아 있습니다. 창에서 내용 확인 후 직접 발행/저장하세요.',
            });
            setStatus('idle');
            return;
          case 'BROWSER_ALREADY_OPEN':
            appendLog({
              level: 'error',
              message: '✗ 이전 발행 창이 아직 열려 있습니다. 그 크롬 창을 닫고 다시 시도하세요.',
            });
            break;
          case 'NAVER_EDITOR_LOAD_FAILED':
            appendLog({
              level: 'error',
              message: '✗ 네이버 에디터 로딩 실패. 로그인 상태/네트워크 확인.',
            });
            break;
          case 'LOGIN_TIMEOUT':
            appendLog({
              level: 'error',
              message: '✗ 로그인 대기 시간 초과(5분). 다시 시도해 주세요.',
            });
            break;
          default:
            appendLog({ level: 'error', message: `✗ 발행 실패: ${errMsg}` });
        }
        setStatus('error');
        return;
      }

      appendLog({
        level: 'info',
        message:
          '✓ 발행 준비 완료 — 뜬 크롬 창에서 카테고리·공개범위·내용을 확인한 뒤 [발행] 버튼을 직접 눌러주세요. (끝나면 창을 닫으면 됩니다)',
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
          : 'AI 원고 생성 + 발행창 열기'}
    </button>
  );
}
