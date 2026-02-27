/**
 * Éditeur visuel pour les blocs Lumina
 * Apparaît au survol pour permettre la configuration intuitive
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App, TFile } from 'obsidian';
import type { TagManager } from '../services/tagManager';
import type { LocaleKey } from '../i18n/locales';

interface LuminaBlockOptions {
  query: string;
  files?: string[];
  layout: 'masonry' | 'justified' | 'square' | 'grid' | 'inline';
  columns: number;
  showNames: boolean;
  showTags: boolean;
  maxItems: number;
  sortBy: 'date-desc' | 'date-asc' | 'name' | 'random';
  size: number;
  type?: 'photo' | 'video' | 'gif' | 'all';
  video: 'mixed' | 'separate';
  folder?: string;
  align: 'left' | 'center' | 'right';
}

interface QueryToken {
  id: string;
  type: 'tag' | 'link';
  value: string;
  operator: 'AND' | 'OR' | 'NOT';
}

interface LuminaBlockEditorProps {
  options: LuminaBlockOptions;
  onSave: (newSource: string) => void;
  onClose: () => void;
  app: App;
  tagManager: TagManager;
  locale: LocaleKey;
}

const LAYOUT_OPTIONS = [
  { value: 'grid', label: 'Grid', icon: '▦' },
  { value: 'masonry', label: 'Masonry', icon: '▤' },
  { value: 'justified', label: 'Justified', icon: '▥' },
  { value: 'square', label: 'Square', icon: '◻' },
  { value: 'inline', label: 'Inline', icon: '☰' },
];

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'random', label: 'Random' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All', icon: '🖼️' },
  { value: 'photo', label: 'Photos', icon: '📷' },
  { value: 'video', label: 'Videos', icon: '🎬' },
  { value: 'gif', label: 'GIFs', icon: '✨' },
];

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left', icon: '⬅' },
  { value: 'center', label: 'Center', icon: '⬌' },
  { value: 'right', label: 'Right', icon: '➡' },
];

export const LuminaBlockEditor: React.FC<LuminaBlockEditorProps> = ({
  options: initialOptions,
  onSave,
  onClose,
  app,
  tagManager,
  locale,
}) => {
  const [options, setOptions] = useState<LuminaBlockOptions>(initialOptions);
  const [queryTokens, setQueryTokens] = useState<QueryToken[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [currentOperator, setCurrentOperator] = useState<'AND' | 'OR' | 'NOT'>('AND');
  const [fileInput, setFileInput] = useState('');
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Parser la query initiale en tokens
  useEffect(() => {
    const tokens = parseQueryToTokens(initialOptions.query);
    setQueryTokens(tokens);
  }, []);

  // Récupérer tous les tags et liens disponibles
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    tagManager.getAllTags().forEach(tag => {
      const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
      if (normalized && !normalized.startsWith('[[')) {
        tagSet.add(normalized);
      }
    });
    return Array.from(tagSet).sort();
  }, [tagManager]);

  const allLinks = useMemo(() => {
    const files = app.vault.getFiles();
    return files.map(f => f.name).sort();
  }, [app]);

  // Liste des fichiers média pour les suggestions
  const allMediaFiles = useMemo(() => {
    const mediaExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv'];
    return app.vault.getFiles()
      .filter(f => mediaExtensions.includes(f.extension.toLowerCase()))
      .map(f => f.name)
      .sort();
  }, [app]);

  // Gérer les suggestions de fichiers
  useEffect(() => {
    if (!fileInput) {
      setFileSuggestions([]);
      setShowFileSuggestions(false);
      return;
    }

    const search = fileInput.toLowerCase();
    const results = allMediaFiles
      .filter(f => f.toLowerCase().includes(search))
      .filter(f => !options.files?.includes(f))
      .slice(0, 8);

    setFileSuggestions(results);
    setShowFileSuggestions(results.length > 0);
  }, [fileInput, allMediaFiles, options.files]);

  // Ajouter un fichier standalone
  const addFile = (fileName: string) => {
    if (!options.files?.includes(fileName)) {
      setOptions({
        ...options,
        files: [...(options.files || []), fileName]
      });
    }
    setFileInput('');
    setShowFileSuggestions(false);
    fileInputRef.current?.focus();
  };

  // Retirer un fichier standalone
  const removeFile = (fileName: string) => {
    setOptions({
      ...options,
      files: options.files?.filter(f => f !== fileName) || []
    });
  };

  // Drag and drop handlers for file reordering
  const handleFileDragStart = (index: number) => {
    setDraggedFileIndex(index);
  };

  const handleFileDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedFileIndex !== null && draggedFileIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleFileDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleFileDrop = (dropIndex: number) => {
    if (draggedFileIndex === null || !options.files) {
      setDragOverIndex(null);
      return;
    }

    const newFiles = [...options.files];
    const [draggedFile] = newFiles.splice(draggedFileIndex, 1);
    newFiles.splice(dropIndex, 0, draggedFile);

    setOptions({
      ...options,
      files: newFiles
    });

    setDraggedFileIndex(null);
    setDragOverIndex(null);
  };

  const handleFileDragEnd = () => {
    setDraggedFileIndex(null);
    setDragOverIndex(null);
  };

  // Gérer les suggestions
  useEffect(() => {
    if (!inputValue) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const search = inputValue.toLowerCase();
    let results: string[] = [];

    if (inputValue.startsWith('[[')) {
      // Suggestions de liens
      const linkSearch = inputValue.slice(2).toLowerCase();
      results = allLinks
        .filter(l => l.toLowerCase().includes(linkSearch))
        .slice(0, 10)
        .map(l => `[[${l}]]`);
    } else if (inputValue.startsWith('#')) {
      // Suggestions de tags
      const tagSearch = inputValue.slice(1).toLowerCase();
      results = allTags
        .filter(t => t.toLowerCase().includes(tagSearch))
        .slice(0, 10)
        .map(t => `#${t}`);
    } else {
      // Suggestions mixtes
      const tagResults = allTags
        .filter(t => t.toLowerCase().includes(search))
        .slice(0, 5)
        .map(t => `#${t}`);
      const linkResults = allLinks
        .filter(l => l.toLowerCase().includes(search))
        .slice(0, 5)
        .map(l => `[[${l}]]`);
      results = [...tagResults, ...linkResults];
    }

    setSuggestions(results);
    setShowSuggestions(results.length > 0);
    setSelectedSuggestion(0);
  }, [inputValue, allTags, allLinks]);

  const parseQueryToTokens = (query: string): QueryToken[] => {
    const tokens: QueryToken[] = [];
    if (!query.trim()) return tokens;

    // Expression régulière pour matcher les tags, liens et opérateurs
    const regex = /(!?)(\[\[[^\]]+\]\]|#[\w\-\/]+)/g;
    let match;
    let lastOperator: 'AND' | 'OR' = 'AND';

    // Détecter si le mode est OR
    const isOrMode = query.toLowerCase().includes(' or ') || query.includes(' | ');

    const parts = query.split(/\s+(?:AND|OR|\||&)\s+/i);
    
    parts.forEach((part, index) => {
      const trimmed = part.trim();
      if (!trimmed) return;

      const isNot = trimmed.startsWith('!') || trimmed.startsWith('-');
      const value = trimmed.replace(/^[!-]/, '');
      
      if (value.startsWith('[[') && value.endsWith(']]')) {
        tokens.push({
          id: `${Date.now()}-${index}`,
          type: 'link',
          value: value,
          operator: isNot ? 'NOT' : (isOrMode ? 'OR' : 'AND'),
        });
      } else if (value.startsWith('#') || /^[\w\-\/]+$/.test(value)) {
        tokens.push({
          id: `${Date.now()}-${index}`,
          type: 'tag',
          value: value.startsWith('#') ? value : `#${value}`,
          operator: isNot ? 'NOT' : (isOrMode ? 'OR' : 'AND'),
        });
      }
    });

    return tokens;
  };

  const tokensToQuery = (tokens: QueryToken[]): string => {
    if (tokens.length === 0) return '';

    const parts = tokens.map(t => {
      const prefix = t.operator === 'NOT' ? '!' : '';
      return `${prefix}${t.value}`;
    });

    // Déterminer l'opérateur principal (majorité)
    const andCount = tokens.filter(t => t.operator === 'AND').length;
    const orCount = tokens.filter(t => t.operator === 'OR').length;
    const separator = orCount > andCount ? ' OR ' : ' ';

    return parts.join(separator);
  };

  const addToken = (value: string) => {
    const isLink = value.startsWith('[[');
    const newToken: QueryToken = {
      id: `${Date.now()}-${Math.random()}`,
      type: isLink ? 'link' : 'tag',
      value: value,
      operator: currentOperator,
    };
    setQueryTokens([...queryTokens, newToken]);
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeToken = (id: string) => {
    setQueryTokens(queryTokens.filter(t => t.id !== id));
  };

  const toggleTokenOperator = (id: string) => {
    setQueryTokens(queryTokens.map(t => {
      if (t.id === id) {
        const operators: Array<'AND' | 'OR' | 'NOT'> = ['AND', 'OR', 'NOT'];
        const currentIndex = operators.indexOf(t.operator);
        const nextOperator = operators[(currentIndex + 1) % operators.length];
        return { ...t, operator: nextOperator };
      }
      return t;
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && suggestions[selectedSuggestion]) {
        addToken(suggestions[selectedSuggestion]);
      } else if (inputValue.trim()) {
        // Ajouter comme tag si pas de format spécial
        const value = inputValue.startsWith('#') || inputValue.startsWith('[[') 
          ? inputValue 
          : `#${inputValue}`;
        addToken(value);
      }
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    } else if (e.key === 'Backspace' && !inputValue && queryTokens.length > 0) {
      // Supprimer le dernier token
      setQueryTokens(queryTokens.slice(0, -1));
    }
  };

  const generateSource = (): string => {
    const lines: string[] = [];
    
    // Query
    const query = tokensToQuery(queryTokens);
    if (query) {
      lines.push(query);
    }
    
    // Files (standalone, sans tags)
    if (options.files && options.files.length > 0) {
      lines.push(`files: ${options.files.join(', ')}`);
    }
    
    // Options
    if (options.layout !== 'justified') lines.push(`layout: ${options.layout}`);
    if (options.columns !== 4) lines.push(`columns: ${options.columns}`);
    if (options.size !== 200) lines.push(`size: ${options.size}`);
    if (options.sortBy !== 'date-desc') lines.push(`sortBy: ${options.sortBy}`);
    if (options.type !== 'all') lines.push(`type: ${options.type}`);
    if (options.video !== 'mixed') lines.push(`video: ${options.video}`);
    if (options.align !== 'left') lines.push(`align: ${options.align}`);
    if (options.showNames) lines.push(`showNames: true`);
    if (options.showTags) lines.push(`showTags: true`);
    if (options.maxItems !== 100) lines.push(`maxItems: ${options.maxItems}`);
    if (options.folder) lines.push(`folder: ${options.folder}`);
    
    return lines.join('\n');
  };

  const handleSave = () => {
    const newSource = generateSource();
    onSave(newSource);
    onClose();
  };

  return (
    <div className="lumina-block-editor" ref={editorRef}>
      <div className="lumina-editor-header">
        <div className="lumina-editor-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Lumina Block Editor</span>
        </div>
        <button className="lumina-editor-close" onClick={onClose}>×</button>
      </div>

      {/* Section Query */}
      <div className="lumina-editor-section">
        <div className="lumina-editor-section-title">
          <span>🔍</span> Filter by Tags & Links
        </div>
        
        <div className="lumina-editor-operator-toggle">
          <button 
            className={`lumina-op-btn ${currentOperator === 'AND' ? 'active' : ''}`}
            onClick={() => setCurrentOperator('AND')}
            title="AND - Must have all"
          >
            AND
          </button>
          <button 
            className={`lumina-op-btn ${currentOperator === 'OR' ? 'active' : ''}`}
            onClick={() => setCurrentOperator('OR')}
            title="OR - Have any of"
          >
            OR
          </button>
          <button 
            className={`lumina-op-btn not ${currentOperator === 'NOT' ? 'active' : ''}`}
            onClick={() => setCurrentOperator('NOT')}
            title="NOT - Exclude"
          >
            NOT
          </button>
        </div>

        <div className="lumina-editor-query-input">
          <div className="lumina-query-tokens">
            {queryTokens.map(token => (
              <div 
                key={token.id} 
                className={`lumina-query-token ${token.type} ${token.operator.toLowerCase()}`}
                onClick={() => toggleTokenOperator(token.id)}
                title="Click to change operator"
              >
                <span className="lumina-token-operator">{token.operator}</span>
                <span className="lumina-token-value">{token.value}</span>
                <button 
                  className="lumina-token-remove"
                  onClick={(e) => { e.stopPropagation(); removeToken(token.id); }}
                >
                  ×
                </button>
              </div>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => inputValue && setShowSuggestions(true)}
              placeholder={queryTokens.length === 0 ? "Type #tag or [[link]]..." : "Add more..."}
              className="lumina-query-input-field"
            />
          </div>
          
          {showSuggestions && (
            <div className="lumina-query-suggestions">
              {suggestions.map((s, i) => (
                <div
                  key={s}
                  className={`lumina-suggestion ${i === selectedSuggestion ? 'selected' : ''}`}
                  onClick={() => addToken(s)}
                >
                  <span className={s.startsWith('[[') ? 'link-icon' : 'tag-icon'}>
                    {s.startsWith('[[') ? '📄' : '#'}
                  </span>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section Layout */}
      <div className="lumina-editor-section">
        <div className="lumina-editor-section-title">
          <span>📐</span> Layout
        </div>
        <div className="lumina-layout-options">
          {LAYOUT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`lumina-layout-btn ${options.layout === opt.value ? 'active' : ''}`}
              onClick={() => setOptions({ ...options, layout: opt.value as any })}
              title={opt.label}
            >
              <span className="lumina-layout-icon">{opt.icon}</span>
              <span className="lumina-layout-label">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Section Size & Columns */}
      <div className="lumina-editor-section">
        <div className="lumina-editor-row">
          <div className="lumina-editor-field">
            <label>Size: {options.size}px</label>
            <input
              type="range"
              min="80"
              max="500"
              value={options.size}
              onChange={(e) => setOptions({ ...options, size: parseInt(e.target.value) })}
              className="lumina-slider"
              title="Image size in pixels"
            />
          </div>
          <div className="lumina-editor-field">
            <label>Columns: {options.columns}</label>
            <input
              type="range"
              min="1"
              max="8"
              value={options.columns}
              onChange={(e) => setOptions({ ...options, columns: parseInt(e.target.value) })}
              className="lumina-slider"
              title="Number of columns"
            />
          </div>
        </div>
        <div className="lumina-editor-row">
          <div className="lumina-editor-field">
            <label>Max items: {options.maxItems}</label>
            <input
              type="range"
              min="5"
              max="500"
              step="5"
              value={options.maxItems}
              onChange={(e) => setOptions({ ...options, maxItems: parseInt(e.target.value) })}
              className="lumina-slider"
              title="Maximum number of items to display"
            />
          </div>
        </div>
      </div>

      {/* Section Type & Sort */}
      <div className="lumina-editor-section">
        <div className="lumina-editor-row">
          <div className="lumina-editor-field">
            <label>Type</label>
            <div className="lumina-type-options">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`lumina-type-btn ${options.type === opt.value ? 'active' : ''}`}
                  onClick={() => setOptions({ ...options, type: opt.value as any })}
                  title={opt.label}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
          </div>
          <div className="lumina-editor-field">
            <label>Sort</label>
            <select
              value={options.sortBy}
              onChange={(e) => setOptions({ ...options, sortBy: e.target.value as any })}
              className="lumina-select"
              title="Sort order"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section Video & Display */}
      <div className="lumina-editor-section">
        <div className="lumina-editor-row">
          <div className="lumina-editor-field">
            <label>Videos</label>
            <div className="lumina-toggle-group">
              <button
                className={`lumina-toggle-btn ${options.video === 'mixed' ? 'active' : ''}`}
                onClick={() => setOptions({ ...options, video: 'mixed' })}
              >
                Mixed
              </button>
              <button
                className={`lumina-toggle-btn ${options.video === 'separate' ? 'active' : ''}`}
                onClick={() => setOptions({ ...options, video: 'separate' })}
              >
                Separate
              </button>
            </div>
          </div>
          <div className="lumina-editor-field">
            <label>Align</label>
            <div className="lumina-align-options">
              {ALIGN_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`lumina-align-btn ${options.align === opt.value ? 'active' : ''}`}
                  onClick={() => setOptions({ ...options, align: opt.value as any })}
                  title={opt.label}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="lumina-editor-row checkboxes">
          <label className="lumina-checkbox">
            <input
              type="checkbox"
              checked={options.showNames}
              onChange={(e) => setOptions({ ...options, showNames: e.target.checked })}
            />
            <span>Show filenames</span>
          </label>
          <label className="lumina-checkbox">
            <input
              type="checkbox"
              checked={options.showTags}
              onChange={(e) => setOptions({ ...options, showTags: e.target.checked })}
            />
            <span>Show tags</span>
          </label>
        </div>
      </div>

      {/* Section Files (Standalone) */}
      <div className="lumina-editor-section">
        <div className="lumina-editor-section-title">
          <span>📁</span> Specific Files (no tags)
        </div>
        
        {/* Liste des fichiers ajoutés */}
        {options.files && options.files.length > 0 && (
          <div className="lumina-files-list">
            {options.files.map((file, index) => (
              <div 
                key={file} 
                className={`lumina-file-item ${draggedFileIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                draggable
                onDragStart={() => handleFileDragStart(index)}
                onDragOver={(e) => handleFileDragOver(e, index)}
                onDragLeave={handleFileDragLeave}
                onDrop={() => handleFileDrop(index)}
                onDragEnd={handleFileDragEnd}
              >
                <span className="lumina-file-drag-handle">⋮⋮</span>
                <span className="lumina-file-name">{file}</span>
                <button 
                  className="lumina-file-remove"
                  onClick={() => removeFile(file)}
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Input pour ajouter des fichiers */}
        <div className="lumina-file-input-container">
          <input
            ref={fileInputRef}
            type="text"
            value={fileInput}
            onChange={(e) => setFileInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && fileSuggestions.length > 0) {
                e.preventDefault();
                addFile(fileSuggestions[0]);
              }
            }}
            onFocus={() => fileInput && setShowFileSuggestions(fileSuggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowFileSuggestions(false), 200)}
            placeholder="Type filename to add..."
            className="lumina-file-input"
          />
          
          {showFileSuggestions && (
            <div className="lumina-file-suggestions">
              {fileSuggestions.map((file) => (
                <div
                  key={file}
                  className="lumina-file-suggestion"
                  onClick={() => addFile(file)}
                >
                  <span className="lumina-file-icon">
                    {file.match(/\.(mp4|webm|mov|avi|mkv)$/i) ? '🎬' : '🖼️'}
                  </span>
                  {file}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="lumina-editor-actions">
        <button className="lumina-btn-cancel" onClick={onClose}>Cancel</button>
        <button className="lumina-btn-save" onClick={handleSave}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Apply
        </button>
      </div>
    </div>
  );
};

// Fonction pour monter l'éditeur
export function mountBlockEditor(
  container: HTMLElement,
  options: LuminaBlockOptions,
  onSave: (newSource: string) => void,
  onClose: () => void,
  app: App,
  tagManager: TagManager,
  locale: LocaleKey
): Root {
  const root = createRoot(container);
  root.render(
    <LuminaBlockEditor
      options={options}
      onSave={onSave}
      onClose={onClose}
      app={app}
      tagManager={tagManager}
      locale={locale}
    />
  );
  return root;
}
