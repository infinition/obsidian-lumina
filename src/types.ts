import type { LocaleKey } from './i18n/locales';
export type { LocaleKey };

export interface WebOSAPI {
  getObsidianApp(): unknown;
  loadWidgetState(id: string): Promise<unknown | null>;
  saveWidgetState(id: string, data: unknown): Promise<void>;
  resolveResourcePath(path: string): string;
  getWorkerUrl(): string;
  getLocale(): LocaleKey;
}
