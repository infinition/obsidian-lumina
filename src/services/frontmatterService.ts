/**
 * Service de gestion du frontmatter et des métadonnées des assets
 */

import { TFile, type Vault, type App, type CachedMetadata } from 'obsidian';
import { debugLog } from '../utils/debugLog';

export interface FrontmatterTags {
  hashtags: string[];
  links: string[];
}

export class FrontmatterService {
  constructor(private vault: Vault, private app?: App) {}

  /**
   * Met à jour le frontmatter d'une note pour ajouter/retirer un média
   */
  async updateFrontmatter(
    noteFile: TFile,
    mediaPath: string,
    add: boolean
  ): Promise<void> {
    const content = await this.vault.read(noteFile);
    const lines = content.split('\n');

    // Vérifier si le frontmatter existe
    const hasFrontmatter = lines[0] === '---';
    let frontmatterEnd = -1;

    if (hasFrontmatter) {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
          frontmatterEnd = i;
          break;
        }
      }
    }

    if (!hasFrontmatter || frontmatterEnd === -1) {
      // Créer le frontmatter
      if (add) {
        const newFrontmatter = ['---', 'lumina_media:', `  - "[[${mediaPath}]]"`, '---', ''];
        const newContent = newFrontmatter.join('\n') + content;
        await this.vault.modify(noteFile, newContent);
      }
      return;
    }

    // Parser le frontmatter existant
    const frontmatterLines = lines.slice(1, frontmatterEnd);
    let luminaMediaIndex = -1;
    let luminaMediaEnd = -1;

    for (let i = 0; i < frontmatterLines.length; i++) {
      if (frontmatterLines[i].trim().startsWith('lumina_media:')) {
        luminaMediaIndex = i;
        // Trouver la fin de la liste
        for (let j = i + 1; j < frontmatterLines.length; j++) {
          if (!frontmatterLines[j].startsWith('  ') && !frontmatterLines[j].startsWith('\t')) {
            luminaMediaEnd = j;
            break;
          }
        }
        if (luminaMediaEnd === -1) luminaMediaEnd = frontmatterLines.length;
        break;
      }
    }

    const mediaEntry = `  - "[[${mediaPath}]]"`;

    if (add) {
      if (luminaMediaIndex === -1) {
        // Ajouter le champ lumina_media
        frontmatterLines.push('lumina_media:');
        frontmatterLines.push(mediaEntry);
      } else {
        // Vérifier si le média existe déjà
        const mediaLines = frontmatterLines.slice(luminaMediaIndex + 1, luminaMediaEnd);
        const exists = mediaLines.some((line) => line.includes(`[[${mediaPath}]]`));
        if (!exists) {
          // Ajouter à la liste
          frontmatterLines.splice(luminaMediaEnd, 0, mediaEntry);
        }
      }
    } else {
      // Retirer le média
      if (luminaMediaIndex !== -1) {
        const mediaLines = frontmatterLines.slice(luminaMediaIndex + 1, luminaMediaEnd);
        const toRemove = mediaLines.findIndex((line) => line.includes(`[[${mediaPath}]]`));
        if (toRemove !== -1) {
          frontmatterLines.splice(luminaMediaIndex + 1 + toRemove, 1);

          // Si la liste est vide, retirer le champ
          if (frontmatterLines.slice(luminaMediaIndex + 1, luminaMediaEnd - 1).length === 0) {
            frontmatterLines.splice(luminaMediaIndex, 1);
          }
        }
      }
    }

    // Reconstruire le contenu
    const newLines = [
      '---',
      ...frontmatterLines,
      '---',
      ...lines.slice(frontmatterEnd + 1),
    ];
    const newContent = newLines.join('\n');
    await this.vault.modify(noteFile, newContent);
  }

  /**
   * Crée ou met à jour une note de métadonnées pour un asset
   */
  async updateAssetNote(
    mediaPath: string,
    tags: string[],
    linkedNotes: string[]
  ): Promise<void> {
    const metadataFolderPath = 'Assets/Metadata';
    const metadataFolder = this.vault.getAbstractFileByPath(metadataFolderPath);

    if (!metadataFolder) {
      // Créer le dossier s'il n'existe pas
      await this.vault.createFolder(metadataFolderPath).catch(() => {});
    }

    // Nom de fichier sécurisé basé sur le chemin
    const safeName = mediaPath
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 100);
    const notePath = `${metadataFolderPath}/${safeName}.md`;

    // Contenu de la note
    const frontmatter = [
      '---',
      'lumina_media_metadata: true',
      `media_path: "${mediaPath}"`,
      'tags:',
      ...tags.map((tag) => `  - ${tag}`),
      '---',
      '',
    ];

    const body = [
      `# ${mediaPath.split('/').pop()}`,
      '',
      `![[${mediaPath}]]`,
      '',
    ];

    if (linkedNotes.length > 0) {
      body.push('## Linked Notes', '');
      linkedNotes.forEach((note) => {
        body.push(`- [[${note}]]`);
      });
      body.push('');
    }

    const content = [...frontmatter, ...body].join('\n');

    // Vérifier si la note existe
    const existingFile = this.vault.getAbstractFileByPath(notePath);
    if (existingFile && existingFile instanceof TFile) {
      await this.vault.modify(existingFile as TFile, content);
    } else {
      await this.vault.create(notePath, content);
    }
  }

  /**
   * Parse les tags de type [[note]] pour créer des liens
   */
  extractNoteLinks(tags: string[]): string[] {
    return tags
      .filter((tag) => tag.startsWith('[[') && tag.endsWith(']]'))
      .map((tag) => tag.slice(2, -2));
  }

  async syncNoteProperties(path: string, tags: string[]): Promise<void> {
    debugLog('syncNoteProperties called:', { path, tags });

    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
      debugLog('syncNoteProperties: file not found or not .md');
      return;
    }

    const cleanTags = tags.map((tag) => tag.trim()).filter(Boolean);
    const hashtagSet = new Set<string>();
    const linkMap = new Map<string, string>(); // key = normalized, value = original format

    cleanTags.forEach((tag) => {
      if (tag.startsWith('[[') && tag.endsWith(']]')) {
        // Normaliser le lien pour éviter les doublons [[Note.md]] vs [[Note]]
        let linkContent = tag.slice(2, -2).trim();
        // Enlever .md si présent pour uniformiser
        if (linkContent.toLowerCase().endsWith('.md')) {
          linkContent = linkContent.slice(0, -3);
        }
        const normalizedKey = linkContent.toLowerCase();
        // Garder le format sans .md pour uniformité
        if (!linkMap.has(normalizedKey)) {
          linkMap.set(normalizedKey, `[[${linkContent}]]`);
        }
      } else {
        const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
        if (normalized) {
          hashtagSet.add(normalized);
        }
      }
    });

    const hashtagList = Array.from(hashtagSet);
    const linkList = Array.from(linkMap.values());

    const content = await this.vault.read(file);
    const { frontmatterLines, body, hasFrontmatter } = this.splitFrontmatter(content);
    const nextFrontmatter = [...frontmatterLines];

    this.removePropertyBlock(nextFrontmatter, 'tags');
    this.removePropertyBlock(nextFrontmatter, 'links');
    this.appendListBlock(nextFrontmatter, 'tags', hashtagList);
    this.appendListBlock(nextFrontmatter, 'links', linkList);

    if (!hasFrontmatter && nextFrontmatter.length === 0) {
      return;
    }

    let newContent: string;
    if (nextFrontmatter.length > 0) {
      const fmText = nextFrontmatter.join('\n').replace(/\s+$/, '');
      newContent = `---\n${fmText}\n---\n${hasFrontmatter ? body : content}`.replace(/\s+$/, '');
      newContent += '\n';
    } else {
      const bodyOnly = body.replace(/^\n+/, '');
      newContent = bodyOnly;
    }

    if (newContent !== content) {
      debugLog('syncNoteProperties: modifying file', path);
      await this.vault.modify(file, newContent);
    } else {
      debugLog('syncNoteProperties: no change needed for', path);
    }
  }

  private splitFrontmatter(content: string): { frontmatterLines: string[]; body: string; hasFrontmatter: boolean } {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') {
      return { frontmatterLines: [], body: content, hasFrontmatter: false };
    }

    const endIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
    if (endIndex === -1) {
      return { frontmatterLines: [], body: content, hasFrontmatter: false };
    }

    const frontmatterLines = lines.slice(1, endIndex);
    const bodyLines = lines.slice(endIndex + 1);
    return { frontmatterLines, body: bodyLines.join('\n'), hasFrontmatter: true };
  }

  private removePropertyBlock(lines: string[], key: string): void {
    let index = lines.findIndex((line) => line.replace(/^\s+/, '').startsWith(`${key}:`));
    if (index === -1) return;

    lines.splice(index, 1);
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        lines.splice(index, 1);
        continue;
      }
      if (/^\s{2,}-/.test(line)) {
        lines.splice(index, 1);
        continue;
      }
      break;
    }
    while (lines[index - 1]?.trim() === '') {
      lines.splice(index - 1, 1);
      index--;
      if (index <= 0) break;
    }
  }

  private appendListBlock(lines: string[], key: string, values: string[]): void {
    if (values.length === 0) return;
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(`${key}:`);
    values.forEach((value) => {
      // Échapper les valeurs qui contiennent des caractères spéciaux YAML
      if (value.includes('[') || value.includes(']') || value.includes(':') || value.includes('#')) {
        lines.push(`  - "${value}"`);
      } else {
        lines.push(`  - ${value}`);
      }
    });
  }

  /**
   * Lit les tags et links depuis le frontmatter d'un fichier markdown
   * pour synchronisation bidirectionnelle
   */
  readTagsFromFrontmatter(file: TFile): FrontmatterTags {
    const result: FrontmatterTags = { hashtags: [], links: [] };

    if (!this.app || file.extension.toLowerCase() !== 'md') {
      return result;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) {
      return result;
    }

    const fm = cache.frontmatter;

    // Lire les tags (format standard Obsidian ou personnalisé)
    if (fm.tags) {
      const tags = Array.isArray(fm.tags) ? fm.tags : [fm.tags];
      tags.forEach((tag: unknown) => {
        if (typeof tag === 'string' && tag.trim()) {
          // Normaliser : ajouter # si pas présent
          const normalized = tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`;
          result.hashtags.push(normalized);
        }
      });
    }

    // Lire les links personnalisés (format lumina)
    if (fm.links) {
      const links = Array.isArray(fm.links) ? fm.links : [fm.links];
      links.forEach((link: unknown) => {
        if (typeof link === 'string' && link.trim()) {
          // Normaliser : ajouter [[ ]] si pas présent
          let normalized = link.trim();
          if (!normalized.startsWith('[[')) {
            normalized = `[[${normalized}`;
          }
          if (!normalized.endsWith(']]')) {
            normalized = `${normalized}]]`;
          }
          result.links.push(normalized);
        }
      });
    }

    return result;
  }

  /**
   * Lit tous les tags d'un fichier et les retourne sous forme de liste combinée
   */
  getAllTagsFromFrontmatter(file: TFile): string[] {
    const { hashtags, links } = this.readTagsFromFrontmatter(file);
    return [...hashtags, ...links];
  }

  /**
   * Synchronise les backlinks bidirectionnels entre deux fichiers
   * Si fileA a [[fileB]] dans ses links, alors fileB doit avoir [[fileA]] dans ses links
   */
  async syncBidirectionalLinks(
    sourceFilePath: string,
    oldLinks: string[],
    newLinks: string[]
  ): Promise<void> {
    // Extraire le nom du fichier source (sans extension et sans chemin)
    const sourceFileName = sourceFilePath.replace(/\.md$/i, '').split('/').pop() || '';
    if (!sourceFileName) return;

    const sourceBacklink = `[[${sourceFileName}]]`;

    // Trouver les liens ajoutés et retirés
    const oldSet = new Set(oldLinks.map(l => this.normalizeLink(l)));
    const newSet = new Set(newLinks.map(l => this.normalizeLink(l)));

    const addedLinks = newLinks.filter(l => !oldSet.has(this.normalizeLink(l)));
    const removedLinks = oldLinks.filter(l => !newSet.has(this.normalizeLink(l)));

    debugLog('syncBidirectionalLinks:', { sourceFilePath, sourceBacklink, addedLinks, removedLinks });

    // Pour chaque lien ajouté, ajouter le backlink dans le fichier cible
    for (const link of addedLinks) {
      debugLog('Adding backlink to:', link);
      await this.addBacklinkToFile(link, sourceBacklink);
    }

    // Pour chaque lien retiré, retirer le backlink du fichier cible
    for (const link of removedLinks) {
      debugLog('Removing backlink from:', link);
      await this.removeBacklinkFromFile(link, sourceBacklink);
    }
  }

  /**
   * Normalise un lien pour comparaison (extrait le nom sans [[ ]] et sans .md)
   */
  private normalizeLink(link: string): string {
    let normalized = link.replace(/^\[\[/, '').replace(/\]\]$/, '').toLowerCase().trim();
    // Enlever l'extension .md si présente pour uniformiser la comparaison
    if (normalized.endsWith('.md')) {
      normalized = normalized.slice(0, -3);
    }
    return normalized;
  }

  /**
   * Ajoute un backlink au frontmatter d'un fichier cible
   */
  private async addBacklinkToFile(targetLink: string, backlink: string): Promise<void> {
    const targetName = this.normalizeLink(targetLink);
    const targetFile = this.findFileByName(targetName);

    debugLog('addBacklinkToFile:', { targetLink, targetName, backlink, targetFile: targetFile?.path });

    if (!targetFile || !(targetFile instanceof TFile)) {
      debugLog('Target file not found!');
      return;
    }

    // Lire les links actuels du fichier cible
    const currentTags = this.getAllTagsFromFrontmatter(targetFile);
    const currentLinks = currentTags.filter(t => t.startsWith('[[') && t.endsWith(']]'));

    // Vérifier si le backlink existe déjà
    const backlinkNormalized = this.normalizeLink(backlink);
    const exists = currentLinks.some(l => this.normalizeLink(l) === backlinkNormalized);

    debugLog('currentTags:', currentTags, 'exists:', exists);

    if (!exists) {
      // Ajouter le backlink
      const newTags = [...currentTags, backlink];
      debugLog('Syncing properties with newTags:', newTags);
      await this.syncNoteProperties(targetFile.path, newTags);
    }
  }

  /**
   * Retire un backlink du frontmatter d'un fichier cible
   */
  private async removeBacklinkFromFile(targetLink: string, backlink: string): Promise<void> {
    const targetName = this.normalizeLink(targetLink);
    const targetFile = this.findFileByName(targetName);

    if (!targetFile || !(targetFile instanceof TFile)) {
      return;
    }

    // Lire les links actuels du fichier cible
    const currentTags = this.getAllTagsFromFrontmatter(targetFile);
    const backlinkNormalized = this.normalizeLink(backlink);

    // Filtrer pour retirer le backlink
    const newTags = currentTags.filter(t => {
      if (t.startsWith('[[') && t.endsWith(']]')) {
        return this.normalizeLink(t) !== backlinkNormalized;
      }
      return true;
    });

    if (newTags.length !== currentTags.length) {
      await this.syncNoteProperties(targetFile.path, newTags);
    }
  }

  /**
   * Trouve un fichier par son nom (avec ou sans chemin, avec ou sans extension)
   */
  private findFileByName(name: string): TFile | null {
    if (!this.app) {
      debugLog('findFileByName: app is null!');
      return null;
    }

    // Nettoyer le nom : enlever le chemin si présent, garder seulement le basename
    let cleanName = name.includes('/') ? name.split('/').pop() || name : name;

    // Enlever l'extension .md si présente (car basename n'inclut pas l'extension)
    if (cleanName.toLowerCase().endsWith('.md')) {
      cleanName = cleanName.slice(0, -3);
    }

    const lowerName = cleanName.toLowerCase();

    const allFiles = this.app.vault.getMarkdownFiles();

    debugLog('findFileByName searching for:', lowerName, 'among', allFiles.length, 'files');

    // Chercher un fichier dont le basename correspond
    const found = allFiles.find(f => f.basename.toLowerCase() === lowerName);

    debugLog('findFileByName found:', found?.path || 'null');

    return found || null;
  }
}
