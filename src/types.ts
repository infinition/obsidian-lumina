import type { LocaleKey } from './i18n/locales';
import type { TagManager } from './services/tagManager';
import type { FrontmatterService } from './services/frontmatterService';
import type { LuminaSettings } from './settings';
export type { LocaleKey };

export interface WebOSAPI {
  getObsidianApp(): unknown;
  loadWidgetState(id: string): Promise<unknown | null>;
  saveWidgetState(id: string, data: unknown): Promise<void>;
  resolveResourcePath(path: string): string;
  getWorkerUrl(): string;
  getLocale(): LocaleKey;
  getTagManager(): TagManager;
  getFrontmatterService(): FrontmatterService | null;
  getPluginSettings(): LuminaSettings;
}
