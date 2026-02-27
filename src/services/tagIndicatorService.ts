/**
 * Service that renders tag badges in the file explorer.
 */

import { setIcon, TFile, type App } from 'obsidian';
import type { TagManager } from './tagManager';

export interface TagIndicatorAppearance {
  position: 'left' | 'right';
  style: 'dot' | 'icon';
  color: string;
  size: number;
  icon: string;
  compensateShift: boolean;
}

export class TagIndicatorService {
  private observer: MutationObserver | null = null;
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private observedExplorer: Element | null = null;
  private readonly app: App;
  private readonly tagManager: TagManager;
  private detachFns: Array<() => void> = [];
  private getAppearance: () => TagIndicatorAppearance = () => ({
    position: 'left',
    style: 'dot',
    color: 'var(--interactive-accent)',
    size: 8,
    icon: 'tag',
    compensateShift: false,
  });

  constructor(
    tagManager: TagManager,
    app: App,
    getAppearance?: () => TagIndicatorAppearance
  ) {
    this.tagManager = tagManager;
    this.app = app;
    if (getAppearance) {
      this.getAppearance = getAppearance;
    }
  }

  /**
   * Start observing and rendering badges.
   */
  start(): void {
    this.stop();
    this.registerMetadataListeners();

    // Wait for explorer DOM to be ready.
    setTimeout(() => {
      this.refreshIndicators();
      this.startObserver();
    }, 500);
  }

  /**
   * Stop observer and cleanup.
   */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.observedExplorer = null;

    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }

    this.detachFns.forEach((fn) => fn());
    this.detachFns = [];

    // Remove existing badges.
    document.querySelectorAll('.lumina-tag-indicator').forEach((el) => el.remove());
  }

  /**
   * Debounced refresh.
   */
  scheduleRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
      this.refreshIndicators();
    }, 300);
  }

  /**
   * Immediate refresh (used for live settings preview).
   */
  refreshNow(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    this.refreshIndicators();
  }

  /**
   * Start MutationObserver on file explorer.
   */
  private startObserver(): void {
    const fileExplorer = document.querySelector('.nav-files-container');
    if (!fileExplorer) return;

    this.observedExplorer = fileExplorer;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    this.observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some((mutation) => {
        if (mutation.type !== 'childList') return false;

        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            if (
              node.classList?.contains('nav-file') ||
              node.classList?.contains('nav-folder') ||
              node.querySelector?.('.nav-file-title')
            ) {
              return true;
            }
          }
        }

        return false;
      });

      if (!hasRelevantChanges) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.refreshIndicators();
      }, 500);
    });

    this.observer.observe(fileExplorer, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  /**
   * Handle layout changes without restarting observer every time.
   */
  handleLayoutChange(): void {
    const fileExplorer = document.querySelector('.nav-files-container');
    if (!fileExplorer) return;

    if (!this.observer || this.observedExplorer !== fileExplorer) {
      this.start();
      return;
    }

    this.scheduleRefresh();
  }

  /**
   * Refresh all badges.
   */
  private refreshIndicators(): void {
    const appearance = this.getAppearance();
    const position = appearance.position;
    const appearanceSignature = this.getAppearanceSignature(appearance);
    const fileItems = document.querySelectorAll('.nav-file-title');

    fileItems.forEach((titleEl) => {
      const dataPath = titleEl.getAttribute('data-path');
      if (!dataPath) return;

      const tags = this.collectTagsForPath(dataPath);
      const existingBadge = titleEl.querySelector('.lumina-tag-indicator') as HTMLElement | null;

      if (tags.length > 0) {
        const newTitle = tags.join(', ');
        const titleMatches = existingBadge?.title === newTitle;
        const appearanceMatches =
          existingBadge?.getAttribute('data-lumina-appearance') === appearanceSignature;
        const positionMatches = existingBadge
          ? existingBadge.classList.contains(
              position === 'right' ? 'lumina-tag-indicator-right' : 'lumina-tag-indicator-left'
            )
          : false;

        if (existingBadge && titleMatches && appearanceMatches && positionMatches) {
          return;
        }

        if (existingBadge) {
          existingBadge.title = newTitle;
          existingBadge.classList.toggle('lumina-tag-indicator-left', position === 'left');
          existingBadge.classList.toggle('lumina-tag-indicator-right', position === 'right');
          this.applyBadgeAppearance(existingBadge, appearance, appearanceSignature);
          this.placeBadge(titleEl, existingBadge, position);
          return;
        }

        const badge = document.createElement('span');
        badge.className = `lumina-tag-indicator lumina-tag-indicator-${position}`;
        badge.title = newTitle;
        this.applyBadgeAppearance(badge, appearance, appearanceSignature);
        this.placeBadge(titleEl, badge, position);
        return;
      }

      if (existingBadge) {
        existingBadge.remove();
      }
    });
  }

  /**
   * Update badge for one file.
   */
  updateIndicator(filePath: string): void {
    const titleEl = document.querySelector(`.nav-file-title[data-path="${CSS.escape(filePath)}"]`);
    if (!titleEl) return;

    const existingBadge = titleEl.querySelector('.lumina-tag-indicator') as HTMLElement | null;
    const tags = this.collectTagsForPath(filePath);

    if (tags.length === 0) {
      if (existingBadge) {
        existingBadge.remove();
      }
      return;
    }

    const appearance = this.getAppearance();
    const position = appearance.position;
    const appearanceSignature = this.getAppearanceSignature(appearance);
    const badge = existingBadge ?? document.createElement('span');
    badge.classList.add('lumina-tag-indicator');
    badge.classList.toggle('lumina-tag-indicator-left', position === 'left');
    badge.classList.toggle('lumina-tag-indicator-right', position === 'right');
    badge.title = tags.join(', ');
    this.applyBadgeAppearance(badge, appearance, appearanceSignature);
    this.placeBadge(titleEl, badge, position);
  }

  private placeBadge(titleEl: Element, badge: HTMLElement, position: 'left' | 'right'): void {
    if (position === 'right') {
      if (titleEl.lastChild !== badge) {
        titleEl.appendChild(badge);
      }
      return;
    }

    if (titleEl.firstChild !== badge) {
      titleEl.insertBefore(badge, titleEl.firstChild);
    }
  }

  private applyBadgeAppearance(
    badge: HTMLElement,
    appearance: TagIndicatorAppearance,
    appearanceSignature: string
  ): void {
    const color = this.getValidColor(appearance.color);
    const size = this.getValidSize(appearance.size);
    const iconName = this.getValidIcon(appearance.icon);

    badge.setAttribute('data-lumina-appearance', appearanceSignature);
    badge.style.color = color;
    badge.style.width = `${size}px`;
    badge.style.height = `${size}px`;
    badge.style.minWidth = `${size}px`;
    badge.style.minHeight = `${size}px`;
    badge.style.setProperty('--lumina-tag-indicator-size', `${size}px`);
    badge.classList.toggle(
      'lumina-tag-indicator-compensate-shift',
      appearance.position === 'left' && appearance.compensateShift
    );

    if (appearance.style === 'icon') {
      badge.style.backgroundColor = 'transparent';
      badge.style.borderRadius = '0';
      badge.style.boxShadow = 'none';
      try {
        setIcon(badge, iconName);
      } catch {
        setIcon(badge, 'tag');
      }
      const iconSvg = badge.querySelector('svg');
      if (iconSvg) {
        iconSvg.setAttribute('width', String(size));
        iconSvg.setAttribute('height', String(size));
        (iconSvg as SVGElement).style.stroke = color;
      }
      return;
    }

    if (badge.firstChild) {
      badge.replaceChildren();
    }
    badge.style.backgroundColor = color;
    badge.style.borderRadius = '50%';
    badge.style.boxShadow = `0 0 4px ${color}`;
  }

  private getAppearanceSignature(appearance: TagIndicatorAppearance): string {
    return [
      appearance.position,
      appearance.style,
      this.getValidColor(appearance.color),
      this.getValidSize(appearance.size),
      this.getValidIcon(appearance.icon),
      appearance.compensateShift ? '1' : '0',
    ].join('|');
  }

  private getValidColor(value: string): string {
    const color = value.trim();
    return color.length > 0 ? color : 'var(--interactive-accent)';
  }

  private getValidSize(value: number): number {
    if (!Number.isFinite(value)) return 8;
    return Math.max(6, Math.min(24, Math.round(value)));
  }

  private getValidIcon(value: string): string {
    const icon = value.trim();
    return icon.length > 0 ? icon : 'tag';
  }

  private collectTagsForPath(path: string): string[] {
    const combined = new Set<string>();
    this.tagManager.getTags(path).forEach((tag) => combined.add(tag));
    this.getVaultTags(path).forEach((tag) => combined.add(tag));
    return Array.from(combined);
  }

  private getVaultTags(path: string): string[] {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return [];

    const inlineTags = (cache.tags ?? [])
      .map((tag) => tag.tag?.replace(/^#/, ''))
      .filter((tag): tag is string => !!tag);

    const frontmatterTags = this.normalizeFrontmatterTags(cache.frontmatter?.tags);
    return Array.from(new Set([...inlineTags, ...frontmatterTags]));
  }

  private normalizeFrontmatterTags(tags: unknown): string[] {
    if (!tags) return [];

    if (Array.isArray(tags)) {
      const results: string[] = [];
      tags.forEach((tagValue) => {
        if (typeof tagValue === 'string') {
          tagValue
            .split(/[,]/)
            .map((tag) => tag.trim())
            .filter(Boolean)
            .forEach((tag) => results.push(tag));
        }
      });
      return results;
    }

    if (typeof tags === 'string') {
      return tags
        .split(/[,]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    return [];
  }

  private registerMetadataListeners(): void {
    const metadataCache = this.app.metadataCache as {
      on?: (name: string, callback: () => void) => void;
      off?: (name: string, callback: () => void) => void;
    };
    const vault = this.app.vault as {
      on?: (name: string, callback: () => void) => void;
      off?: (name: string, callback: () => void) => void;
    };

    const handleMetadataChange = () => this.scheduleRefresh();
    metadataCache?.on?.('changed', handleMetadataChange);
    metadataCache?.on?.('resolve', handleMetadataChange);
    metadataCache?.on?.('resolved', handleMetadataChange);
    this.detachFns.push(() => metadataCache?.off?.('changed', handleMetadataChange));
    this.detachFns.push(() => metadataCache?.off?.('resolve', handleMetadataChange));
    this.detachFns.push(() => metadataCache?.off?.('resolved', handleMetadataChange));

    const handleVaultUpdate = () => this.scheduleRefresh();
    vault?.on?.('rename', handleVaultUpdate);
    vault?.on?.('delete', handleVaultUpdate);
    vault?.on?.('create', handleVaultUpdate);
    this.detachFns.push(() => vault?.off?.('rename', handleVaultUpdate));
    this.detachFns.push(() => vault?.off?.('delete', handleVaultUpdate));
    this.detachFns.push(() => vault?.off?.('create', handleVaultUpdate));
  }
}
