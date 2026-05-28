'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { useBotStore } from '@/lib/store';

export function ImageUploader() {
  const images = useBotStore((s) => s.images);
  const addImages = useBotStore((s) => s.addImages);
  const removeImage = useBotStore((s) => s.removeImage);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
      if (files.length > 0) addImages(files);
    },
    [addImages],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex h-40 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-sm transition ${
          dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-500'
        }`}
      >
        <p className="text-neutral-500">이미지를 드래그하거나 클릭해서 업로드</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className="relative aspect-square overflow-hidden rounded border border-neutral-300 dark:border-neutral-700"
            >
              <Image
                src={img.previewUrl}
                alt={`upload-${idx}`}
                fill
                sizes="120px"
                className="object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white hover:bg-black"
              >
                ✕
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                #{idx}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
