'use client';

import { useBotStore } from '@/lib/store';

export function MetaForm() {
  const keyword = useBotStore((s) => s.keyword);
  const toneNote = useBotStore((s) => s.toneNote);
  const placeName = useBotStore((s) => s.placeName);
  const placeAddress = useBotStore((s) => s.placeAddress);
  const categoryName = useBotStore((s) => s.categoryName);
  const isPublic = useBotStore((s) => s.isPublic);
  const commentAllow = useBotStore((s) => s.commentAllow);
  const sympathyAllow = useBotStore((s) => s.sympathyAllow);
  const setKeyword = useBotStore((s) => s.setKeyword);
  const setToneNote = useBotStore((s) => s.setToneNote);
  const setPlaceName = useBotStore((s) => s.setPlaceName);
  const setPlaceAddress = useBotStore((s) => s.setPlaceAddress);
  const setCategoryName = useBotStore((s) => s.setCategoryName);
  const setIsPublic = useBotStore((s) => s.setIsPublic);
  const setCommentAllow = useBotStore((s) => s.setCommentAllow);
  const setSympathyAllow = useBotStore((s) => s.setSympathyAllow);

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
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/30">
        <p className="mb-2 text-xs text-neutral-500">
          📍 식당 위치 (선택) — 입력하면 네이버 지도가 본문에 자동 첨부됩니다.
          비워두면 AI가 추측하며, 실패 시 지도 없이 발행됩니다.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            placeholder="식당명 (예: OO국밥 강남점)"
            className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <input
            type="text"
            value={placeAddress}
            onChange={(e) => setPlaceAddress(e.target.value)}
            placeholder="주소 (예: 서울 강남구 역삼동)"
            className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
        </div>
      </div>

      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/30">
        <p className="mb-2 text-xs text-neutral-500">
          ⚙️ 발행 옵션 (선택) — 카테고리·공개범위·댓글·공감을 발행 모달에서 자동 적용합니다.
          최종 [발행]은 뜬 크롬 창에서 직접 확인 후 누르세요(반자동).
        </p>
        <div className="space-y-2">
          <input
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="카테고리명 (예: 맛집, 일상) — 정확히 일치해야 매칭"
            className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              공개범위:
              <select
                value={isPublic}
                onChange={(e) => setIsPublic(e.target.value as 'all' | 'private')}
                className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
              >
                <option value="all">전체공개</option>
                <option value="private">비공개</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={commentAllow}
                onChange={(e) => setCommentAllow(e.target.checked)}
              />
              댓글 허용
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={sympathyAllow}
                onChange={(e) => setSympathyAllow(e.target.checked)}
              />
              공감 허용
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
