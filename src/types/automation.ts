export type BotStatus = 'idle' | 'generating' | 'automating' | 'done' | 'error';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogLine {
  ts: number;
  level: LogLevel;
  message: string;
}

export type PublishApiError =
  | 'NAVER_EDITOR_LOAD_FAILED'
  | 'PARTIAL_WRITE_SAVED_AS_DRAFT'
  | 'AI_GENERATION_FAILED'
  | 'UNKNOWN';

export interface PublishApiResponse {
  ok: boolean;
  message?: PublishApiError | string;
  logs?: LogLine[];
}
