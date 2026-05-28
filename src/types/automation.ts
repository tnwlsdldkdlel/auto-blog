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
  | 'PARTIAL_WRITE_BROWSER_OPEN'
  | 'BROWSER_ALREADY_OPEN'
  | 'LOGIN_TIMEOUT'
  | 'AI_GENERATION_FAILED'
  | 'UNKNOWN';

export interface PublishApiResponse {
  ok: boolean;
  message?: PublishApiError | string;
  logs?: LogLine[];
}
