import React, { useState, useEffect, useMemo } from 'react';
import { Modal, TFile } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { TagInput, TagList } from './TagComponents';
import { t, type LocaleKey } from '../i18n/locales';
import type { TagManager } from '../services/tagManager';

// ========================================
// TAG MANAGER MODAL (single file)
// ========================================

interface TagManagerContentProps {
  filePath: string;
  fileName: string;
  tagManager: TagManager;
  locale: LocaleKey;
  onClose: () => void;
  fromLightbox?: boolean;
  app: any;
}

const TagManagerContent: React.FC<TagManagerContentProps> = ({
  filePath,
  fileName,
  tagManager,
  locale,
  onClose,
  fromLightbox,
  app,
}) => {
  const [tags, setTags] = useState<string[]>(tagManager.getTags(filePath));
  const [, forceUpdate] = useState(0);

  // Récupérer tous les hashtags du vault et de Lumina
  const allHashTags = useMemo(() => {
    const tagSet = new Set<string>();
    // Tags de Lumina
    tagManager.getAllTags().forEach((tag) => {
      const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
      if (normalized && !normalized.startsWith('[[')) {
        tagSet.add(normalized);
      }
    });
    // Tags du vault via metadataCache
    const metadataCache = app?.metadataCache;
    const metaTags = metadataCache?.getTags?.();
    if (metaTags) {
      Object.keys(metaTags).forEach((tag) => {
        const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
        if (normalized) {
          tagSet.add(normalized);
        }
      });
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [tagManager, app]);

  // Récupérer TOUS les fichiers du vault (pas seulement les .md)
  const allNoteLinks = useMemo(() => {
    const fileSet = new Set<string>();
    const files = app?.vault?.getFiles?.() ?? [];
    files.forEach((file: TFile) => {
      // Exclure le fichier courant
      if (file.path === filePath) return;
      // Utiliser le nom complet avec extension pour les non-.md
      const name = file.name || file.path?.split('/').pop() || '';
      if (name) fileSet.add(name);
    });
    return Array.from(fileSet).sort((a, b) => a.localeCompare(b));
  }, [app, filePath]);

  // Écouter les changements du TagManager
  useEffect(() => {
    const listener = () => {
      setTags(tagManager.getTags(filePath));
      forceUpdate(v => v + 1);
    };
    tagManager.addListener(listener);
    return () => tagManager.removeListener(listener);
  }, [tagManager, filePath]);

  const handleAddTag = (tag: string) => {
    tagManager.addTag(filePath, tag);
  };

  const handleRemoveTag = (tag: string) => {
    tagManager.removeTag(filePath, tag);
  };

  // Tags rapides à ajouter (les plus utilisés non présents)
  const quickAddTags = useMemo(() => {
    const existing = new Set(tags.map(t => t.toLowerCase()));
    return allHashTags
      .filter(tag => !existing.has(tag.toLowerCase()) && !existing.has(`#${tag.toLowerCase()}`))
      .slice(0, 15);
  }, [allHashTags, tags]);

  return (
    <div className="lumina-tag-manager">
      <div className="lumina-tag-manager-header">
        <div className="lumina-tag-manager-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
          <h2>{t(locale, 'manageTags')}</h2>
        </div>
        <p className="lumina-tag-manager-filename" title={filePath}>{fileName}</p>
      </div>

      <div className="lumina-tag-manager-body">
        <div className="lumina-tag-section">
          <div className="lumina-tag-section-header">
            <h3>{t(locale, 'tags')}</h3>
            <span className="lumina-tag-count">{tags.length}</span>
          </div>
          {tags.length > 0 ? (
            <div className="lumina-tag-list-container">
              <TagList
                tags={tags}
                maxVisible={100}
                onRemove={handleRemoveTag}
                showCount={false}
              />
            </div>
          ) : (
            <p className="lumina-no-tags">{t(locale, 'noTags')}</p>
          )}
        </div>

        <div className="lumina-tag-section lumina-tag-section-input">
          <h3>{t(locale, 'addTag')}</h3>
          <p className="lumina-tag-hint">Tapez # pour les tags, [[ pour les liens vers des notes</p>
          <TagInput
            existingTags={tags}
            allTags={allHashTags}
            allNoteLinks={allNoteLinks}
            onAdd={handleAddTag}
            locale={locale}
          />
        </div>

        {quickAddTags.length > 0 && (
          <div className="lumina-tag-section">
            <h3>{t(locale, 'availableTags')}</h3>
            <div className="lumina-tag-quick-add">
              {quickAddTags.map((tag) => (
                <button
                  key={tag}
                  className="lumina-tag-quick-button"
                  onClick={() => handleAddTag(`#${tag}`)}
                  title={t(locale, 'clickToAdd')}
                >
                  + #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lumina-tag-manager-footer">
        <button className="lumina-btn-close" onClick={onClose}>{t(locale, 'cancel')}</button>
      </div>
    </div>
  );
};

export class TagManagerModal extends Modal {
  private root: Root | null = null;
  private filePath: string;
  private fileName: string;
  private tagManager: TagManager;
  private locale: LocaleKey;
  private fromLightbox: boolean;

  constructor(
    app: any,
    filePath: string,
    fileName: string,
    tagManager: TagManager,
    locale: LocaleKey,
    fromLightbox = false
  ) {
    super(app);
    this.filePath = filePath;
    this.fileName = fileName;
    this.tagManager = tagManager;
    this.locale = locale;
    this.fromLightbox = fromLightbox;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass('lumina-tag-manager-modal');
    // Add class to parent modal element to control overflow
    modalEl.addClass('lumina-modal-no-overflow');

    const container = contentEl.createDiv({ cls: 'lumina-tag-manager-container' });
    this.root = createRoot(container);
    this.root.render(
      React.createElement(TagManagerContent, {
        filePath: this.filePath,
        fileName: this.fileName,
        tagManager: this.tagManager,
        locale: this.locale,
        onClose: () => this.close(),
        fromLightbox: this.fromLightbox,
        app: this.app,
      })
    );
  }

  onClose() {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}

// ========================================
// BATCH TAG MANAGER MODAL (multiple files)
// ========================================

interface BatchTagContentProps {
  filePaths: string[];
  tagManager: TagManager;
  locale: LocaleKey;
  onClose: () => void;
  app: any;
}

const BatchTagContent: React.FC<BatchTagContentProps> = ({
  filePaths,
  tagManager,
  locale,
  onClose,
  app,
}) => {
  const [version, setVersion] = useState(0);
  
  // Recalculer les tags communs quand version change
  const commonTags = useMemo(() => {
    return tagManager.getCommonTags(filePaths);
  }, [tagManager, filePaths, version]);

  // Écouter les changements du TagManager pour actualiser l'affichage
  useEffect(() => {
    const listener = () => setVersion(v => v + 1);
    tagManager.addListener(listener);
    return () => tagManager.removeListener(listener);
  }, [tagManager]);

  // Récupérer tous les hashtags du vault et de Lumina
  const allHashTags = useMemo(() => {
    const tagSet = new Set<string>();
    tagManager.getAllTags().forEach((tag) => {
      const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
      if (normalized && !normalized.startsWith('[[')) {
        tagSet.add(normalized);
      }
    });
    const metadataCache = app?.metadataCache;
    const metaTags = metadataCache?.getTags?.();
    if (metaTags) {
      Object.keys(metaTags).forEach((tag) => {
        const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
        if (normalized) {
          tagSet.add(normalized);
        }
      });
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [tagManager, app, version]);

  // Récupérer tous les fichiers du vault (pas seulement .md)
  const allNoteLinks = useMemo(() => {
    const noteSet = new Set<string>();
    const files = app?.vault?.getFiles?.() ?? [];
    files.forEach((file: TFile) => {
      // Utiliser le nom complet avec extension pour tous les fichiers
      const fullName = file.name || file.path?.split('/').pop();
      if (fullName) noteSet.add(fullName);
    });
    return Array.from(noteSet).sort((a, b) => a.localeCompare(b));
  }, [app]);

  const forceUpdate = () => setVersion((v) => v + 1);

  const handleAddToAll = (tag: string) => {
    filePaths.forEach((path) => tagManager.addTag(path, tag));
    forceUpdate();
  };

  const handleRemoveFromAll = (tag: string) => {
    filePaths.forEach((path) => tagManager.removeTag(path, tag));
    forceUpdate();
  };

  return (
    <div className="lumina-batch-tag-manager">
      <div className="lumina-tag-manager-header">
        <div className="lumina-tag-manager-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
          <h2>{t(locale, 'manageTags')}</h2>
        </div>
        <p className="lumina-tag-manager-filename">
          {filePaths.length} {t(locale, 'selected')}
        </p>
      </div>

      <div className="lumina-tag-manager-body">
        <div className="lumina-tag-section">
          <div className="lumina-tag-section-header">
            <h3>{t(locale, 'commonTags')}</h3>
            <span className="lumina-tag-count">{commonTags.length}</span>
          </div>
          {commonTags.length > 0 ? (
            <div className="lumina-tag-list-container">
              <TagList
                tags={commonTags}
                maxVisible={100}
                onRemove={handleRemoveFromAll}
                showCount={false}
              />
            </div>
          ) : (
            <p className="lumina-no-tags">{t(locale, 'noTags')}</p>
          )}
        </div>

        <div className="lumina-tag-section lumina-tag-section-input">
          <h3>{t(locale, 'addToAll')}</h3>
          <p className="lumina-tag-hint">Tapez # pour les tags, [[ pour les liens vers des notes</p>
          <TagInput
            existingTags={commonTags}
            allTags={allHashTags}
            allNoteLinks={allNoteLinks}
            onAdd={handleAddToAll}
            locale={locale}
          />
        </div>

        <div className="lumina-tag-section">
          <h3>{t(locale, 'tags')} par fichier</h3>
          <div className="lumina-file-tag-list">
            {filePaths.map((path) => {
              const fileName = path.split('/').pop() || path;
              const tags = tagManager.getTags(path);
              return (
                <div key={path} className="lumina-file-tag-item">
                  <div className="lumina-file-tag-name">{fileName}</div>
                  <TagList
                    tags={tags}
                    maxVisible={5}
                    showCount={true}
                    onRemove={(tag) => tagManager.removeTag(path, tag)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lumina-tag-manager-footer">
        <button className="lumina-btn-close" onClick={onClose}>{t(locale, 'cancel')}</button>
      </div>
    </div>
  );
};

export class BatchTagModal extends Modal {
  private root: Root | null = null;
  private filePaths: string[];
  private tagManager: TagManager;
  private locale: LocaleKey;

  constructor(
    app: any,
    filePaths: string[],
    tagManager: TagManager,
    locale: LocaleKey
  ) {
    super(app);
    this.filePaths = filePaths;
    this.tagManager = tagManager;
    this.locale = locale;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass('lumina-batch-tag-modal');
    // Add class to parent modal element to control overflow
    modalEl.addClass('lumina-modal-no-overflow');

    const container = contentEl.createDiv({ cls: 'lumina-tag-manager-container' });
    this.root = createRoot(container);
    this.root.render(
      React.createElement(BatchTagContent, {
        filePaths: this.filePaths,
        tagManager: this.tagManager,
        locale: this.locale,
        onClose: () => this.close(),
        app: this.app,
      })
    );
  }

  onClose() {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}
