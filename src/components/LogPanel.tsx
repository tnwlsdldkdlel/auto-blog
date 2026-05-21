'use client';

import { useBotStore } from '@/lib/store';

const LEVEL_COLOR: Record<string, string> = {
  info: 'text-neutral-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

export function LogPanel() {
  const logs = useBotStore((s) => s.logs);

  return (
    <div className="h-60 overflow-y-auto rounded bg-neutral-950 p-3 font-mono text-xs">
      {logs.length === 0 ? (
        <p className="text-neutral-600">로그 대기 중...</p>
      ) : (
        logs.map((line, i) => {
          const time = new Date(line.ts).toLocaleTimeString('ko-KR', {
            hour12: false,
          });
          return (
            <div key={i} className={LEVEL_COLOR[line.level] ?? 'text-neutral-300'}>
              <span className="text-neutral-600">[{time}]</span> {line.message}
            </div>
          );
        })
      )}
    </div>
  );
}
