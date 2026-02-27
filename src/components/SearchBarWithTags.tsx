import React, { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LocaleKey, t } from '../i18n/locales';

interface SearchBarWithTagsProps {
  value: string;
  onChange: (value: string) => void;
  searchMode: 'AND' | 'OR';
  onSearchModeChange: (mode: 'AND' | 'OR') => void;
  allHashTags: string[];
  allNoteLinks: string[];
  locale: LocaleKey;
  placeholder?: string;
}

type TokenType = 'tag' | 'link' | 'keyword';

interface Token {
  value: string;
  type: TokenType;
}

function parseTokens(value: string): Token[] {
  if (!value.trim()) return [];
  const tokens: Token[] = [];
  const regex = /(\[\[[^\]]+\]\]|#\S+|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const v = match[1];
    let type: TokenType = 'keyword';
    if (v.startsWith('[[') && v.endsWith(']]')) {
      type = 'link';
    } else if (v.startsWith('#')) {
      type = 'tag';
    }
    tokens.push({ value: v, type });
  }
  return tokens;
}

function tokensToString(tokens: Token[]): string {
  return tokens.map(t => t.value).join(' ');
}

export const SearchBarWithTags: React.FC<SearchBarWithTagsProps> = ({
  value,
  onChange,
  searchMode,
  onSearchModeChange,
  allHashTags,
  allNoteLinks,
  locale,
  placeholder
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isAddingRef = useRef(false); // Flag pour empêcher la fermeture pendant l'ajout

  const tokens = useMemo(() => parseTokens(value), [value]);

  const allItems = useMemo(() => {
    return [...allHashTags, ...allNoteLinks].sort();
  }, [allHashTags, allNoteLinks]);

  // Calcul de la position du dropdown
  useLayoutEffect(() => {
    if (!showSuggestions || !wrapperRef.current || suggestions.length === 0) {
      setDropdownStyle(null);
      return;
    }
    const rect = wrapperRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const dropdownHeight = Math.min(280, suggestions.length * 40);
    
    let top: number;
    let maxHeight: number;
    
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      // Afficher en dessous
      top = rect.bottom + 4;
      maxHeight = Math.min(280, spaceBelow);
    } else {
      // Afficher au-dessus
      top = rect.top - Math.min(dropdownHeight, spaceAbove) - 4;
      maxHeight = Math.min(280, spaceAbove);
    }
    
    setDropdownStyle({
      position: 'fixed',
      top,
      left: rect.left,
      width: rect.width,
      maxHeight,
      zIndex: 10000,
    });
  }, [showSuggestions, suggestions.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Ne pas fermer si on est en train d'ajouter un tag
      if (isAddingRef.current) return;
      
      const target = e.target as Node;
      
      // Vérifier si le clic est dans le container principal
      if (containerRef.current && containerRef.current.contains(target)) return;
      
      // Vérifier si le clic est dans le dropdown (portal)
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      
      // Clic vraiment à l'extérieur - fermer
      setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recalculer les suggestions disponibles (excluant les tokens déjà ajoutés)
  const getFilteredSuggestions = useCallback((input: string, currentTokens: Token[]) => {
    const existing = new Set(currentTokens.map(t => t.value.toLowerCase()));
    const lower = input.toLowerCase();
    let filtered: string[] = [];

    if (!input) {
      // Pas de filtre - retourner tous les items non sélectionnés
      filtered = allItems.filter(item => !existing.has(item.toLowerCase()));
    } else if (input.startsWith('#')) {
      const search = lower.slice(1);
      filtered = allHashTags
        .filter(tag => tag.toLowerCase().includes(search))
        .filter(tag => !existing.has(tag.toLowerCase()));
    } else if (input.startsWith('[')) {
      const search = lower.replace(/[\[\]]/g, '');
      filtered = allNoteLinks
        .filter(link => link.toLowerCase().includes(search))
        .filter(link => !existing.has(link.toLowerCase()));
    } else {
      filtered = allItems
        .filter(item => item.toLowerCase().includes(lower))
        .filter(item => !existing.has(item.toLowerCase()));
    }

    return filtered.slice(0, 30);
  }, [allItems, allHashTags, allNoteLinks]);

  const updateSuggestions = useCallback((input: string) => {
    const filtered = getFilteredSuggestions(input, tokens);
    setSuggestions(filtered);
  }, [getFilteredSuggestions, tokens]);

  // Mettre à jour les suggestions quand les tokens changent
  useEffect(() => {
    if (showSuggestions) {
      updateSuggestions(inputValue);
    }
  }, [tokens, showSuggestions, inputValue, updateSuggestions]);

  const handleFocus = () => {
    updateSuggestions(inputValue);
    setShowSuggestions(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    updateSuggestions(newValue);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  const addToken = useCallback((tokenValue: string) => {
    const trimmed = tokenValue.trim();
    if (!trimmed) return;
    const existing = tokens.map(t => t.value.toLowerCase());
    if (existing.includes(trimmed.toLowerCase())) return;

    // Empêcher la fermeture du dropdown pendant l'ajout
    isAddingRef.current = true;

    let type: TokenType = 'keyword';
    if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
      type = 'link';
    } else if (trimmed.startsWith('#')) {
      type = 'tag';
    }

    const newTokens = [...tokens, { value: trimmed, type }];
    const newValue = tokensToString(newTokens);
    onChange(newValue);
    setInputValue('');
    setSelectedIndex(-1);
    
    // Garder le dropdown ouvert et focus
    setTimeout(() => {
      setShowSuggestions(true);
      isAddingRef.current = false;
      inputRef.current?.focus();
    }, 50);
  }, [tokens, onChange]);

  const removeToken = (index: number) => {
    const newTokens = tokens.filter((_, i) => i !== index);
    onChange(tokensToString(newTokens));
    // Le useEffect mettra à jour les suggestions automatiquement
    inputRef.current?.focus();
  };

  const selectSuggestion = useCallback((suggestion: string) => {
    // Marquer qu'on est en train d'ajouter pour éviter la fermeture
    isAddingRef.current = true;
    addToken(suggestion);
  }, [addToken]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        selectSuggestion(suggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        addToken(inputValue);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    } else if (e.key === ' ' && inputValue.trim() && !inputValue.startsWith('[')) {
      e.preventDefault();
      addToken(inputValue);
    }
    // NOTE: Backspace ne supprime plus les tags - utiliser le bouton × pour supprimer
  };

  const clearAll = () => {
    onChange('');
    setInputValue('');
    setSuggestions(allItems.slice(0, 50));
    inputRef.current?.focus();
  };

  const suggestionClass = (idx: number) => 'lumina-search-suggestion' + (idx === selectedIndex ? ' selected' : '');
  const tokenClass = (type: TokenType) => `lumina-search-token lumina-search-token-${type}`;

  // Toggle entre OR et AND
  const toggleSearchMode = () => {
    onSearchModeChange(searchMode === 'OR' ? 'AND' : 'OR');
  };

  const suggestionsDropdown = showSuggestions && suggestions.length > 0 && dropdownStyle && createPortal(
    <div 
      ref={dropdownRef}
      className="lumina-search-suggestions lumina-search-suggestions-portal" 
      style={dropdownStyle}
    >
      {suggestions.map((s, i) => (
        <div
          key={i}
          className={suggestionClass(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            selectSuggestion(s);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          {s}
        </div>
      ))}
    </div>,
    document.body
  );

  return (
    <div className="lumina-search-container" ref={containerRef}>
      <div className="lumina-search-row">
        <div className="lumina-search-tokens-wrapper" ref={wrapperRef} onClick={() => inputRef.current?.focus()}>
          <div className="lumina-search-tokens">
            {tokens.map((token, i) => (
              <span key={i} className={tokenClass(token.type)}>
                {token.value}
                <button
                  type="button"
                  className="lumina-search-token-remove"
                  onClick={(e) => { e.stopPropagation(); removeToken(i); }}
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              placeholder={tokens.length === 0 ? (placeholder || t(locale, 'searchPlaceholder')) : ''}
              className="lumina-search-input"
            />
          </div>
          {(tokens.length > 0 || inputValue) && (
            <button className="lumina-search-clear" onClick={clearAll} title="Clear all">
              ×
            </button>
          )}
        </div>
        <button 
          className={`lumina-mode-toggle-btn ${searchMode.toLowerCase()}`} 
          onClick={toggleSearchMode}
          title={searchMode === 'OR' ? 'Match any tag' : 'Match all tags'}
        >
          {searchMode}
        </button>
      </div>
      {suggestionsDropdown}
    </div>
  );
};