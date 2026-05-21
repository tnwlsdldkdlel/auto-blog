import { create } from 'zustand';
import type { BotStatus, LogLine } from '@/types/automation';

interface UploadImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface StoreState {
  images: UploadImage[];
  keyword: string;
  toneNote: string;
  status: BotStatus;
  logs: LogLine[];
  addImages: (files: File[]) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;
  setKeyword: (v: string) => void;
  setToneNote: (v: string) => void;
  setStatus: (s: BotStatus) => void;
  appendLog: (line: Omit<LogLine, 'ts'>) => void;
  resetLogs: () => void;
}

export const useBotStore = create<StoreState>((set) => ({
  images: [],
  keyword: '',
  toneNote: '',
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
  setStatus: (s) => set({ status: s }),
  appendLog: (line) =>
    set((state) => ({
      logs: [...state.logs, { ...line, ts: Date.now() }],
    })),
  resetLogs: () => set({ logs: [] }),
}));
