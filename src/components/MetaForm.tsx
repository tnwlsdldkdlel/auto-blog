'use client';

import { useBotStore } from '@/lib/store';

export function MetaForm() {
  const keyword = useBotStore((s) => s.keyword);
  const toneNote = useBotStore((s) => s.toneNote);
  const setKeyword = useBotStore((s) => s.setKeyword);
  const setToneNote = useBotStore((s) => s.setToneNote);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">
          메인 키워드
        </label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="예: 강남역 맛집"
          className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          톤앤매너 / 추가 요청 (선택)
        </label>
        <textarea
          value={toneNote}
          onChange={(e) => setToneNote(e.target.value)}
          placeholder="예: 내돈내산 솔직 리뷰 톤, 친근한 반말체"
          rows={3}
          className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
      </div>
    </div>
  );
}
