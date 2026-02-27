declare function require(id: string): any;

import { Plugin, TFile, Menu, Editor, MarkdownView } from 'obsidian';
import { LuminaView, VIEW_TYPE_LUMINA } from './view';
import { LuminaSettingTab } from './settings';
import type { LuminaSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import { t, type LocaleKey } from './i18n/locales';
import { TagManager } from './services/tagManager';
import { TagIndicatorService } from './services/tagIndicatorService';
import { FrontmatterService } from './services/frontmatterService';
import { FileHeaderService } from './services/fileHeaderService';
import { LuminaBlockProcessor } from './services/LuminaBlockProcessor';
import { VirtualSearchService } from './services/VirtualSearchService';
import { TagManagerModal, BatchTagModal } from './components/TagModals';
import { initDebugLog, debugLog } from './utils/debugLog';

function getWorkerUrl(): string {
  try {
    const path = require('path');
    return 'file:///' + path.join(__dirname, 'worker.js').replace(/\\/g, '/');
  } catch {
    return './worker.js';
  }
}

/**
 * Public API exposed via window.LuminaAPI for other plugins
 */
export interface LuminaPublicAPI {
  /** Get all tags for a file path */
  getTags(path: string): string[];
  /** Get all unique tags in the vault */
  getAllTags(): string[];
  /** Get all file paths that have tags */
  getAllTaggedPaths(): string[];
  /** Get files that have a specific tag */
  getFilesWithTag(tag: string): string[];
  /** Get files that have ALL the specified tags */
  getFilesWithAllTags(tags: string[]): string[];
  /** Get the tag map version (increments on changes) */
  getVersion(): number;
  /** Add a listener for tag changes */
  onTagChange(callback: (path: string, tags: string[], oldTags: string[]) => void): () => void;
  /** Check if the API is available */
  readonly ready: boolean;
}

export default class LuminaPlugin extends Plugin {
  workerUrl = getWorkerUrl();
  settings: LuminaSettings = { ...DEFAULT_SETTINGS };
  tagManager: TagManager = new TagManager();
  tagIndicatorService: TagIndicatorService | null = null;
  frontmatterService: FrontmatterService | null = null;
  fileHeaderService: FileHeaderService | null = null;
  luminaBlockProcessor: LuminaBlockProcessor | null = null;
  virtualSearchService: VirtualSearchService | null = null;

  // Cached data for debounced saves
  private _cachedData: Record<string, unknown> | null = null;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _backupTimer: ReturnType<typeof setInterval> | null = null;

  async onload() {
    // Initialize debug logging first
    initDebugLog(() => this.settings.showDebugLogs);

    await this.loadSettings();
    this.addSettingTab(new LuminaSettingTab(this.app, this));

    // Load tag data from saved data (reuse already loaded data)
    const data = (await this.loadData()) as Record<string, unknown> | null;
    this._cachedData = data;
    const tagMapData = data?.tagMap as Record<string, string[]> | undefined;
    this.tagManager = new TagManager(tagMapData);

    // Initialize services
    this.frontmatterService = new FrontmatterService(this.app.vault, this.app);
    this.tagIndicatorService = new TagIndicatorService(
      this.tagManager,
      this.app,
      () => ({
        position: this.settings.tagIndicatorPosition,
        style: this.settings.tagIndicatorStyle,
        color: this.settings.tagIndicatorColor,
        size: this.settings.tagIndicatorSize,
        icon: this.settings.tagIndicatorLucideIcon,
        compensateShift: this.settings.tagIndicatorCompensateShift,
      })
    );

    // Initialize and register the Lumina block processor
    this.luminaBlockProcessor = new LuminaBlockProcessor(this.app, this, this.tagManager);
    this.luminaBlockProcessor.register();

    // Listener for automatic tag save (debounced)
    this.tagManager.addListener(() => {
      this.saveTagMapDebounced();
      this.tagIndicatorService?.scheduleRefresh();
    });

    // Flag to avoid infinite sync loops
    let isSyncingFromFrontmatter = false;
    let isSyncingBidirectional = false;

    // Listener to sync tags TO frontmatter of .md files
    // and handle bidirectional backlinks
    this.tagManager.addTagChangeListener(async (path, tags, oldTags) => {
      if (isSyncingFromFrontmatter || isSyncingBidirectional) return;

      const isMdFile = path.toLowerCase().endsWith('.md');

      if (isMdFile && this.frontmatterService) {
        // Sync source file frontmatter
        await this.frontmatterService.syncNoteProperties(path, tags);

        // Extract [[...]] links from old and new tags
        const oldLinks = (oldTags || []).filter(t => t.startsWith('[[') && t.endsWith(']]'));
        const newLinks = tags.filter(t => t.startsWith('[[') && t.endsWith(']]'));

        // Sync bidirectional backlinks
        if (oldLinks.length > 0 || newLinks.length > 0) {
          isSyncingBidirectional = true;
          try {
            await this.frontmatterService.syncBidirectionalLinks(path, oldLinks, newLinks);
          } finally {
            isSyncingBidirectional = false;
          }
        }
      } else if (!isMdFile && this.frontmatterService) {
        // For non-.md files (images, etc.), handle backlinks to notes
        const oldLinks = (oldTags || []).filter(t => t.startsWith('[[') && t.endsWith(']]'));
        const newLinks = tags.filter(t => t.startsWith('[[') && t.endsWith(']]'));

        if (oldLinks.length > 0 || newLinks.length > 0) {
          isSyncingBidirectional = true;
          try {
            await this.syncNonMdBacklinks(path, oldLinks, newLinks);
          } finally {
            isSyncingBidirectional = false;
          }
        }
      }
    });

    // Bidirectional sync: listen for vault metadata changes
    this.registerEvent(
      this.app.metadataCache.on('changed', async (file) => {
        debugLog('metadataCache changed event for:', file.path, 'ext:', file.extension);

        if (file.extension.toLowerCase() !== 'md') return;
        if (!this.frontmatterService) {
          debugLog('frontmatterService is null!');
          return;
        }
        if (isSyncingBidirectional) {
          debugLog('Skipping - isSyncingBidirectional is true');
          return;
        }

        // Read tags from frontmatter
        const frontmatterTags = this.frontmatterService.getAllTagsFromFrontmatter(file);
        const currentTags = this.tagManager.getTags(file.path);

        debugLog('metadataCache changed:', file.path, 'fm:', frontmatterTags.length, 'current:', currentTags.length);

        // Compare tags
        const frontmatterSet = new Set(frontmatterTags);
        const currentSet = new Set(currentTags);

        const areDifferent = frontmatterTags.length !== currentTags.length ||
          frontmatterTags.some(t => !currentSet.has(t)) ||
          currentTags.some(t => !frontmatterSet.has(t));

        if (areDifferent) {
          // Extract links for backlinks
          const oldLinks = currentTags.filter(t => t.startsWith('[[') && t.endsWith(']]'));
          const newLinks = frontmatterTags.filter(t => t.startsWith('[[') && t.endsWith(']]'));

          debugLog('Tags differ, oldLinks:', oldLinks.length, 'newLinks:', newLinks.length);

          isSyncingFromFrontmatter = true;
          if (frontmatterTags.length > 0) {
            this.tagManager.setTags(file.path, frontmatterTags);
          } else {
            this.tagManager.clearTags(file.path);
          }
          isSyncingFromFrontmatter = false;

          // Sync bidirectional backlinks (additions AND removals)
          if (oldLinks.length > 0 || newLinks.length > 0) {
            debugLog('Calling syncBidirectionalLinks...');
            isSyncingBidirectional = true;
            try {
              await this.frontmatterService.syncBidirectionalLinks(file.path, oldLinks, newLinks);
              debugLog('syncBidirectionalLinks completed');
            } finally {
              isSyncingBidirectional = false;
            }
          }
        }
      })
    );

    // Deferred initialization on layout ready
    this.app.workspace.onLayoutReady(() => {
      // Sync from frontmatter only if enabled
      if (this.settings.enableStartupSync) {
        // Use setTimeout to not block the layout
        setTimeout(() => this.syncAllFromFrontmatter(), 100);
      }

      // Initialize VirtualSearchService (deferred - needs DOM)
      this.virtualSearchService = new VirtualSearchService(this.app, this, this.tagManager);
      if (this.settings.enableVirtualSearch) {
        this.virtualSearchService.enable();
      }

      // Start tag indicator (deferred)
      if (this.settings.enableTagSystem && this.settings.showFileExplorerTagsIndicator) {
        this.tagIndicatorService?.start();
      }

      // Initialize file header service (deferred)
      this.fileHeaderService = new FileHeaderService(
        this.app,
        this.tagManager,
        () => this.settings.locale,
        (filePath) => this.openTagModal(filePath)
      );
      if (this.settings.enableTagSystem) {
        this.fileHeaderService.start();
      }

      // Expose public API
      this.exposePublicAPI();

      // Write shared tag file at startup so other plugins can read it
      this.writeSharedTagFile(this.tagManager.getData());

      // Start auto backup timer if enabled
      this.startAutoBackupTimer();
    });

    this.registerView(VIEW_TYPE_LUMINA, (leaf) => new LuminaView(leaf, this));
    const openLabel = t(this.settings.locale, 'openLumina');
    this.addRibbonIcon('image', openLabel, () => this.activateView());
    this.addCommand({
      id: 'open-lumina',
      name: openLabel,
      callback: () => this.activateView(),
    });

    // Command to manage tags on active file
    this.addCommand({
      id: 'manage-tags',
      name: t(this.settings.locale, 'manageTags'),
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          if (!checking) {
            new TagManagerModal(
              this.app,
              file.path,
              file.name,
              this.tagManager,
              this.settings.locale
            ).open();
          }
          return true;
        }
        return false;
      },
    });

    // Command to insert a Lumina block
    this.addCommand({
      id: 'insert-lumina-block',
      name: t(this.settings.locale, 'insertLuminaBlock'),
      editorCallback: (editor: Editor) => {
        const cursor = editor.getCursor();
        const template = '```lumina\n#tag1 OR #tag2\n```\n';
        editor.replaceRange(template, cursor);
      },
    });

    // Context menu on files in the explorer
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile) {
          menu.addItem((item) => {
            item
              .setTitle(t(this.settings.locale, 'manageTags'))
              .setIcon('tag')
              .onClick(() => {
                new TagManagerModal(
                  this.app,
                  file.path,
                  file.name,
                  this.tagManager,
                  this.settings.locale
                ).open();
              });
          });
        }
      })
    );

    // Context menu on multiple selected files in the explorer
    this.registerEvent(
      this.app.workspace.on('files-menu', (menu, files) => {
        const tFiles = files.filter((f): f is TFile => f instanceof TFile);
        if (tFiles.length > 0) {
          menu.addItem((item) => {
            item
              .setTitle(t(this.settings.locale, 'manageTags') + ` (${tFiles.length})`)
              .setIcon('tag')
              .onClick(() => {
                new BatchTagModal(
                  this.app,
                  tFiles.map(f => f.path),
                  this.tagManager,
                  this.settings.locale
                ).open();
              });
          });
        }
      })
    );

    // Shift+T shortcut to open tag modal on selected files
    this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
      if (!this.settings.enableTagSystem) return;

      if (evt.shiftKey && evt.key === 'T' && !evt.ctrlKey && !evt.altKey && !evt.metaKey) {
        // Don't trigger in text fields
        const target = evt.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        // Get selected files from explorer
        const selectedFiles = this.getSelectedFilesFromExplorer();
        if (selectedFiles.length > 0) {
          evt.preventDefault();
          evt.stopPropagation();

          if (selectedFiles.length === 1) {
            new TagManagerModal(
              this.app,
              selectedFiles[0].path,
              selectedFiles[0].name,
              this.tagManager,
              this.settings.locale
            ).open();
          } else {
            new BatchTagModal(
              this.app,
              selectedFiles.map(f => f.path),
              this.tagManager,
              this.settings.locale
            ).open();
          }
        }
      }
    });

    // Vault events
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) {
          this.tagManager.renamePath(oldPath, file.path);
          this.tagIndicatorService?.updateIndicator(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile) {
          this.tagManager.clearTags(file.path);
        }
      })
    );

    // Observe file explorer for indicators
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        if (this.settings.enableTagSystem && this.settings.showFileExplorerTagsIndicator) {
          this.tagIndicatorService?.handleLayoutChange();
        }
      })
    );

    // Context menu to insert a Lumina block
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension.toLowerCase() === 'md') {
          menu.addItem((item) => {
            item.setTitle(t(this.settings.locale, 'insertLuminaBlock'));
            item.setIcon('image');
            item.onClick(() => {
              this.insertLuminaBlock(file);
            });
          });
        }
      })
    );

    // Context menu in editor
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, view) => {
        menu.addItem((item) => {
          item.setTitle(t(this.settings.locale, 'insertLuminaBlock'));
          item.setIcon('image');
          item.onClick(() => {
            this.insertLuminaBlockAtCursor(editor);
          });
        });
      })
    );
  }

  /**
   * Expose public API for other plugins via window.LuminaAPI
   */
  private exposePublicAPI(): void {
    const api: LuminaPublicAPI = {
      getTags: (path: string) => this.tagManager.getTags(path),
      getAllTags: () => this.tagManager.getAllTags(),
      getAllTaggedPaths: () => this.tagManager.getAllTaggedPaths(),
      getFilesWithTag: (tag: string) => this.tagManager.getFilesWithTag(tag),
      getFilesWithAllTags: (tags: string[]) => this.tagManager.getFilesWithAllTags(tags),
      getVersion: () => this.tagManager.getVersion(),
      onTagChange: (callback: (path: string, tags: string[], oldTags: string[]) => void) => {
        this.tagManager.addTagChangeListener(callback);
        return () => this.tagManager.removeTagChangeListener(callback);
      },
      ready: true,
    };

    (window as any).LuminaAPI = api;
    // Dispatch event so other plugins know the API is ready
    window.dispatchEvent(new CustomEvent('lumina:api-ready', { detail: api }));
    debugLog('Public API exposed via window.LuminaAPI');
  }

  /**
   * Opens the tag management modal for a file
   */
  openTagModal(filePath: string): void {
    const fileName = filePath.split('/').pop() || filePath;
    new TagManagerModal(
      this.app,
      filePath,
      fileName,
      this.tagManager,
      this.settings.locale
    ).open();
  }

  /**
   * Gets selected files from the Obsidian file explorer
   * Supports multi-selection (Ctrl+click, Shift+click)
   */
  getSelectedFilesFromExplorer(): TFile[] {
    const selectedFiles: TFile[] = [];
    const addedPaths = new Set<string>();

    // Method 1: Access explorer via leaves
    const fileExplorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
    if (fileExplorerLeaf?.view) {
      const view = fileExplorerLeaf.view as any;

      // Priority: selection via view.tree.selectedDoms (Map of selected elements)
      if (view.tree?.selectedDoms) {
        const selectedDoms = view.tree.selectedDoms;
        if (selectedDoms instanceof Map && selectedDoms.size > 0) {
          for (const [path] of selectedDoms) {
            if (!addedPaths.has(path)) {
              const file = this.app.vault.getAbstractFileByPath(path);
              if (file instanceof TFile) {
                selectedFiles.push(file);
                addedPaths.add(path);
              }
            }
          }
        }
      }

      // Method 2: view.selectedItems
      if (selectedFiles.length === 0 && view.selectedItems) {
        const items = Array.isArray(view.selectedItems) ? view.selectedItems :
                      view.selectedItems instanceof Set ? Array.from(view.selectedItems) :
                      view.selectedItems instanceof Map ? Array.from(view.selectedItems.values()) : [];
        for (const item of items) {
          const file = item?.file || item;
          if (file instanceof TFile && !addedPaths.has(file.path)) {
            selectedFiles.push(file);
            addedPaths.add(file.path);
          }
        }
      }

      // Method 3: tree.selectedItems
      if (selectedFiles.length === 0 && view.tree?.selectedItems) {
        const items = Array.isArray(view.tree.selectedItems) ? view.tree.selectedItems :
                      view.tree.selectedItems instanceof Set ? Array.from(view.tree.selectedItems) :
                      view.tree.selectedItems instanceof Map ? Array.from(view.tree.selectedItems.values()) : [];
        for (const item of items) {
          const file = item?.file || item;
          if (file instanceof TFile && !addedPaths.has(file.path)) {
            selectedFiles.push(file);
            addedPaths.add(file.path);
          }
        }
      }

      // Method 4: fileItems with DOM class check
      if (selectedFiles.length === 0 && view.fileItems) {
        for (const [path, item] of Object.entries(view.fileItems)) {
          const typedItem = item as { file?: TFile; el?: HTMLElement; selfEl?: HTMLElement };
          const el = typedItem.el || typedItem.selfEl;
          const isSelected = el?.classList.contains('is-selected') ||
                            el?.classList.contains('is-active') ||
                            el?.hasAttribute('data-selected') ||
                            el?.closest('.is-selected') !== null;
          if (isSelected && typedItem.file instanceof TFile) {
            if (!addedPaths.has(path)) {
              selectedFiles.push(typedItem.file);
              addedPaths.add(path);
            }
          }
        }
      }

      // Method 5: view.file property
      if (selectedFiles.length === 0 && view.file instanceof TFile) {
        selectedFiles.push(view.file);
        addedPaths.add(view.file.path);
      }

      // Method 6: Fallback on focusedItem
      if (selectedFiles.length === 0 && view.tree?.focusedItem?.file instanceof TFile) {
        selectedFiles.push(view.tree.focusedItem.file);
        addedPaths.add(view.tree.focusedItem.file.path);
      }
    }

    // DOM method: Direct DOM search for selected elements
    if (selectedFiles.length === 0) {
      const selectors = [
        '.nav-file-title.is-selected',
        '.nav-file.is-selected .nav-file-title',
        '.tree-item.is-selected .tree-item-self',
        '.tree-item-self.is-selected',
        '.nav-file-title.is-active',
        '.nav-file.is-active .nav-file-title',
        '[data-selected="true"]',
        '.nav-file-title.has-focus',
        '.tree-item-self.has-focus',
        '[aria-selected="true"]'
      ];

      const selectedElements = document.querySelectorAll(selectors.join(', '));
      selectedElements.forEach((el) => {
        let filePath = el.getAttribute('data-path');

        if (!filePath) {
          const parent = el.closest('[data-path]');
          if (parent) {
            filePath = parent.getAttribute('data-path');
          }
        }

        if (filePath && !addedPaths.has(filePath)) {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file instanceof TFile) {
            selectedFiles.push(file);
            addedPaths.add(filePath);
          }
        }
      });
    }

    // Final fallback: active file
    if (selectedFiles.length === 0) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && !addedPaths.has(activeFile.path)) {
        selectedFiles.push(activeFile);
      }
    }

    return selectedFiles;
  }

  /**
   * Inserts a Lumina block into a file
   */
  async insertLuminaBlock(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const block = '\n```lumina\n#photo\nlayout: justified\ncolumns: 4\nshowNames: false\n```\n';
    await this.app.vault.modify(file, content + block);
  }

  /**
   * Inserts a Lumina block at cursor position
   */
  insertLuminaBlockAtCursor(editor: Editor): void {
    const block = '```lumina\n#photo\nlayout: justified\ncolumns: 4\nshowNames: false\n```\n';
    editor.replaceSelection(block);
  }

  async loadSettings() {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    this._cachedData = data;
    this.settings = { ...DEFAULT_SETTINGS, ...(data?.settings as Partial<LuminaSettings>) };
  }

  async saveSettings() {
    if (!this._cachedData) {
      this._cachedData = (await this.loadData()) as Record<string, unknown> | null;
    }
    this._cachedData = { ...this._cachedData, settings: this.settings };
    await this.saveData(this._cachedData);
    // Dispatch settings change event for React components
    window.dispatchEvent(new CustomEvent('lumina:settings-changed', { detail: this.settings }));
  }

  /**
   * Starts the auto backup timer based on settings
   */
  private startAutoBackupTimer(): void {
    if (this._backupTimer) {
      clearInterval(this._backupTimer);
      this._backupTimer = null;
    }
    if (!this.settings.autoBackupEnabled || this.settings.autoBackupIntervalHours <= 0) return;

    const intervalMs = this.settings.autoBackupIntervalHours * 60 * 60 * 1000;
    this._backupTimer = setInterval(async () => {
      try {
        const folder = this.settings.autoBackupPath || '';
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `lumina-tags-backup-${ts}.json`;
        const sep = folder.includes('\\') ? '\\' : '/';
        const path = folder ? `${folder.replace(/[\\/]$/, '')}${sep}${fileName}` : fileName;
        await this.exportTagBackup(path);
        debugLog('Auto backup created:', path);
      } catch (e) {
        console.error('[Lumina] Auto backup failed:', e);
      }
    }, intervalMs);
    debugLog('Auto backup timer started, interval:', this.settings.autoBackupIntervalHours, 'hours');
  }

  /**
   * Debounced tag map save - coalesces rapid changes into a single write.
   * Also mirrors tags to .obsidian/lumina-tags.json for cross-plugin access.
   */
  private saveTagMapDebounced(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(async () => {
      this._saveTimer = null;
      try {
        const tagData = this.tagManager.getData();
        // Save to plugin data.json
        if (!this._cachedData) {
          this._cachedData = (await this.loadData()) as Record<string, unknown> | null;
        }
        this._cachedData = { ...this._cachedData, tagMap: tagData };
        await this.saveData(this._cachedData);
        // Mirror to .obsidian/lumina-tags.json for cross-plugin access
        await this.writeSharedTagFile(tagData);
        debugLog('Tag map saved (debounced)');
      } catch (e) {
        console.error('[Lumina] Failed to save tag map:', e);
      }
    }, 500);
  }

  /**
   * Writes tag map to .obsidian/lumina-tags.json so other plugins can read it
   */
  private async writeSharedTagFile(tagMap: Record<string, string[]>): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      const sharedPath = '.obsidian/lumina-tags.json';
      const payload = JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        tags: tagMap,
      }, null, 2);
      await adapter.write(sharedPath, payload);
    } catch (e) {
      debugLog('Failed to write shared tag file:', e);
    }
  }

  /**
   * Write to an absolute or vault-relative path.
   * Absolute paths (C:\... or /...) use Node fs; relative paths use the vault adapter.
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    const isAbsolute = /^([a-zA-Z]:\\|\/)/.test(filePath);
    if (isAbsolute) {
      const fs = require('fs').promises;
      const path = require('path');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    } else {
      await this.app.vault.adapter.write(filePath, content);
    }
  }

  /**
   * Read from an absolute or vault-relative path.
   */
  private async readFile(filePath: string): Promise<string> {
    const isAbsolute = /^([a-zA-Z]:\\|\/)/.test(filePath);
    if (isAbsolute) {
      const fs = require('fs').promises;
      return await fs.readFile(filePath, 'utf-8');
    } else {
      return await this.app.vault.adapter.read(filePath);
    }
  }

  /**
   * Export tags to a user-chosen backup file
   */
  async exportTagBackup(backupPath: string): Promise<void> {
    const tagData = this.tagManager.getData();
    const backup = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      pluginVersion: this.manifest.version,
      tagCount: Object.keys(tagData).length,
      tags: tagData,
    }, null, 2);
    await this.writeFile(backupPath, backup);
    debugLog('Tag backup exported to:', backupPath);
  }

  /**
   * Import tags from a backup file (merges with existing)
   */
  async importTagBackup(backupPath: string): Promise<number> {
    const raw = await this.readFile(backupPath);
    const data = JSON.parse(raw);
    const importedMap = data.tags as Record<string, string[]>;
    if (!importedMap || typeof importedMap !== 'object') {
      throw new Error('Invalid backup format');
    }
    let importCount = 0;
    for (const [path, tags] of Object.entries(importedMap)) {
      if (!Array.isArray(tags)) continue;
      const existing = this.tagManager.getTags(path);
      const merged = [...new Set([...existing, ...tags.filter(t => typeof t === 'string' && t.trim())])];
      if (merged.length !== existing.length || merged.some(t => !existing.includes(t))) {
        this.tagManager.setTags(path, merged);
        importCount++;
      }
    }
    debugLog('Tag backup imported from:', backupPath, 'files updated:', importCount);
    return importCount;
  }

  /**
   * Import tags from already-parsed data (used by file picker in settings)
   */
  async importTagBackupFromData(importedMap: Record<string, string[]>): Promise<number> {
    let importCount = 0;
    for (const [path, tags] of Object.entries(importedMap)) {
      if (!Array.isArray(tags)) continue;
      const existing = this.tagManager.getTags(path);
      const merged = [...new Set([...existing, ...tags.filter(t => typeof t === 'string' && t.trim())])];
      if (merged.length !== existing.length || merged.some(t => !existing.includes(t))) {
        this.tagManager.setTags(path, merged);
        importCount++;
      }
    }
    this.saveTagMapDebounced();
    debugLog('Tag backup imported from file picker, files updated:', importCount);
    return importCount;
  }

  getLocale(): LocaleKey {
    return this.settings.locale;
  }

  /**
   * Syncs tags from frontmatter of all .md files in the vault
   * towards the TagManager (called at startup)
   */
  syncAllFromFrontmatter(): void {
    if (!this.frontmatterService) return;

    const files = this.app.vault.getMarkdownFiles();
    let syncCount = 0;
    for (const file of files) {
      const frontmatterTags = this.frontmatterService.getAllTagsFromFrontmatter(file);
      if (frontmatterTags.length > 0) {
        const currentTags = this.tagManager.getTags(file.path);
        // Merge existing tags with frontmatter ones
        const merged = [...new Set([...currentTags, ...frontmatterTags])];
        if (merged.length !== currentTags.length || merged.some(t => !currentTags.includes(t))) {
          this.tagManager.setTags(file.path, merged);
          syncCount++;
        }
      }
    }
    debugLog('syncAllFromFrontmatter completed:', syncCount, 'files updated out of', files.length);
  }

  /**
   * Scans all markdown files for [[...]] links in frontmatter
   * and creates missing backlinks in target files
   */
  async scanAndCreateBacklinks(): Promise<number> {
    if (!this.frontmatterService) return 0;

    let createdCount = 0;
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const { links } = this.frontmatterService.readTagsFromFrontmatter(file);

      if (links.length === 0) continue;

      const sourceBacklink = `[[${file.basename}]]`;

      for (const link of links) {
        // Extract target file name
        const targetName = link.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
        if (!targetName) continue;

        // Find target file
        const targetFile = this.findFileByName(targetName);
        if (!targetFile) continue;

        // Read current tags of target file
        const targetTags = this.tagManager.getTags(targetFile.path);

        // Check if backlink already exists
        const backlinkExists = targetTags.some(t =>
          t.toLowerCase() === sourceBacklink.toLowerCase()
        );

        if (!backlinkExists) {
          // Add backlink
          this.tagManager.addTag(targetFile.path, sourceBacklink);
          createdCount++;
        }
      }
    }

    // Force save after scan
    if (!this._cachedData) {
      this._cachedData = (await this.loadData()) as Record<string, unknown> | null;
    }
    this._cachedData = { ...this._cachedData, tagMap: this.tagManager.getData() };
    await this.saveData(this._cachedData);
    this.tagIndicatorService?.scheduleRefresh();

    return createdCount;
  }

  /**
   * Finds a file by name (with or without extension)
   */
  private findFileByName(name: string): TFile | null {
    const lowerName = name.toLowerCase();
    const allFiles = this.app.vault.getFiles();

    return allFiles.find(f =>
      f.basename.toLowerCase() === lowerName ||
      f.name.toLowerCase() === lowerName
    ) || null;
  }

  /**
   * Syncs backlinks for non-.md files (images, PDFs, etc.)
   */
  private async syncNonMdBacklinks(
    sourcePath: string,
    oldLinks: string[],
    newLinks: string[]
  ): Promise<void> {
    if (!this.frontmatterService) return;

    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile)) return;

    const sourceBacklink = `[[${sourceFile.name}]]`;

    // Removed links = remove backlink
    const removedLinks = oldLinks.filter(l => !newLinks.includes(l));
    for (const link of removedLinks) {
      const targetName = link.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
      const targetFile = this.findFileByName(targetName);

      if (!targetFile) continue;

      if (targetFile.extension.toLowerCase() === 'md') {
        const { hashtags, links: currentLinks } = this.frontmatterService.readTagsFromFrontmatter(targetFile);
        const filteredLinks = currentLinks.filter(l =>
          l.toLowerCase() !== sourceBacklink.toLowerCase()
        );
        if (filteredLinks.length !== currentLinks.length) {
          await this.frontmatterService.syncNoteProperties(targetFile.path, [...hashtags, ...filteredLinks]);
        }
      } else {
        const currentTags = this.tagManager.getTags(targetFile.path);
        const filteredTags = currentTags.filter(t =>
          t.toLowerCase() !== sourceBacklink.toLowerCase()
        );
        if (filteredTags.length !== currentTags.length) {
          this.tagManager.setTags(targetFile.path, filteredTags);
        }
      }
    }

    // Added links = create backlink
    const addedLinks = newLinks.filter(l => !oldLinks.includes(l));
    for (const link of addedLinks) {
      const targetName = link.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
      const targetFile = this.findFileByName(targetName);

      if (!targetFile) continue;

      if (targetFile.extension.toLowerCase() === 'md') {
        const { hashtags, links: currentLinks } = this.frontmatterService.readTagsFromFrontmatter(targetFile);
        const alreadyExists = currentLinks.some(l =>
          l.toLowerCase() === sourceBacklink.toLowerCase()
        );

        if (!alreadyExists) {
          await this.frontmatterService.syncNoteProperties(targetFile.path, [...hashtags, ...currentLinks, sourceBacklink]);
        }
      } else {
        const currentTags = this.tagManager.getTags(targetFile.path);
        const alreadyExists = currentTags.some(t =>
          t.toLowerCase() === sourceBacklink.toLowerCase()
        );

        if (!alreadyExists) {
          this.tagManager.addTag(targetFile.path, sourceBacklink);
        }
      }
    }

    // Force refresh indicators
    this.tagIndicatorService?.scheduleRefresh();
  }

  onunload() {
    // Clean up public API
    delete (window as any).LuminaAPI;

    // Flush any pending save
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      const tagData = this.tagManager.getData();
      const data = { ...this._cachedData, tagMap: tagData };
      this.saveData(data);
      this.writeSharedTagFile(tagData);
    }

    if (this._backupTimer) {
      clearInterval(this._backupTimer);
      this._backupTimer = null;
    }
    this.tagIndicatorService?.stop();
    this.virtualSearchService?.disable();
    this.fileHeaderService?.stop();
    this.app.workspace.getLeavesOfType(VIEW_TYPE_LUMINA).forEach((leaf) => leaf.detach());
  }

  async activateView() {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_LUMINA, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
