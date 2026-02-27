/**
 * Service pour ajouter un bouton de tags dans le header des fichiers non-.md
 */

import { App, Menu, TFile, WorkspaceLeaf } from 'obsidian';
import type { TagManager } from './tagManager';
import type { LocaleKey } from '../i18n/locales';

export class FileHeaderService {
  private observer: MutationObserver | null = null;
  private app: App;
  private tagManager: TagManager;
  private getLocale: () => LocaleKey;
  private onOpenTagModal: (filePath: string) => void;

  constructor(
    app: App,
    tagManager: TagManager,
    getLocale: () => LocaleKey,
    onOpenTagModal: (filePath: string) => void
  ) {
    this.app = app;
    this.tagManager = tagManager;
    this.getLocale = getLocale;
    this.onOpenTagModal = onOpenTagModal;
  }

  start(): void {
    this.stop();
    
    // Observer les changements de vue
    this.app.workspace.on('active-leaf-change', () => {
      setTimeout(() => this.addTagButtonToActiveLeaf(), 100);
    });

    // Ajouter immédiatement à la vue active
    setTimeout(() => this.addTagButtonToActiveLeaf(), 500);

    // Observer les changements DOM dans les headers
    this.startObserver();
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    // Retirer tous les boutons ajoutés
    document.querySelectorAll('.lumina-header-tag-btn').forEach(el => el.remove());
  }

  private startObserver(): void {
    this.observer = new MutationObserver(() => {
      this.addTagButtonToActiveLeaf();
    });

    const workspace = document.querySelector('.workspace');
    if (workspace) {
      this.observer.observe(workspace, {
        childList: true,
        subtree: true,
      });
    }
  }

  private addTagButtonToActiveLeaf(): void {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;

    const file = this.getFileFromLeaf(activeLeaf);
    if (!file) return;

    // Ne pas ajouter pour les fichiers .md (ils ont déjà le frontmatter)
    if (file.extension.toLowerCase() === 'md') return;

    // Chercher le header de la vue
    const leafEl = activeLeaf.view.containerEl;
    const headerEl = leafEl.querySelector('.view-header');
    if (!headerEl) return;

    const actionsEl = headerEl.querySelector('.view-actions');
    if (!actionsEl) return;

    // Vérifier si le bouton existe déjà
    if (actionsEl.querySelector('.lumina-header-tag-btn')) return;

    // Créer le bouton
    const btn = document.createElement('a');
    btn.className = 'clickable-icon view-action lumina-header-tag-btn';
    btn.setAttribute('aria-label', 'Manage tags (Lumina)');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;

    // Au clic, afficher un dropdown avec les tags
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showTagDropdown(file, btn);
    });

    // Insérer au début des actions
    actionsEl.insertBefore(btn, actionsEl.firstChild);
  }

  private getFileFromLeaf(leaf: WorkspaceLeaf): TFile | null {
    const viewState = leaf.getViewState();
    const filePath = viewState?.state?.file as string | undefined;
    if (!filePath || typeof filePath !== 'string') return null;
    
    const file = this.app.vault.getAbstractFileByPath(filePath);
    return file instanceof TFile ? file : null;
  }

  private showTagDropdown(file: TFile, buttonEl: HTMLElement): void {
    const tags = this.tagManager.getTags(file.path);
    const menu = new Menu();

    if (tags.length === 0) {
      menu.addItem(item => {
        item.setTitle('No tags');
        item.setDisabled(true);
      });
    } else {
      // Afficher les tags
      tags.forEach(tag => {
        menu.addItem(item => {
          item.setTitle(tag);
          item.onClick(() => {
            // Naviguer vers le fichier lié si c'est un lien [[...]]
            if (tag.startsWith('[[') && tag.endsWith(']]')) {
              const linkName = tag.slice(2, -2);
              const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkName, file.path);
              if (linkedFile) {
                this.app.workspace.openLinkText(linkedFile.path, file.path);
              }
            }
          });
        });
      });

      menu.addSeparator();
    }

    // Bouton pour gérer les tags
    menu.addItem(item => {
      item.setTitle('Manage tags...');
      item.setIcon('settings');
      item.onClick(() => {
        this.onOpenTagModal(file.path);
      });
    });

    const rect = buttonEl.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  }
}
