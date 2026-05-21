import { ImageUploader } from '@/components/ImageUploader';
import { MetaForm } from '@/components/MetaForm';
import { PublishButton } from '@/components/PublishButton';
import { LogPanel } from '@/components/LogPanel';

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">🍴 auto-blog</h1>
        <p className="mt-1 text-sm text-neutral-500">
          맛집 블로그 자동 발행 봇 — Phase 1 MVP (임시저장 전용)
        </p>
      </header>

      <section className="space-y-6 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <div>
          <h2 className="mb-2 text-sm font-semibold">1. 사진 업로드</h2>
          <ImageUploader />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">2. 메타데이터</h2>
          <MetaForm />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">3. 발행</h2>
          <PublishButton />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">4. 실시간 로그</h2>
          <LogPanel />
        </div>
      </section>
    </main>
  );
}
