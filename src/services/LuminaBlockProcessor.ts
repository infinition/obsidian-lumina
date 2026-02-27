/**
 * Service pour traiter et afficher les blocs ```lumina``` dans les notes
 */

import { App, MarkdownPostProcessorContext, TFile, MarkdownView } from 'obsidian';
import type LuminaPlugin from '../main';
import type { TagManager } from './tagManager';
import { mountBlockEditor } from '../components/LuminaBlockEditor';
import type { Root } from 'react-dom/client';

interface LuminaBlockOptions {
  query: string;
  files: string[]; // Liste de fichiers spécifiques (sans tags)
  layout: 'masonry' | 'justified' | 'square' | 'grid' | 'inline';
  columns: number;
  showNames: boolean;
  showTags: boolean;
  maxItems: number;
  sortBy: 'date-desc' | 'date-asc' | 'name' | 'random';
  size: number; // Taille des images en px
  dateAfter?: string;
  dateBefore?: string;
  folder?: string;
  type?: 'photo' | 'video' | 'gif' | 'all';
  video: 'mixed' | 'separate'; // mixed = dans la galerie, separate = séparé en lecteur normal
  align: 'left' | 'center' | 'right'; // Alignement de la galerie
}

interface ParsedQuery {
  includes: Array<{ type: 'tag' | 'link'; value: string; operator: 'AND' | 'OR' }>;
  excludes: Array<{ type: 'tag' | 'link'; value: string }>;
}

export class LuminaBlockProcessor {
  private app: App;
  private plugin: LuminaPlugin;
  private tagManager: TagManager;

  constructor(app: App, plugin: LuminaPlugin, tagManager: TagManager) {
    this.app = app;
    this.plugin = plugin;
    this.tagManager = tagManager;
  }

  /**
   * Enregistre le processeur de bloc Markdown
   */
  register(): void {
    this.plugin.registerMarkdownCodeBlockProcessor('lumina', (source, el, ctx) => {
      this.processBlock(source, el, ctx);
    });
  }

  /**
   * Traite un bloc lumina et génère la galerie
   */
  private async processBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    // Parser les options du bloc
    const options = this.parseBlockOptions(source);
    
    // Parser la requête
    const query = this.parseQuery(options.query);
    
    // Trouver les fichiers correspondants
    const matchingFiles = await this.findMatchingFiles(query, options);
    
    // Créer le conteneur principal avec position relative pour le bouton
    el.empty();
    el.addClass('lumina-block-gallery');
    el.addClass('lumina-block-editable');
    
    // Ajouter le bouton d'édition (visible au survol)
    const editButton = el.createDiv({ cls: 'lumina-block-edit-btn' });
    editButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      <span>Edit</span>
    `;
    editButton.title = 'Edit Lumina block settings';
    
    // Container pour l'éditeur
    let editorContainer: HTMLElement | null = null;
    let editorRoot: Root | null = null;
    
    editButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Si l'éditeur est déjà ouvert, le fermer
      if (editorContainer) {
        editorRoot?.unmount();
        editorContainer.remove();
        editorContainer = null;
        editorRoot = null;
        return;
      }
      
      // Créer le container de l'éditeur
      editorContainer = document.createElement('div');
      editorContainer.className = 'lumina-block-editor-container';
      el.insertBefore(editorContainer, el.firstChild);
      
      // Fonction pour sauvegarder les modifications
      const handleSave = (newSource: string) => {
        this.updateBlockSource(ctx, source, newSource);
      };
      
      // Fonction pour fermer l'éditeur
      const handleClose = () => {
        editorRoot?.unmount();
        editorContainer?.remove();
        editorContainer = null;
        editorRoot = null;
      };
      
      // Monter l'éditeur React
      editorRoot = mountBlockEditor(
        editorContainer,
        options,
        handleSave,
        handleClose,
        this.app,
        this.tagManager,
        this.plugin.settings.locale
      );
    });
    
    if (matchingFiles.length === 0) {
      const emptyMsg = el.createDiv({ cls: 'lumina-block-empty' });
      emptyMsg.setText(`No images found for query: ${options.query}`);
      return;
    }

    // Trier les fichiers
    const sortedFiles = this.sortFiles(matchingFiles, options.sortBy);
    
    // Limiter le nombre d'items
    const limitedFiles = sortedFiles.slice(0, options.maxItems);

    // Séparer images et vidéos si option video: separate
    const videoExtensions = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv'];
    const isVideo = (file: TFile) => videoExtensions.includes(file.extension.toLowerCase());
    
    let imagesToDisplay = limitedFiles;
    let videosToDisplay: TFile[] = [];
    
    if (options.video === 'separate') {
      imagesToDisplay = limitedFiles.filter(f => !isVideo(f));
      videosToDisplay = limitedFiles.filter(f => isVideo(f));
    }

    // Afficher les images/gifs dans la galerie (sauf si layout inline)
    if (imagesToDisplay.length > 0) {
      if (options.layout === 'inline') {
        // Mode inline : un média par ligne, comme dans le markdown natif
        const inlineContainer = el.createDiv({ cls: `lumina-block-inline lumina-align-${options.align}` });
        for (const file of imagesToDisplay) {
          const item = this.createInlineItem(file, options);
          inlineContainer.appendChild(item);
        }
      } else {
        // Mode galerie classique
        const gallery = el.createDiv({ 
          cls: `lumina-block-container lumina-layout-${options.layout} lumina-align-${options.align}` 
        });
        
        // Appliquer les styles selon les options
        gallery.style.setProperty('--lumina-columns', String(options.columns));
        gallery.style.setProperty('--lumina-size', `${options.size}px`);

        for (const file of imagesToDisplay) {
          const item = this.createGalleryItem(file, options);
          gallery.appendChild(item);
        }
      }
    }

    // Afficher les vidéos séparément si option video: separate
    if (videosToDisplay.length > 0) {
      const videoSection = el.createDiv({ cls: 'lumina-block-videos-section' });
      
      for (const file of videosToDisplay) {
        const videoItem = this.createSeparateVideoItem(file, options);
        videoSection.appendChild(videoItem);
      }
    }
  }
  
  /**
   * Met à jour le contenu du bloc dans le fichier source
   */
  private async updateBlockSource(
    ctx: MarkdownPostProcessorContext,
    oldSource: string,
    newSource: string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    
    try {
      const content = await this.app.vault.read(file);
      
      // Trouver et remplacer le bloc lumina
      // Le format est ```lumina\n{source}\n```
      const blockRegex = /```lumina\n([\s\S]*?)```/g;
      let match;
      let newContent = content;
      
      while ((match = blockRegex.exec(content)) !== null) {
        const blockSource = match[1].trim();
        // Normaliser les deux sources pour la comparaison
        if (this.normalizeSource(blockSource) === this.normalizeSource(oldSource)) {
          const fullOldBlock = match[0];
          const fullNewBlock = '```lumina\n' + newSource + '\n```';
          newContent = newContent.replace(fullOldBlock, fullNewBlock);
          break;
        }
      }
      
      if (newContent !== content) {
        await this.app.vault.modify(file, newContent);
      }
    } catch (error) {
      console.error('Failed to update Lumina block:', error);
    }
  }
  
  /**
   * Normalise une source pour la comparaison
   */
  private normalizeSource(source: string): string {
    return source
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .sort()
      .join('\n');
  }

  /**
   * Crée un tag cliquable qui ouvre la recherche Lumina ou Obsidian
   * Si filePath est fourni, ajoute un bouton de suppression
   */
  private createClickableTag(tag: string, filePath?: string): HTMLElement {
    const tagSpan = document.createElement('span');
    tagSpan.className = 'lumina-block-tag lumina-block-tag-clickable';
    
    // Déterminer le type (hashtag ou lien)
    const isLink = tag.startsWith('[[') && tag.endsWith(']]');
    
    let displayText: string;
    if (isLink) {
      // Pour les liens [[folder/test]], extraire juste le nom final "test"
      const linkContent = tag.slice(2, -2); // Enlever [[ et ]]
      const lastSlashIndex = linkContent.lastIndexOf('/');
      displayText = `[[${lastSlashIndex >= 0 ? linkContent.slice(lastSlashIndex + 1) : linkContent}]]`;
    } else {
      displayText = tag.startsWith('#') ? tag : `#${tag}`;
    }
    
    // Créer le texte du tag
    const textSpan = document.createElement('span');
    textSpan.textContent = displayText;
    tagSpan.appendChild(textSpan);
    
    // Ajouter une classe différente pour les liens
    if (isLink) {
      tagSpan.classList.add('lumina-block-tag-link');
    } else {
      tagSpan.classList.add('lumina-block-tag-hashtag');
    }
    
    // Au clic sur le texte, ouvrir la recherche selon les paramètres
    textSpan.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isLink) {
        // Pour les liens [[...]], naviguer vers le fichier
        const linkTarget = tag.slice(2, -2);
        this.app.workspace.openLinkText(linkTarget, '', false);
      } else {
        // Pour les hashtags, utiliser le paramètre tagClickAction
        const action = this.plugin.settings.tagClickAction;
        const searchTag = tag.startsWith('#') ? tag : `#${tag}`;
        
        if (action === 'obsidian') {
          // Ouvrir la recherche globale Obsidian
          (this.app as any).internalPlugins?.plugins?.['global-search']?.instance?.openGlobalSearch?.(searchTag);
        } else {
          // Ouvrir Lumina avec le tag en recherche
          this.openLuminaWithSearch(searchTag);
        }
      }
    });
    
    // Ajouter le bouton de suppression si filePath est fourni
    if (filePath) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'lumina-block-tag-remove';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'Remove tag';
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.tagManager.removeTag(filePath, tag);
        // Le tag sera retiré automatiquement via les listeners du tagManager
        tagSpan.remove();
      });
      tagSpan.appendChild(removeBtn);
    }
    
    return tagSpan;
  }

  /**
   * Ouvre la vue Lumina avec un terme de recherche
   */
  private openLuminaWithSearch(searchTerm: string): void {
    // Trouver ou créer une vue Lumina
    const leaves = this.app.workspace.getLeavesOfType('lumina-view');
    
    if (leaves.length > 0) {
      // Utiliser une vue existante
      this.app.workspace.revealLeaf(leaves[0]);
      const view = leaves[0].view as any;
      if (view?.setSearchQuery) {
        view.setSearchQuery(searchTerm);
      }
    } else {
      // Créer une nouvelle vue
      const leaf = this.app.workspace.getLeaf(false);
      leaf.setViewState({ type: 'lumina-view', active: true }).then(() => {
        this.app.workspace.revealLeaf(leaf);
        setTimeout(() => {
          const view = leaf.view as any;
          if (view?.setSearchQuery) {
            view.setSearchQuery(searchTerm);
          }
        }, 100);
      });
    }
  }

  /**
   * Crée un élément en mode inline (un par ligne, style markdown natif)
   */
  private createInlineItem(file: TFile, options: LuminaBlockOptions): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lumina-block-inline-item';
    
    const resourcePath = this.app.vault.getResourcePath(file);
    const videoExtensions = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv'];
    const isVideo = videoExtensions.includes(file.extension.toLowerCase());
    
    if (isVideo) {
      const video = document.createElement('video');
      video.src = resourcePath;
      video.controls = true;
      video.className = 'lumina-block-inline-video';
      video.preload = 'metadata';
      container.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = resourcePath;
      img.alt = file.basename;
      img.className = 'lumina-block-inline-image';
      img.loading = 'lazy';
      
      // Clic pour preview ou ouvrir selon les paramètres
      img.addEventListener('click', () => {
        const action = this.plugin.settings.blockImageClickAction;
        if (action === 'open') {
          this.app.workspace.openLinkText(file.path, '', false);
        } else {
          this.openPreview(file);
        }
      });
      
      container.appendChild(img);
    }
    
    // Afficher le nom si demandé
    if (options.showNames) {
      const name = document.createElement('div');
      name.className = 'lumina-block-inline-name';
      name.textContent = file.basename;
      container.appendChild(name);
    }
    
    // Afficher les tags si demandé
    if (options.showTags) {
      const tags = this.tagManager.getTags(file.path);
      if (tags.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'lumina-block-inline-tags';
        tags.forEach(tag => {
          const tagEl = this.createClickableTag(tag, file.path);
          tagsContainer.appendChild(tagEl);
        });
        container.appendChild(tagsContainer);
      }
    }
    
    return container;
  }

  /**
   * Crée un élément vidéo séparé (lecteur normal avec contrôles)
   */
  private createSeparateVideoItem(file: TFile, options: LuminaBlockOptions): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lumina-block-video-item';
    
    const resourcePath = this.app.vault.getResourcePath(file);
    
    const video = document.createElement('video');
    video.src = resourcePath;
    video.controls = true;
    video.className = 'lumina-block-video-player';
    video.preload = 'metadata';
    container.appendChild(video);
    
    // Afficher le nom si demandé
    if (options.showNames) {
      const name = document.createElement('div');
      name.className = 'lumina-block-video-name';
      name.textContent = file.basename;
      container.appendChild(name);
    }
    
    // Afficher les tags si demandé
    if (options.showTags) {
      const tags = this.tagManager.getTags(file.path);
      if (tags.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'lumina-block-video-tags';
        tags.forEach(tag => {
          const tagEl = this.createClickableTag(tag, file.path);
          tagsContainer.appendChild(tagEl);
        });
        container.appendChild(tagsContainer);
      }
    }
    
    return container;
  }

  /**
   * Parse les options du bloc
   */
  private parseBlockOptions(source: string): LuminaBlockOptions {
    const lines = source.trim().split('\n');
    
    const options: LuminaBlockOptions = {
      query: '',
      files: [],
      layout: 'justified',
      columns: 4,
      showNames: false,
      showTags: false,
      maxItems: 100,
      sortBy: 'date-desc',
      size: 200,
      type: 'all',
      video: 'mixed',
      align: 'left',
    };

    // La première ligne (ou lignes sans :) = requête
    const queryLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Vérifier si c'est une option (contient : mais pas au début d'un lien [[]])
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0 && !trimmed.startsWith('[[') && !trimmed.includes('[[')) {
        const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
        const value = trimmed.substring(colonIndex + 1).trim();
        
        switch (key) {
          case 'layout':
            if (['masonry', 'justified', 'square', 'grid', 'inline'].includes(value)) {
              options.layout = value as LuminaBlockOptions['layout'];
            }
            break;
          case 'columns':
            const cols = parseInt(value, 10);
            if (cols >= 1 && cols <= 10) options.columns = cols;
            break;
          case 'shownames':
            options.showNames = value === 'true';
            break;
          case 'showtags':
            options.showTags = value === 'true';
            break;
          case 'maxitems':
            const max = parseInt(value, 10);
            if (max > 0) options.maxItems = max;
            break;
          case 'sortby':
            if (['date-desc', 'date-asc', 'name', 'random'].includes(value)) {
              options.sortBy = value as LuminaBlockOptions['sortBy'];
            }
            break;
          case 'size':
            const size = parseInt(value, 10);
            if (size >= 50 && size <= 1000) options.size = size;
            break;
          case 'date':
            // Parse date: after:YYYY-MM-DD, before:YYYY-MM-DD
            if (value.startsWith('after:')) {
              options.dateAfter = value.substring(6).trim();
            } else if (value.startsWith('before:')) {
              options.dateBefore = value.substring(7).trim();
            }
            break;
          case 'folder':
            options.folder = value.replace(/^["']|["']$/g, '');
            break;
          case 'type':
            if (['photo', 'video', 'gif', 'all'].includes(value)) {
              options.type = value as LuminaBlockOptions['type'];
            }
            break;
          case 'video':
            if (['mixed', 'separate'].includes(value)) {
              options.video = value as LuminaBlockOptions['video'];
            }
            break;
          case 'align':
            if (['left', 'center', 'right'].includes(value)) {
              options.align = value as LuminaBlockOptions['align'];
            }
            break;
          case 'files':
            // Parse liste de fichiers séparés par des virgules
            options.files = value
              .split(',')
              .map(f => f.trim())
              .filter(f => f.length > 0);
            break;
        }
      } else {
        // C'est une partie de la requête
        queryLines.push(trimmed);
      }
    }
    
    options.query = queryLines.join(' ');
    return options;
  }

  /**
   * Parse la requête de recherche
   */
  private parseQuery(queryStr: string): ParsedQuery {
    const result: ParsedQuery = {
      includes: [],
      excludes: [],
    };

    if (!queryStr.trim()) return result;

    // Extraire les NOT d'abord
    const notPattern = /NOT\s+(#[\w-]+|\[\[[^\]]+\]\])/gi;
    let notMatch;
    while ((notMatch = notPattern.exec(queryStr)) !== null) {
      const value = notMatch[1];
      const type = value.startsWith('#') ? 'tag' : 'link';
      result.excludes.push({ type, value });
    }

    // Retirer les NOT de la query
    let cleanQuery = queryStr.replace(notPattern, '').trim();

    // Gérer les parenthèses de façon simplifiée (on les ignore pour l'instant)
    cleanQuery = cleanQuery.replace(/[()]/g, ' ');

    // Parser les termes avec AND/OR
    // On split par OR d'abord, puis par AND
    const orGroups = cleanQuery.split(/\s+OR\s+/i);
    
    for (const orGroup of orGroups) {
      const andTerms = orGroup.split(/\s+AND\s+/i);
      
      for (let i = 0; i < andTerms.length; i++) {
        const term = andTerms[i].trim();
        if (!term) continue;

        // Extraire les tags et links
        const tagMatches = term.match(/#[\w-]+/g) || [];
        const linkMatches = term.match(/\[\[[^\]]+\]\]/g) || [];

        for (const tag of tagMatches) {
          result.includes.push({
            type: 'tag',
            value: tag,
            operator: i === 0 && result.includes.length > 0 ? 'OR' : 'AND',
          });
        }

        for (const link of linkMatches) {
          result.includes.push({
            type: 'link',
            value: link,
            operator: i === 0 && result.includes.length > 0 ? 'OR' : 'AND',
          });
        }
      }
    }

    return result;
  }

  /**
   * Trouve les fichiers correspondant à la requête
   */
  private async findMatchingFiles(
    query: ParsedQuery, 
    options: LuminaBlockOptions
  ): Promise<TFile[]> {
    const allFiles = this.app.vault.getFiles();
    const mediaFiles = allFiles.filter(f => this.isMediaFile(f, options.type || 'all'));
    
    const results: TFile[] = [];
    const addedPaths = new Set<string>();

    // D'abord, ajouter les fichiers spécifiques (standalone) si définis
    if (options.files && options.files.length > 0) {
      for (const fileName of options.files) {
        // Chercher le fichier par nom (avec ou sans chemin)
        const matchingFile = allFiles.find(f => {
          // Correspondance exacte du chemin
          if (f.path === fileName) return true;
          // Correspondance du nom de fichier seulement
          if (f.name === fileName) return true;
          // Correspondance du basename (sans extension)
          if (f.basename === fileName) return true;
          // Correspondance partielle du chemin (se termine par le nom)
          if (f.path.endsWith('/' + fileName) || f.path.endsWith('\\' + fileName)) return true;
          return false;
        });
        
        if (matchingFile && !addedPaths.has(matchingFile.path)) {
          results.push(matchingFile);
          addedPaths.add(matchingFile.path);
        }
      }
    }

    // Si pas de query et des fichiers spécifiques, retourner seulement ces fichiers
    if (query.includes.length === 0 && query.excludes.length === 0 && options.files && options.files.length > 0) {
      return results;
    }

    for (const file of mediaFiles) {
      // Skip si déjà ajouté via files
      if (addedPaths.has(file.path)) continue;

      // Vérifier le filtre de dossier
      if (options.folder && !file.path.startsWith(options.folder)) {
        continue;
      }

      // Vérifier le filtre de date
      if (options.dateAfter || options.dateBefore) {
        const stat = await this.app.vault.adapter.stat(file.path);
        if (stat) {
          const fileDate = new Date(stat.mtime);
          if (options.dateAfter && fileDate < new Date(options.dateAfter)) continue;
          if (options.dateBefore && fileDate > new Date(options.dateBefore)) continue;
        }
      }

      // Obtenir les tags du fichier
      const fileTags = this.tagManager.getTags(file.path);
      
      // Vérifier les exclusions
      let excluded = false;
      for (const exclude of query.excludes) {
        if (this.fileHasTag(fileTags, exclude.value)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      // Vérifier les inclusions
      if (query.includes.length === 0) {
        // Pas de filtre = tous les fichiers média
        results.push(file);
        continue;
      }

      // Logique AND/OR
      let matches = false;
      let currentGroupMatches = true;

      for (let i = 0; i < query.includes.length; i++) {
        const inc = query.includes[i];
        const hasTag = this.fileHasTag(fileTags, inc.value);

        if (i === 0) {
          currentGroupMatches = hasTag;
        } else if (inc.operator === 'OR') {
          // OR = on évalue le groupe précédent, puis on recommence
          if (currentGroupMatches) {
            matches = true;
            break;
          }
          currentGroupMatches = hasTag;
        } else {
          // AND = le groupe doit toujours être vrai
          currentGroupMatches = currentGroupMatches && hasTag;
        }
      }

      if (currentGroupMatches || matches) {
        results.push(file);
      }
    }

    return results;
  }

  /**
   * Vérifie si un fichier a un tag/link
   */
  private fileHasTag(fileTags: string[], searchValue: string): boolean {
    const searchLower = searchValue.toLowerCase();
    
    return fileTags.some(tag => {
      const tagLower = tag.toLowerCase();
      
      // Correspondance exacte
      if (tagLower === searchLower) return true;
      
      // Pour les hashtags, comparer sans le #
      if (searchValue.startsWith('#')) {
        const searchWithout = searchValue.substring(1).toLowerCase();
        if (tagLower === searchWithout || tagLower === `#${searchWithout}`) return true;
      }
      
      return false;
    });
  }

  /**
   * Vérifie si un fichier est un média du type souhaité
   */
  private isMediaFile(file: TFile, type: string): boolean {
    const ext = file.extension.toLowerCase();
    
    const photoExts = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'avif'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const gifExts = ['gif'];

    switch (type) {
      case 'photo':
        return photoExts.includes(ext);
      case 'video':
        return videoExts.includes(ext);
      case 'gif':
        return gifExts.includes(ext);
      case 'all':
      default:
        return [...photoExts, ...videoExts, ...gifExts].includes(ext);
    }
  }

  /**
   * Trie les fichiers
   */
  private sortFiles(files: TFile[], sortBy: string): TFile[] {
    const sorted = [...files];
    
    switch (sortBy) {
      case 'date-desc':
        sorted.sort((a, b) => b.stat.mtime - a.stat.mtime);
        break;
      case 'date-asc':
        sorted.sort((a, b) => a.stat.mtime - b.stat.mtime);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'random':
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
        }
        break;
    }
    
    return sorted;
  }

  /**
   * Crée un élément de galerie pour un fichier
   */
  private createGalleryItem(file: TFile, options: LuminaBlockOptions): HTMLElement {
    const item = document.createElement('div');
    item.className = 'lumina-block-item';
    
    const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(file.extension.toLowerCase());
    
    if (isVideo) {
      const video = document.createElement('video');
      video.src = this.app.vault.getResourcePath(file);
      video.controls = true;
      video.preload = 'metadata';
      video.className = 'lumina-block-media';
      item.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = this.app.vault.getResourcePath(file);
      img.alt = file.basename;
      img.className = 'lumina-block-media';
      img.loading = 'lazy';
      
      // Clic sur l'image - selon les paramètres
      img.addEventListener('click', () => {
        const action = this.plugin.settings.blockImageClickAction;
        if (action === 'open') {
          // Ouvrir le fichier dans une nouvelle fenêtre
          this.app.workspace.openLinkText(file.path, '', false);
        } else {
          // Aperçu plein écran - créer un overlay
          this.openPreview(file);
        }
      });
      
      item.appendChild(img);
    }

    // Afficher le nom si demandé
    if (options.showNames) {
      const nameEl = document.createElement('div');
      nameEl.className = 'lumina-block-name';
      nameEl.textContent = file.basename;
      item.appendChild(nameEl);
    }

    // Afficher les tags si demandé
    if (options.showTags) {
      const tags = this.tagManager.getTags(file.path);
      if (tags.length > 0) {
        const tagsEl = document.createElement('div');
        tagsEl.className = 'lumina-block-tags';
        tags.forEach(tag => {
          const tagSpan = this.createClickableTag(tag, file.path);
          tagsEl.appendChild(tagSpan);
        });
        item.appendChild(tagsEl);
      }
    }

    return item;
  }

  /**
   * Ouvre un aperçu plein écran de l'image
   */
  private openPreview(file: TFile): void {
    const overlay = document.createElement('div');
    overlay.className = 'lumina-block-preview-overlay';
    
    const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(file.extension.toLowerCase());
    
    if (isVideo) {
      const video = document.createElement('video');
      video.src = this.app.vault.getResourcePath(file);
      video.controls = true;
      video.autoplay = true;
      video.className = 'lumina-block-preview-media';
      overlay.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = this.app.vault.getResourcePath(file);
      img.alt = file.basename;
      img.className = 'lumina-block-preview-media';
      overlay.appendChild(img);
    }

    // Fermer au clic
    overlay.addEventListener('click', () => {
      overlay.remove();
    });

    // Fermer avec Escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(overlay);
  }
}
