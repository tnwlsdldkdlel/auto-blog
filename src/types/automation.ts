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
  | 'AUTO_PUBLISH_TIMEOUT'
  | 'BROWSER_ALREADY_OPEN'
  | 'LOGIN_TIMEOUT'
  | 'AI_GENERATION_FAILED'
  | 'UNKNOWN';

/** 성공 메시지 코드 (자동 발행/반자동 구분). PublishApiResponse.message에 들어감. */
export type PublishApiSuccess = 'WAITING_FOR_MANUAL_PUBLISH' | 'PUBLISHED';

export interface PublishApiResponse {
  ok: boolean;
  message?: PublishApiError | string;
  logs?: LogLine[];
}
