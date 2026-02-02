import { Plugin } from 'obsidian';
import { LuminaView, VIEW_TYPE_LUMINA } from './view';
import { LuminaSettingTab } from './settings';
import type { LuminaSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import { t } from './i18n/locales';

function getWorkerUrl(): string {
  try {
    const path = require('path');
    return 'file:///' + path.join(__dirname, 'worker.js').replace(/\\/g, '/');
  } catch {
    return './worker.js';
  }
}

export default class LuminaPlugin extends Plugin {
  workerUrl = getWorkerUrl();
  settings: LuminaSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LuminaSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_LUMINA, (leaf) => new LuminaView(leaf, this));
    const openLabel = t(this.settings.locale, 'openLumina');
    this.addRibbonIcon('image', openLabel, () => this.activateView());
    this.addCommand({
      id: 'open-lumina',
      name: openLabel,
      callback: () => this.activateView(),
    });
  }

  async loadSettings() {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data?.settings as Partial<LuminaSettings>) };
  }

  async saveSettings() {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    await this.saveData({ ...data, settings: this.settings });
  }

  getLocale(): LocaleKey {
    return this.settings.locale;
  }

  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_LUMINA).forEach((leaf) => leaf.detach());
  }

  async activateView() {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_LUMINA, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
