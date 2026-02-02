import { normalizePath } from 'obsidian';
import type { WebOSAPI } from '../types';
import type LuminaPlugin from '../main';

const isRemotePath = (value: string) =>
  /^https?:\/\//i.test(value) ||
  /^data:/i.test(value) ||
  /^app:\/\//i.test(value) ||
  /^file:\/\//i.test(value);

export const createBridge = (plugin: LuminaPlugin): WebOSAPI => ({
  getObsidianApp() {
    return plugin.app;
  },

  async loadWidgetState(id: string) {
    const stored = (await plugin.loadData()) as Record<string, unknown> | null;
    return stored?.widgetState?.[id] ?? null;
  },

  async saveWidgetState(id: string, data: unknown) {
    const stored = ((await plugin.loadData()) ?? {}) as Record<string, unknown>;
    const widgetState = { ...(stored.widgetState as Record<string, unknown> ?? {}), [id]: data };
    await plugin.saveData({ ...stored, widgetState });
  },

  resolveResourcePath(path: string) {
    if (!path) return path;
    if (isRemotePath(path)) return path;
    const file = plugin.app.vault.getAbstractFileByPath(normalizePath(path));
    if (file && 'path' in file) {
      return plugin.app.vault.getResourcePath(file as { path: string });
    }
    return path;
  },
});
