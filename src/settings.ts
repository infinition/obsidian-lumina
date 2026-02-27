import { type App, getIconIds, Modal, Notice, PluginSettingTab, SearchComponent, setIcon, Setting } from 'obsidian';
import type { LocaleKey } from './i18n/locales';
import { LOCALE_NAMES, t } from './i18n/locales';
import type LuminaPlugin from './main';

export type LayoutType = 'square' | 'justified' | 'detail' | 'panorama-square' | 'panorama-justified';
export type TagIndicatorStyle = 'dot' | 'icon';

export interface LuminaSettings {
  locale: LocaleKey;
  enableTagSystem: boolean;
  enableVirtualSearch: boolean;
  virtualSearchClickAction: 'obsidian' | 'lumina';
  showFileExplorerTagsIndicator: boolean;
  tagIndicatorPosition: 'left' | 'right';
  tagIndicatorStyle: TagIndicatorStyle;
  tagIndicatorColor: string;
  tagIndicatorSize: number;
  tagIndicatorLucideIcon: string;
  tagIndicatorCompensateShift: boolean;
  blockImageClickAction: 'preview' | 'open';
  tagClickAction: 'lumina' | 'obsidian';
  // Gallery defaults
  defaultLayout: LayoutType;
  defaultZoom: number;
  defaultShowNames: boolean;
  defaultMediaFilter: 'all' | 'photos' | 'videos';
  // Performance
  thumbnailQuality: 'low' | 'medium' | 'high';
  maxCacheSizeMB: number;
  enableStartupSync: boolean;
  showDebugLogs: boolean;
  // Backup
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoBackupPath: string;
}

export const DEFAULT_SETTINGS: LuminaSettings = {
  locale: 'en',
  enableTagSystem: true,
  enableVirtualSearch: true,
  virtualSearchClickAction: 'obsidian',
  showFileExplorerTagsIndicator: false,
  tagIndicatorPosition: 'left',
  tagIndicatorStyle: 'dot',
  tagIndicatorColor: 'var(--interactive-accent)',
  tagIndicatorSize: 8,
  tagIndicatorLucideIcon: 'tag',
  tagIndicatorCompensateShift: false,
  blockImageClickAction: 'preview',
  tagClickAction: 'lumina',
  // Gallery defaults
  defaultLayout: 'justified',
  defaultZoom: 200,
  defaultShowNames: false,
  defaultMediaFilter: 'all',
  // Performance
  thumbnailQuality: 'medium',
  maxCacheSizeMB: 500,
  enableStartupSync: true,
  showDebugLogs: false,
  // Backup
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
  autoBackupPath: '',
};

class IconPickerModal extends Modal {
  private readonly iconIds = getIconIds();
  private readonly locale: LocaleKey;
  private readonly onPick: (iconId: string) => void;
  private readonly initialIcon: string;

  constructor(app: App, locale: LocaleKey, initialIcon: string, onPick: (iconId: string) => void) {
    super(app);
    this.locale = locale;
    this.initialIcon = initialIcon;
    this.onPick = onPick;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('lumina-icon-picker-modal');

    contentEl.createEl('h3', { text: t(this.locale, 'iconPickerTitle') });

    const search = new SearchComponent(contentEl);
    search.setPlaceholder(t(this.locale, 'iconPickerSearchPlaceholder'));
    search.setValue('');

    const grid = contentEl.createDiv({ cls: 'lumina-icon-picker-grid' });
    const empty = contentEl.createDiv({ cls: 'lumina-icon-picker-empty' });

    const render = (query: string) => {
      const normalized = query.trim().toLowerCase();
      const icons = normalized.length === 0
        ? this.iconIds
        : this.iconIds.filter((iconId) => iconId.toLowerCase().includes(normalized));

      grid.empty();
      empty.empty();

      if (icons.length === 0) {
        empty.setText(t(this.locale, 'iconPickerNoResults'));
        return;
      }

      const fragment = document.createDocumentFragment();
      icons.forEach((iconId) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lumina-icon-picker-item';
        button.title = iconId;
        button.setAttribute('aria-label', iconId);

        const iconEl = document.createElement('span');
        iconEl.className = 'lumina-icon-picker-item-icon';
        try {
          setIcon(iconEl, iconId as any);
        } catch {
          setIcon(iconEl, 'tag');
        }

        const labelEl = document.createElement('span');
        labelEl.className = 'lumina-icon-picker-item-label';
        labelEl.textContent = iconId;

        button.appendChild(iconEl);
        button.appendChild(labelEl);
        button.addEventListener('click', () => {
          this.onPick(iconId);
          this.close();
        });

        fragment.appendChild(button);
      });
      grid.appendChild(fragment);
    };

    search.onChange((value) => render(value));
    render('');
  }
}

export class LuminaSettingTab extends PluginSettingTab {
  private indicatorSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, private plugin: LuminaPlugin) {
    super(app, plugin);
  }

  private applyIndicatorPreview(): void {
    if (!this.plugin.settings.enableTagSystem) return;
    if (!this.plugin.settings.showFileExplorerTagsIndicator) return;
    this.plugin.tagIndicatorService?.refreshNow();
  }

  private saveIndicatorSettingsDebounced(): void {
    if (this.indicatorSaveTimeout) {
      clearTimeout(this.indicatorSaveTimeout);
    }
    this.indicatorSaveTimeout = setTimeout(() => {
      this.indicatorSaveTimeout = null;
      void this.plugin.saveSettings();
    }, 250);
  }

  private parseColorToHexAndAlpha(inputColor: string): { hex: string; alpha: number } {
    const rgba = this.resolveColorToRgba(inputColor) ?? this.resolveColorToRgba('var(--interactive-accent)');
    if (!rgba) {
      return { hex: '#7f7f7f', alpha: 1 };
    }
    return {
      hex: this.rgbToHex(rgba.r, rgba.g, rgba.b),
      alpha: rgba.a,
    };
  }

  private resolveColorToRgba(value: string): { r: number; g: number; b: number; a: number } | null {
    const probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = value;
    if (!probe.style.color) return null;

    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();

    const match = computed.match(
      /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)/i
    );
    if (!match) return null;

    const r = Math.max(0, Math.min(255, Math.round(Number(match[1]))));
    const g = Math.max(0, Math.min(255, Math.round(Number(match[2]))));
    const b = Math.max(0, Math.min(255, Math.round(Number(match[3]))));
    const aRaw = match[4] == null ? 1 : Number(match[4]);
    const a = Math.max(0, Math.min(1, Number.isFinite(aRaw) ? aRaw : 1));

    return { r, g, b, a };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const normalized = hex.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return { r: 127, g: 127, b: 127 };
    }
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }

  private buildCssColor(hex: string, alpha: number): string {
    const safeAlpha = Math.max(0, Math.min(1, alpha));
    if (safeAlpha >= 0.999) {
      return hex.toLowerCase();
    }
    const { r, g, b } = this.hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha.toFixed(2)})`;
  }

  private updateIndicatorColor(hex: string, alpha: number): void {
    this.plugin.settings.tagIndicatorColor = this.buildCssColor(hex, alpha);
    this.applyIndicatorPreview();
    this.saveIndicatorSettingsDebounced();
  }

  private updateIndicatorIconPreview(previewEl: HTMLElement, iconName: string): void {
    previewEl.empty();
    try {
      setIcon(previewEl, iconName as any);
    } catch {
      setIcon(previewEl, 'tag');
    }
  }

  display(): void {
    const { containerEl } = this;
    const { locale } = this.plugin.settings;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Lumina' });

    containerEl.createEl('h3', { text: t(locale, 'generalSettings') });

    new Setting(containerEl)
      .setName('Language / Langue / Sprache / Idioma / 语言')
      .addDropdown((dropdown) => {
        (['en', 'fr', 'de', 'es', 'zh'] as LocaleKey[]).forEach((code) => {
          dropdown.addOption(code, LOCALE_NAMES[code]);
        });
        dropdown.setValue(this.plugin.settings.locale);
        dropdown.onChange(async (value) => {
          this.plugin.settings.locale = value as LocaleKey;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'enableTagSystem'))
      .setDesc(t(locale, 'enableTagSystemDesc'))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableTagSystem);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableTagSystem = value;
          await this.plugin.saveSettings();
          if (value) {
            if (this.plugin.settings.showFileExplorerTagsIndicator) {
              this.plugin.tagIndicatorService?.start();
            }
            this.plugin.fileHeaderService?.start();
          } else {
            this.plugin.tagIndicatorService?.stop();
            this.plugin.fileHeaderService?.stop();
          }
          this.display();
        });
      });

    // Tag options (only shown when tag system is enabled)
    if (this.plugin.settings.enableTagSystem) {
      containerEl.createEl('h3', { text: t(locale, 'tagSettings') });

      new Setting(containerEl)
        .setName(t(locale, 'showTagsIndicator'))
        .setDesc(t(locale, 'showTagsIndicatorDesc'))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.showFileExplorerTagsIndicator);
          toggle.onChange(async (value) => {
            this.plugin.settings.showFileExplorerTagsIndicator = value;
            await this.plugin.saveSettings();
            if (value) {
              this.plugin.tagIndicatorService?.start();
            } else {
              this.plugin.tagIndicatorService?.stop();
            }
          });
        });

      new Setting(containerEl)
        .setName(t(locale, 'tagIndicatorPosition'))
        .setDesc(t(locale, 'tagIndicatorPositionDesc'))
        .addDropdown((dropdown) => {
          dropdown.addOption('left', t(locale, 'left'));
          dropdown.addOption('right', t(locale, 'right'));
          dropdown.setValue(this.plugin.settings.tagIndicatorPosition);
          dropdown.onChange((value) => {
            this.plugin.settings.tagIndicatorPosition = value as 'left' | 'right';
            this.applyIndicatorPreview();
            this.saveIndicatorSettingsDebounced();
          });
        });

      new Setting(containerEl)
        .setName(t(locale, 'tagIndicatorCompensateShift'))
        .setDesc(t(locale, 'tagIndicatorCompensateShiftDesc'))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.tagIndicatorCompensateShift);
          toggle.onChange((value) => {
            this.plugin.settings.tagIndicatorCompensateShift = value;
            this.applyIndicatorPreview();
            this.saveIndicatorSettingsDebounced();
          });
        });

      new Setting(containerEl)
        .setName(t(locale, 'tagIndicatorStyle'))
        .setDesc(t(locale, 'tagIndicatorStyleDesc'))
        .addDropdown((dropdown) => {
          dropdown.addOption('dot', t(locale, 'tagIndicatorStyleDot'));
          dropdown.addOption('icon', t(locale, 'tagIndicatorStyleIcon'));
          dropdown.setValue(this.plugin.settings.tagIndicatorStyle);
          dropdown.onChange((value) => {
            this.plugin.settings.tagIndicatorStyle = value as TagIndicatorStyle;
            this.applyIndicatorPreview();
            this.saveIndicatorSettingsDebounced();
            this.display();
          });
        });

      const colorPreset = this.parseColorToHexAndAlpha(this.plugin.settings.tagIndicatorColor);
      let selectedHex = colorPreset.hex;
      let selectedAlpha = colorPreset.alpha;

      new Setting(containerEl)
        .setName(t(locale, 'tagIndicatorColor'))
        .setDesc(t(locale, 'tagIndicatorColorDesc'))
        .addColorPicker((picker) => {
          picker.setValue(selectedHex);
          picker.onChange((value) => {
            selectedHex = value;
            this.updateIndicatorColor(selectedHex, selectedAlpha);
          });
        })
        .addSlider((slider) => {
          slider.setLimits(0, 100, 1);
          slider.setValue(Math.round(selectedAlpha * 100));
          slider.setDynamicTooltip();
          slider.onChange((value) => {
            selectedAlpha = value / 100;
            this.updateIndicatorColor(selectedHex, selectedAlpha);
          });
        });

      new Setting(containerEl)
        .setName(t(locale, 'tagIndicatorSize'))
        .setDesc(t(locale, 'tagIndicatorSizeDesc'))
        .addSlider((slider) => {
          slider.setLimits(6, 24, 1);
          slider.setValue(this.plugin.settings.tagIndicatorSize);
          slider.setDynamicTooltip();
          slider.onChange((value) => {
            this.plugin.settings.tagIndicatorSize = value;
            this.applyIndicatorPreview();
            this.saveIndicatorSettingsDebounced();
          });
        });

      if (this.plugin.settings.tagIndicatorStyle === 'icon') {
        let iconTextInput: HTMLInputElement | null = null;
        let iconPreview: HTMLElement | null = null;
        const iconSetting = new Setting(containerEl)
          .setName(t(locale, 'tagIndicatorIcon'))
          .setDesc(t(locale, 'tagIndicatorIconDesc'))
          .addText((text) => {
            text.setPlaceholder('tag');
            text.setValue(this.plugin.settings.tagIndicatorLucideIcon);
            iconTextInput = text.inputEl;
            text.onChange((value) => {
              this.plugin.settings.tagIndicatorLucideIcon = value.trim() || 'tag';
              this.applyIndicatorPreview();
              this.saveIndicatorSettingsDebounced();
            });
          })
          .addButton((button) => {
            button.setButtonText(t(locale, 'browseIcons'));
            button.onClick(() => {
              new IconPickerModal(
                this.app,
                locale,
                this.plugin.settings.tagIndicatorLucideIcon,
                (iconId) => {
                  this.plugin.settings.tagIndicatorLucideIcon = iconId;
                  if (iconTextInput) {
                    iconTextInput.value = iconId;
                  }
                  if (iconPreview) {
                    this.updateIndicatorIconPreview(iconPreview, iconId);
                  }
                  this.applyIndicatorPreview();
                  this.saveIndicatorSettingsDebounced();
                }
              ).open();
            });
          });

        iconPreview = iconSetting.controlEl.createSpan({ cls: 'lumina-icon-preview' });
        this.updateIndicatorIconPreview(iconPreview, this.plugin.settings.tagIndicatorLucideIcon);
      }

      new Setting(containerEl)
        .setName(t(locale, 'tagClickAction'))
        .setDesc(t(locale, 'tagClickActionDesc'))
        .addDropdown((dropdown) => {
          dropdown.addOption('lumina', t(locale, 'searchInLumina'));
          dropdown.addOption('obsidian', t(locale, 'searchInObsidian'));
          dropdown.setValue(this.plugin.settings.tagClickAction);
          dropdown.onChange(async (value) => {
            this.plugin.settings.tagClickAction = value as 'lumina' | 'obsidian';
            await this.plugin.saveSettings();
          });
        });

      // Virtual Search Integration
      containerEl.createEl('h3', { text: t(locale, 'searchIntegration') });

      new Setting(containerEl)
        .setName(t(locale, 'enableVirtualSearch'))
        .setDesc(t(locale, 'enableVirtualSearchDesc'))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.enableVirtualSearch);
          toggle.onChange(async (value) => {
            this.plugin.settings.enableVirtualSearch = value;
            await this.plugin.saveSettings();
            if (value) {
              this.plugin.virtualSearchService?.enable();
            } else {
              this.plugin.virtualSearchService?.disable();
            }
            this.display();
          });
        });

      if (this.plugin.settings.enableVirtualSearch) {
        new Setting(containerEl)
          .setName(t(locale, 'virtualSearchClickAction'))
          .setDesc(t(locale, 'virtualSearchClickActionDesc'))
          .addDropdown((dropdown) => {
            dropdown.addOption('obsidian', t(locale, 'openInObsidian'));
            dropdown.addOption('lumina', t(locale, 'openInLumina'));
            dropdown.setValue(this.plugin.settings.virtualSearchClickAction);
            dropdown.onChange(async (value) => {
              this.plugin.settings.virtualSearchClickAction = value as 'obsidian' | 'lumina';
              await this.plugin.saveSettings();
            });
          });
      }

      // Backlinks Section
      containerEl.createEl('h3', { text: t(locale, 'backlinksSection') });

      new Setting(containerEl)
        .setName(t(locale, 'scanBacklinks'))
        .setDesc(t(locale, 'scanBacklinksDesc'))
        .addButton((button) => {
          button.setButtonText(t(locale, 'scanNow'));
          button.onClick(async () => {
            button.setDisabled(true);
            button.setButtonText(t(locale, 'scanning'));
            try {
              const count = await this.plugin.scanAndCreateBacklinks();
              new Notice(t(locale, 'scanComplete')?.replace('{count}', String(count)) || `Scan complete! Created ${count} backlinks.`);
            } catch (e) {
              new Notice('Error during scan: ' + (e as Error).message);
            } finally {
              button.setDisabled(false);
              button.setButtonText(t(locale, 'scanNow'));
            }
          });
        });
    }

    // Gallery Settings
    containerEl.createEl('h3', { text: t(locale, 'gallerySettings') });

    new Setting(containerEl)
      .setName(t(locale, 'blockImageClickAction'))
      .setDesc(t(locale, 'blockImageClickActionDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('preview', t(locale, 'previewFullscreen'));
        dropdown.addOption('open', t(locale, 'openFile'));
        dropdown.setValue(this.plugin.settings.blockImageClickAction);
        dropdown.onChange(async (value) => {
          this.plugin.settings.blockImageClickAction = value as 'preview' | 'open';
          await this.plugin.saveSettings();
        });
      });

    // Gallery Defaults
    containerEl.createEl('h3', { text: t(locale, 'galleryDefaults') });

    new Setting(containerEl)
      .setName(t(locale, 'defaultLayout'))
      .setDesc(t(locale, 'defaultLayoutDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('justified', t(locale, 'justifiedLayout'));
        dropdown.addOption('square', t(locale, 'squareGrid'));
        dropdown.addOption('detail', t(locale, 'detailView'));
        dropdown.addOption('panorama-square', t(locale, 'panorama') + ' (Square)');
        dropdown.addOption('panorama-justified', t(locale, 'panorama') + ' (Justified)');
        dropdown.setValue(this.plugin.settings.defaultLayout);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultLayout = value as LayoutType;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'defaultZoom'))
      .setDesc(t(locale, 'defaultZoomDesc'))
      .addSlider((slider) => {
        slider.setLimits(50, 500, 10);
        slider.setValue(this.plugin.settings.defaultZoom);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.defaultZoom = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'defaultShowNames'))
      .setDesc(t(locale, 'defaultShowNamesDesc'))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.defaultShowNames);
        toggle.onChange(async (value) => {
          this.plugin.settings.defaultShowNames = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'defaultMediaFilter'))
      .setDesc(t(locale, 'defaultMediaFilterDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('all', t(locale, 'photos') + ' + ' + t(locale, 'videos'));
        dropdown.addOption('photos', t(locale, 'photos'));
        dropdown.addOption('videos', t(locale, 'videos'));
        dropdown.setValue(this.plugin.settings.defaultMediaFilter);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultMediaFilter = value as 'all' | 'photos' | 'videos';
          await this.plugin.saveSettings();
        });
      });

    // Performance Settings
    containerEl.createEl('h3', { text: t(locale, 'performanceSettings') });

    new Setting(containerEl)
      .setName(t(locale, 'thumbnailQuality'))
      .setDesc(t(locale, 'thumbnailQualityDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('low', t(locale, 'qualityLow'));
        dropdown.addOption('medium', t(locale, 'qualityMedium'));
        dropdown.addOption('high', t(locale, 'qualityHigh'));
        dropdown.setValue(this.plugin.settings.thumbnailQuality);
        dropdown.onChange(async (value) => {
          this.plugin.settings.thumbnailQuality = value as 'low' | 'medium' | 'high';
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'maxCacheSize'))
      .setDesc(t(locale, 'maxCacheSizeDesc'))
      .addSlider((slider) => {
        slider.setLimits(100, 2000, 100);
        slider.setValue(this.plugin.settings.maxCacheSizeMB);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.maxCacheSizeMB = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'enableStartupSync'))
      .setDesc(t(locale, 'enableStartupSyncDesc'))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableStartupSync);
        toggle.onChange(async (value) => {
          this.plugin.settings.enableStartupSync = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'debugLogs'))
      .setDesc(t(locale, 'debugLogsDesc'))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showDebugLogs);
        toggle.onChange(async (value) => {
          this.plugin.settings.showDebugLogs = value;
          await this.plugin.saveSettings();
        });
      });

    // ── Backup & Restore ──
    containerEl.createEl('h3', { text: t(locale, 'backupRestore') });

    new Setting(containerEl)
      .setName(t(locale, 'autoBackup'))
      .setDesc(t(locale, 'autoBackupDesc'))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoBackupEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.autoBackupEnabled = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.autoBackupEnabled) {
      new Setting(containerEl)
        .setName(t(locale, 'backupInterval'))
        .setDesc(t(locale, 'backupIntervalDesc'))
        .addSlider((slider) => {
          slider.setLimits(1, 168, 1);
          slider.setValue(this.plugin.settings.autoBackupIntervalHours);
          slider.setDynamicTooltip();
          slider.onChange(async (value) => {
            this.plugin.settings.autoBackupIntervalHours = value;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName(t(locale, 'backupPath'))
        .setDesc(t(locale, 'backupPathDesc'))
        .addText((text) => {
          text.setPlaceholder('backups/lumina');
          text.setValue(this.plugin.settings.autoBackupPath);
          text.onChange(async (value) => {
            this.plugin.settings.autoBackupPath = value.trim();
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(containerEl)
      .setName(t(locale, 'exportBackup'))
      .addButton((btn) => {
        btn.setButtonText(t(locale, 'exportBackup'));
        btn.onClick(async () => {
          const folder = this.plugin.settings.autoBackupPath || '';
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const fileName = `lumina-tags-backup-${ts}.json`;
          const sep = folder.includes('\\') ? '\\' : '/';
          const fullPath = folder ? `${folder.replace(/[\\/]$/, '')}${sep}${fileName}` : fileName;
          try {
            await this.plugin.exportTagBackup(fullPath);
            new Notice(t(locale, 'backupExported'));
          } catch (e) {
            new Notice('Error: ' + (e as Error).message);
          }
        });
      });

    new Setting(containerEl)
      .setName(t(locale, 'importBackup'))
      .addButton((btn) => {
        btn.setButtonText(t(locale, 'importBackup'));
        btn.onClick(() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const data = JSON.parse(text);
              const importedMap = data.tags as Record<string, string[]>;
              if (!importedMap || typeof importedMap !== 'object') {
                throw new Error('Invalid backup format');
              }
              const count = await this.plugin.importTagBackupFromData(importedMap);
              new Notice(t(locale, 'backupImported', { n: count }));
            } catch (e) {
              new Notice('Error: ' + (e as Error).message);
            }
          });
          input.click();
        });
      });
  }
}
