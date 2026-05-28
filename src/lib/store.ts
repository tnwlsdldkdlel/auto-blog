import { create } from 'zustand';
import type { BotStatus, LogLine } from '@/types/automation';

interface UploadImage {
  id: string;
  file: File;
  previewUrl: string;
}

type PublicScope = 'all' | 'private';

interface StoreState {
  images: UploadImage[];
  keyword: string;
  toneNote: string;
  placeName: string;
  placeAddress: string;
  categoryName: string;
  isPublic: PublicScope;
  commentAllow: boolean;
  sympathyAllow: boolean;
  autoPublish: boolean;
  status: BotStatus;
  logs: LogLine[];
  addImages: (files: File[]) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;
  setKeyword: (v: string) => void;
  setToneNote: (v: string) => void;
  setPlaceName: (v: string) => void;
  setPlaceAddress: (v: string) => void;
  setCategoryName: (v: string) => void;
  setIsPublic: (v: PublicScope) => void;
  setCommentAllow: (v: boolean) => void;
  setSympathyAllow: (v: boolean) => void;
  setAutoPublish: (v: boolean) => void;
  setStatus: (s: BotStatus) => void;
  appendLog: (line: Omit<LogLine, 'ts'>) => void;
  resetLogs: () => void;
}

export const useBotStore = create<StoreState>((set) => ({
  images: [],
  keyword: '',
  toneNote: '',
  placeName: '',
  placeAddress: '',
  categoryName: '',
  isPublic: 'all',
  commentAllow: true,
  sympathyAllow: true,
  autoPublish: false, // 기본 OFF — 반자동(사람이 최종 [발행] 클릭)이 안전 기본값
  status: 'idle',
  logs: [],
  addImages: (files) =>
    set((state) => ({
      images: [
        ...state.images,
        ...files.map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ],
    })),
  removeImage: (id) =>
    set((state) => {
      const target = state.images.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return { images: state.images.filter((img) => img.id !== id) };
    }),
  clearImages: () =>
    set((state) => {
      state.images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return { images: [] };
    }),
  setKeyword: (v) => set({ keyword: v }),
  setToneNote: (v) => set({ toneNote: v }),
  setPlaceName: (v) => set({ placeName: v }),
  setPlaceAddress: (v) => set({ placeAddress: v }),
  setCategoryName: (v) => set({ categoryName: v }),
  setIsPublic: (v) => set({ isPublic: v }),
  setCommentAllow: (v) => set({ commentAllow: v }),
  setSympathyAllow: (v) => set({ sympathyAllow: v }),
  setAutoPublish: (v) => set({ autoPublish: v }),
  setStatus: (s) => set({ status: s }),
  appendLog: (line) =>
    set((state) => ({
      logs: [...state.logs, { ...line, ts: Date.now() }],
    })),
  resetLogs: () => set({ logs: [] }),
}));
