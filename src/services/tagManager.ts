/**
 * Service de gestion centralisée des tags pour tous les fichiers
 * Optimized with caching for getAllTags and inverted index for tag lookups
 */

export type TagMap = Record<string, string[]>;
export type TagMapListener = (map: TagMap) => void;
export type TagChangeListener = (path: string, tags: string[], oldTags: string[]) => void;

export class TagManager {
  private tagMap: TagMap = {};
  private listeners: Set<TagMapListener> = new Set();
  private changeListeners: Set<TagChangeListener> = new Set();
  private version = 0;

  // Caches - invalidated on any mutation
  private _allTagsCache: string[] | null = null;
  private _tagToFilesCache: Map<string, Set<string>> | null = null;

  constructor(initialData?: TagMap) {
    if (initialData) {
      this.tagMap = { ...initialData };
    }
  }

  /**
   * Invalidate all caches (called on any mutation)
   */
  private invalidateCaches(): void {
    this._allTagsCache = null;
    this._tagToFilesCache = null;
  }

  /**
   * Build the inverted index (tag -> files) on demand
   */
  private getTagToFilesIndex(): Map<string, Set<string>> {
    if (!this._tagToFilesCache) {
      this._tagToFilesCache = new Map();
      for (const [path, tags] of Object.entries(this.tagMap)) {
        for (const tag of tags) {
          let files = this._tagToFilesCache.get(tag);
          if (!files) {
            files = new Set();
            this._tagToFilesCache.set(tag, files);
          }
          files.add(path);
        }
      }
    }
    return this._tagToFilesCache;
  }

  /**
   * Obtenir tous les tags d'un fichier
   */
  getTags(path: string): string[] {
    return this.tagMap[path] || [];
  }

  /**
   * Obtenir tous les tags uniques du système (cached)
   */
  getAllTags(): string[] {
    if (!this._allTagsCache) {
      const allTags = new Set<string>();
      for (const tags of Object.values(this.tagMap)) {
        for (const tag of tags) {
          allTags.add(tag);
        }
      }
      this._allTagsCache = Array.from(allTags).sort((a, b) => a.localeCompare(b));
    }
    return this._allTagsCache;
  }

  /**
   * Obtenir tous les chemins de fichiers qui ont des tags
   */
  getAllTaggedPaths(): string[] {
    return Object.keys(this.tagMap);
  }

  /**
   * Ajouter un tag à un fichier
   */
  addTag(path: string, tag: string): void {
    if (!tag.trim()) return;
    const normalizedTag = tag.trim();
    const oldTags = [...(this.tagMap[path] || [])];
    if (!this.tagMap[path]) {
      this.tagMap[path] = [];
    }
    if (!this.tagMap[path].includes(normalizedTag)) {
      this.tagMap[path].push(normalizedTag);
      this.invalidateCaches();
      this.notifyListeners(path, oldTags);
    }
  }

  /**
   * Ajouter plusieurs tags à un fichier
   */
  addTags(path: string, tags: string[]): void {
    const oldTags = [...(this.tagMap[path] || [])];
    let changed = false;
    tags.forEach((tag) => {
      if (!tag.trim()) return;
      const normalizedTag = tag.trim();
      if (!this.tagMap[path]) {
        this.tagMap[path] = [];
      }
      if (!this.tagMap[path].includes(normalizedTag)) {
        this.tagMap[path].push(normalizedTag);
        changed = true;
      }
    });
    if (changed) {
      this.invalidateCaches();
      this.notifyListeners(path, oldTags);
    }
  }

  /**
   * Retirer un tag d'un fichier
   */
  removeTag(path: string, tag: string): void {
    if (!this.tagMap[path]) return;
    const oldTags = [...this.tagMap[path]];
    const index = this.tagMap[path].indexOf(tag);
    if (index !== -1) {
      this.tagMap[path].splice(index, 1);
      if (this.tagMap[path].length === 0) {
        delete this.tagMap[path];
      }
      this.invalidateCaches();
      this.notifyListeners(path, oldTags);
    }
  }

  /**
   * Retirer plusieurs tags d'un fichier
   */
  removeTags(path: string, tags: string[]): void {
    if (!this.tagMap[path]) return;
    const oldTags = [...this.tagMap[path]];
    let changed = false;
    tags.forEach((tag) => {
      const index = this.tagMap[path]?.indexOf(tag);
      if (index !== undefined && index !== -1) {
        this.tagMap[path].splice(index, 1);
        changed = true;
      }
    });
    if (this.tagMap[path]?.length === 0) {
      delete this.tagMap[path];
    }
    if (changed) {
      this.invalidateCaches();
      this.notifyListeners(path, oldTags);
    }
  }

  /**
   * Définir tous les tags d'un fichier (remplace les existants)
   */
  setTags(path: string, tags: string[]): void {
    const oldTags = [...(this.tagMap[path] || [])];
    const uniqueTags = [...new Set(tags.filter((t) => t.trim()))];
    if (uniqueTags.length === 0) {
      delete this.tagMap[path];
    } else {
      this.tagMap[path] = uniqueTags;
    }
    this.invalidateCaches();
    this.notifyListeners(path, oldTags);
  }

  /**
   * Supprimer tous les tags d'un fichier
   */
  clearTags(path: string): void {
    if (this.tagMap[path]) {
      const oldTags = [...this.tagMap[path]];
      delete this.tagMap[path];
      this.invalidateCaches();
      this.notifyListeners(path, oldTags);
    }
  }

  /**
   * Renommer un fichier (déplace les tags)
   */
  renamePath(oldPath: string, newPath: string): void {
    if (this.tagMap[oldPath]) {
      this.tagMap[newPath] = this.tagMap[oldPath];
      delete this.tagMap[oldPath];
      this.invalidateCaches();
      this.notifyListeners(newPath, []);
    }
  }

  /**
   * Obtenir le nombre de tags d'un fichier
   */
  getTagCount(path: string): number {
    return this.tagMap[path]?.length || 0;
  }

  /**
   * Filtrer les fichiers par tags (recherche ET/OU)
   */
  filterByTags(paths: string[], query: string): string[] {
    if (!query.trim()) return paths;

    const orParts = query.split(/\s+OR\s+/i).map((p) => p.trim());

    return paths.filter((path) => {
      const tags = this.getTags(path);
      const tagStr = tags.join(' ').toLowerCase();
      const fileName = path.toLowerCase();

      return orParts.some((orPart) => {
        const andParts = orPart.split(/\s+AND\s+/i).map((p) => p.trim().toLowerCase());
        return andParts.every((term) => tagStr.includes(term) || fileName.includes(term));
      });
    });
  }

  /**
   * Obtenir toutes les données (pour sauvegarde) - returns reference for internal use
   */
  getData(): TagMap {
    return this.tagMap;
  }

  /**
   * Obtenir la version actuelle (pour réactivité)
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Ajouter un listener pour les changements
   */
  addListener(callback: TagMapListener): void {
    this.listeners.add(callback);
  }

  /**
   * Retirer un listener
   */
  removeListener(callback: TagMapListener): void {
    this.listeners.delete(callback);
  }

  addTagChangeListener(callback: TagChangeListener): void {
    this.changeListeners.add(callback);
  }

  removeTagChangeListener(callback: TagChangeListener): void {
    this.changeListeners.delete(callback);
  }

  /**
   * Notifier tous les listeners
   */
  private notifyListeners(changedPath?: string, oldTags?: string[]): void {
    this.version++;
    // Pass tagMap reference to listeners (they shouldn't mutate it)
    this.listeners.forEach((callback) => callback(this.tagMap));
    if (changedPath) {
      const nextTags = this.getTags(changedPath);
      const prevTags = oldTags || [];
      this.changeListeners.forEach((listener) => listener(changedPath, [...nextTags], [...prevTags]));
    }
  }

  /**
   * Obtenir les fichiers ayant au moins un tag spécifique (uses inverted index)
   */
  getFilesWithTag(tag: string): string[] {
    const index = this.getTagToFilesIndex();
    const files = index.get(tag);
    return files ? Array.from(files) : [];
  }

  /**
   * Obtenir les fichiers ayant tous les tags spécifiés
   */
  getFilesWithAllTags(tags: string[]): string[] {
    if (tags.length === 0) return [];
    const index = this.getTagToFilesIndex();

    // Start with files matching the first tag, then intersect
    const firstSet = index.get(tags[0]);
    if (!firstSet) return [];

    const result: string[] = [];
    for (const path of firstSet) {
      const fileTags = this.tagMap[path];
      if (fileTags && tags.every(tag => fileTags.includes(tag))) {
        result.push(path);
      }
    }
    return result;
  }

  /**
   * Obtenir les tags communs à plusieurs fichiers
   */
  getCommonTags(paths: string[]): string[] {
    if (paths.length === 0) return [];

    const firstTags = this.getTags(paths[0]);
    return firstTags.filter((tag) =>
      paths.every((path) => this.getTags(path).includes(tag))
    );
  }
}
