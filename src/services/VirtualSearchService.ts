/**
 * VirtualSearchService - Makes Lumina-tagged media files discoverable in Obsidian search
 *
 * This service monitors Obsidian's search UI and injects media files that have been tagged
 * with Lumina as virtual results. Uses DOM observation for maximum compatibility.
 */

import { App, TFile, Plugin, Menu, debounce } from 'obsidian';
import { t } from '../i18n/locales';
import { debugLog } from '../utils/debugLog';
import type { TagManager } from './tagManager';
import type LuminaPlugin from '../main';

interface VirtualSearchResult {
  path: string;
  score: number;
  tags: string[];
}

export class VirtualSearchService {
  private app: App;
  private plugin: LuminaPlugin;
  private tagManager: TagManager;
  private isEnabled: boolean = false;
  private searchObserver: MutationObserver | null = null;
  private inputHandler: ((e: Event) => void) | null = null;
  private lastQuery: string = '';
  private lastInjectTime: number = 0;
  private mediaExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'pdf']);

  constructor(app: App, plugin: LuminaPlugin, tagManager: TagManager) {
    this.app = app;
    this.plugin = plugin;
    this.tagManager = tagManager;
  }

  /**
   * Enable the virtual search integration
   */
  enable(): void {
    if (this.isEnabled) return;

    try {
      this.setupSearchObserver();
      this.isEnabled = true;
      debugLog('Virtual Search Service enabled');
    } catch (error) {
      console.error('Lumina: Failed to enable Virtual Search Service', error);
    }
  }

  /**
   * Disable the virtual search integration
   */
  disable(): void {
    if (!this.isEnabled) return;

    try {
      this.searchObserver?.disconnect();
      this.searchObserver = null;

      // Remove global input listener
      if (this.inputHandler) {
        document.removeEventListener('input', this.inputHandler, true);
        this.inputHandler = null;
      }

      // Remove any injected results
      document.querySelectorAll('.lumina-virtual-result, .lumina-virtual-header, .lumina-virtual-section').forEach(el => el.remove());

      this.isEnabled = false;
      debugLog('Virtual Search Service disabled');
    } catch (error) {
      console.error('Lumina: Failed to disable Virtual Search Service', error);
    }
  }

  /**
   * Check if a file is a media file based on extension
   */
  isMediaFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return this.mediaExtensions.has(ext);
  }

  /**
   * Get the search leaf and view
   */
  private getSearchView(): { leaf: any; view: any } | null {
    const searchLeaf = this.app.workspace.getLeavesOfType('search')[0];
    if (!searchLeaf) return null;
    return { leaf: searchLeaf, view: searchLeaf.view };
  }

  /**
   * Setup observer for the search view - uses targeted observation
   */
  private setupSearchObserver(): void {
    const debouncedInject = debounce((query: string) => {
      this.injectSearchResults(query);
    }, 400, true);

    // Observer for DOM changes - targeted to search leaves only
    this.searchObserver = new MutationObserver(() => {
      const searchData = this.getSearchView();
      if (!searchData) return;

      const view = searchData.view as any;

      // Get the current search query from the search view
      const currentQuery = view?.searchQuery?.query || view?.getQuery?.() || '';

      if (currentQuery && currentQuery !== this.lastQuery) {
        this.lastQuery = currentQuery;
        debugLog('Search query from view:', currentQuery);
        debouncedInject(currentQuery);
      }

      // Also check if results container exists and inject if needed
      if (view?.dom?.resultDomLookup && currentQuery) {
        const now = Date.now();
        if (now - this.lastInjectTime > 600) {
          this.lastInjectTime = now;
          debouncedInject(currentQuery);
        }
      }
    });

    // Observe only search leaf containers instead of entire workspace
    const tryObserveSearch = () => {
      const searchLeaf = this.app.workspace.getLeavesOfType('search')[0];
      if (searchLeaf?.containerEl) {
        this.searchObserver!.observe(searchLeaf.containerEl, {
          childList: true,
          subtree: true,
        });
        debugLog('Search observer attached to search leaf');
      } else {
        // Fallback: observe workspace but only childList (no characterData)
        const workspace = document.querySelector('.workspace');
        if (workspace) {
          this.searchObserver!.observe(workspace, {
            childList: true,
            subtree: true,
          });
          debugLog('Search observer fallback: attached to workspace');
        }
      }
    };

    tryObserveSearch();

    // Re-attach observer when layout changes (search pane may appear later)
    this.plugin.registerEvent(
      this.app.workspace.on('layout-change', () => {
        if (!this.isEnabled) return;
        this.searchObserver?.disconnect();
        tryObserveSearch();
      })
    );

    // Input handler for search input - stored for cleanup
    this.inputHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.closest('.search-input-container') || target?.classList?.contains('search-input')) {
        const input = target as HTMLInputElement;
        const query = input.value?.trim();
        if (query && query !== this.lastQuery) {
          this.lastQuery = query;
          debugLog('Search input detected:', query);
          debouncedInject(query);
        }
      }
    };
    document.addEventListener('input', this.inputHandler, true);

    debugLog('Search observer setup complete');
  }

  /**
   * Search for media files that match the query
   */
  searchMedia(query: string): VirtualSearchResult[] {
    const results: VirtualSearchResult[] = [];

    // Clean up query (remove tag: prefix if present)
    let cleanQuery = query.replace(/^tag:/i, '').trim();

    // Parse the query
    const searchTags = this.extractSearchTags(cleanQuery);
    const searchLinks = this.extractSearchLinks(cleanQuery);
    const searchText = cleanQuery.replace(/#[\w\-\/]+/g, '').replace(/\[\[[^\]]+\]\]/g, '').trim().toLowerCase();

    // Get all tagged files from TagManager
    const allTaggedPaths = this.tagManager.getAllTaggedPaths();

    debugLog('Searching media - Query:', cleanQuery, 'Tags found:', searchTags, 'Total tagged paths:', allTaggedPaths.length);

    for (const path of allTaggedPaths) {
      // Only include media files
      if (!this.isMediaFile(path)) continue;

      const fileTags = this.tagManager.getTags(path);
      let score = 0;

      // Check for tag matches (with or without #)
      for (const searchTag of searchTags) {
        const normalizedSearch = searchTag.replace(/^#/, '').toLowerCase();
        for (const fileTag of fileTags) {
          const normalizedFileTag = fileTag.replace(/^#/, '').toLowerCase();
          if (normalizedFileTag === normalizedSearch) {
            score += 100;
          } else if (normalizedFileTag.includes(normalizedSearch) || normalizedSearch.includes(normalizedFileTag)) {
            score += 50;
          }
        }
      }

      // Check for link matches
      for (const searchLink of searchLinks) {
        const normalizedSearch = searchLink.replace(/^\[\[|\]\]$/g, '').toLowerCase();
        for (const fileTag of fileTags) {
          if (fileTag.startsWith('[[') && fileTag.endsWith(']]')) {
            const normalizedFileLink = fileTag.replace(/^\[\[|\]\]$/g, '').toLowerCase();
            if (normalizedFileLink === normalizedSearch) {
              score += 100;
            } else if (normalizedFileLink.includes(normalizedSearch)) {
              score += 50;
            }
          }
        }
      }

      // Check plain text search (filename and tags)
      if (searchText) {
        const filename = path.split('/').pop()?.toLowerCase() || '';
        if (filename.includes(searchText)) {
          score += 75;
        }
        for (const tag of fileTags) {
          if (tag.toLowerCase().includes(searchText)) {
            score += 25;
          }
        }
      }

      // Also match query directly against tags (without requiring #)
      const queryLower = cleanQuery.toLowerCase().trim();
      for (const fileTag of fileTags) {
        const tagLower = fileTag.replace(/^#/, '').toLowerCase();
        if (tagLower === queryLower || fileTag.toLowerCase() === queryLower) {
          score += 100;
        } else if (tagLower.includes(queryLower) || queryLower.includes(tagLower)) {
          score += 40;
        }
      }

      if (score > 0) {
        results.push({ path, score, tags: fileTags });
      }
    }

    results.sort((a, b) => b.score - a.score);

    debugLog('Found', results.length, 'media results');

    return results;
  }

  /**
   * Inject search results into the search view
   */
  private injectSearchResults(query: string): void {
    const searchData = this.getSearchView();
    if (!searchData) {
      debugLog('No search leaf found');
      return;
    }

    const view = searchData.view as any;

    // Find the DOM container for results
    let resultsContainer: HTMLElement | null = null;

    // Try different ways to find the results container
    if (view?.dom?.resultDom) {
      resultsContainer = view.dom.resultDom;
    } else if (view?.dom?.el) {
      resultsContainer = view.dom.el.querySelector('.search-result-container, .search-results-children');
    } else {
      // Fallback: find in document
      const searchLeafEl = searchData.leaf.containerEl;
      if (searchLeafEl) {
        resultsContainer = searchLeafEl.querySelector('.search-result-container, .search-results-children');
      }
    }

    if (!resultsContainer) {
      // Last resort: find anywhere in the DOM
      resultsContainer = document.querySelector('.search-result-container');
    }

    if (!resultsContainer) {
      debugLog('No results container found');
      return;
    }

    // Remove previous virtual results
    resultsContainer.querySelectorAll('.lumina-virtual-result, .lumina-virtual-header, .lumina-virtual-section').forEach(el => el.remove());

    // Get virtual results
    const results = this.searchMedia(query);
    if (results.length === 0) {
      debugLog('No media results to inject for query:', query);
      return;
    }

    const locale = this.plugin.settings.locale;

    // Create a section for Lumina results
    const section = document.createElement('div');
    section.className = 'lumina-virtual-section';

    // Create header
    const header = document.createElement('div');
    header.className = 'tree-item lumina-virtual-header';
    header.innerHTML = `
      <div class="tree-item-self is-clickable" style="padding: 8px 12px; margin-top: 12px; background: linear-gradient(135deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%); border-radius: 6px;">
        <div class="tree-item-inner" style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📷</span>
          <span style="font-weight: 600; color: white;">Lumina Media</span>
          <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: white;">${results.length}</span>
        </div>
      </div>
    `;
    section.appendChild(header);

    // Create result items (limit to 15)
    const displayResults = results.slice(0, 15);
    for (const result of displayResults) {
      const item = this.createResultElement(result);
      section.appendChild(item);
    }

    // Show "more" indicator if needed
    if (results.length > 15) {
      const more = document.createElement('div');
      more.className = 'lumina-virtual-more';
      more.style.cssText = 'padding: 8px 12px; color: var(--text-muted); font-size: 12px; text-align: center;';
      more.textContent = `... +${results.length - 15}`;
      section.appendChild(more);
    }

    // Append to results
    resultsContainer.appendChild(section);

    debugLog('Injected', displayResults.length, 'virtual results into container');
  }

  /**
   * Create a DOM element for a virtual search result
   */
  private createResultElement(result: VirtualSearchResult): HTMLElement {
    const locale = this.plugin.settings.locale;
    const container = document.createElement('div');
    container.className = 'tree-item search-result lumina-virtual-result';
    container.dataset.luminaPath = result.path;

    const ext = result.path.split('.').pop()?.toLowerCase() || '';
    let icon = '🖼️';
    let iconBg = 'rgba(76, 175, 80, 0.15)';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
      icon = '🎬';
      iconBg = 'rgba(33, 150, 243, 0.15)';
    } else if (ext === 'gif') {
      icon = '✨';
      iconBg = 'rgba(255, 152, 0, 0.15)';
    } else if (ext === 'pdf') {
      icon = '📄';
      iconBg = 'rgba(244, 67, 54, 0.15)';
    }

    const filename = result.path.split('/').pop() || result.path;
    const folder = result.path.includes('/')
      ? result.path.substring(0, result.path.lastIndexOf('/'))
      : '';

    container.innerHTML = `
      <div class="tree-item-self search-result-file-title is-clickable" style="padding: 8px 12px; border-left: 3px solid var(--interactive-accent); margin-left: 8px; margin-top: 4px; background: var(--background-secondary); border-radius: 0 6px 6px 0;">
        <div class="tree-item-inner" style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 18px; background: ${iconBg}; padding: 4px; border-radius: 6px;">${icon}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; color: var(--text-normal); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${filename}</div>
            ${folder ? `<div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${folder}</div>` : ''}
          </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; padding-left: 36px;">
          ${result.tags.slice(0, 4).map(tag => `<span style="background: var(--background-modifier-hover); padding: 2px 8px; border-radius: 10px; font-size: 10px; color: var(--text-muted);">${tag}</span>`).join('')}
          ${result.tags.length > 4 ? `<span style="font-size: 10px; color: var(--text-faint);">+${result.tags.length - 4}</span>` : ''}
        </div>
      </div>
    `;

    // Add click handler
    const clickable = container.querySelector('.tree-item-self');
    clickable?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const clickAction = this.plugin.settings.virtualSearchClickAction || 'obsidian';
      if (clickAction === 'obsidian') {
        this.openMediaInObsidian(result.path);
      } else {
        this.openMediaInLumina(result.path);
      }
    });

    // Add context menu
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showMediaContextMenu(e, result.path, result.tags);
    });

    return container;
  }

  /**
   * Extract #tags from search query
   */
  private extractSearchTags(query: string): string[] {
    const tagRegex = /#[\w\-\/]+/g;
    const matches = query.match(tagRegex) || [];
    // Also treat plain words as potential tags
    const words = query.split(/\s+/).filter(w => w.length > 1 && !w.startsWith('#') && !w.startsWith('[['));
    return [...matches, ...words];
  }

  /**
   * Extract [[links]] from search query
   */
  private extractSearchLinks(query: string): string[] {
    const linkRegex = /\[\[[^\]]+\]\]/g;
    return query.match(linkRegex) || [];
  }

  /**
   * Open a media file in Obsidian's native viewer
   */
  openMediaInObsidian(path: string): void {
    debugLog('Opening media in Obsidian:', path);

    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      // Open file in a new leaf using Obsidian's native handling
      this.app.workspace.getLeaf('tab').openFile(file);
    } else {
      debugLog('File not found:', path);
    }
  }

  /**
   * Open a media file in Lumina lightbox
   */
  openMediaInLumina(path: string): void {
    debugLog('Opening media in Lumina:', path);

    const leaves = this.app.workspace.getLeavesOfType('lumina-gallery');

    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('lumina:open-file', { detail: { path } }));
      }, 100);
    } else {
      this.app.workspace.getRightLeaf(false)?.setViewState({
        type: 'lumina-gallery',
        active: true,
      }).then(() => {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('lumina:open-file', { detail: { path } }));
        }, 500);
      });
    }
  }

  /**
   * Show context menu for media file (i18n)
   */
  private showMediaContextMenu(event: MouseEvent, path: string, tags: string[]): void {
    const locale = this.plugin.settings.locale;
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(t(locale, 'openInObsidian'))
        .setIcon('file')
        .onClick(() => this.openMediaInObsidian(path));
    });

    menu.addItem((item) => {
      item
        .setTitle(t(locale, 'openInLumina'))
        .setIcon('image')
        .onClick(() => this.openMediaInLumina(path));
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle(t(locale, 'copyPath'))
        .setIcon('copy')
        .onClick(() => navigator.clipboard.writeText(path));
    });

    if (tags.length > 0) {
      menu.addSeparator();
      menu.addItem((item) => {
        item
          .setTitle(`${t(locale, 'tags')}: ${tags.slice(0, 3).join(', ')}${tags.length > 3 ? '...' : ''}`)
          .setDisabled(true);
      });
    }

    menu.showAtMouseEvent(event);
  }

  /**
   * Get media files with a specific tag
   */
  getMediaWithTag(tag: string): string[] {
    const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
    const results: string[] = [];

    for (const path of this.tagManager.getAllTaggedPaths()) {
      if (!this.isMediaFile(path)) continue;

      const fileTags = this.tagManager.getTags(path);
      for (const fileTag of fileTags) {
        const normalizedFileTag = fileTag.startsWith('#') ? fileTag : `#${fileTag}`;
        if (normalizedFileTag.toLowerCase() === normalizedTag.toLowerCase()) {
          results.push(path);
          break;
        }
      }
    }

    return results;
  }
}
