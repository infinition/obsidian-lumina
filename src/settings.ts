import { type App, PluginSettingTab } from 'obsidian';
import type { LocaleKey } from './i18n/locales';
import { LOCALE_NAMES } from './i18n/locales';
import type LuminaPlugin from './main';

export interface LuminaSettings {
  locale: LocaleKey;
}

export const DEFAULT_SETTINGS: LuminaSettings = {
  locale: 'en',
};

export class LuminaSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LuminaPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Lumina' });
    containerEl.createEl('h3', { text: 'Language / Langue / Sprache / Idioma / 语言' });
    const select = containerEl.createEl('select', { cls: 'dropdown' });
    (['en', 'fr', 'de', 'es', 'zh'] as LocaleKey[]).forEach((code) => {
      const opt = select.createEl('option', { value: code, text: LOCALE_NAMES[code] });
      if (this.plugin.settings.locale === code) opt.selected = true;
    });
    select.addEventListener('change', async () => {
      this.plugin.settings.locale = select.value as LocaleKey;
      await this.plugin.saveSettings();
    });
  }
}
