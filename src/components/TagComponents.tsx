import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { t, type LocaleKey } from '../i18n/locales';

type TagType = 'hash' | 'bracket' | 'text';

interface TagSuggestion {
  value: string;
  type: TagType;
  label: string;
}

interface TagInputProps {
  existingTags: string[];
  allTags: string[];
  allNoteLinks?: string[];
  onAdd: (tag: string) => void;
  locale: LocaleKey;
  placeholder?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  existingTags,
  allTags,
  allNoteLinks = [],
  onAdd,
  locale,
  placeholder,
}) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Détermine le type et le filtre de recherche
  const { currentType, filterText } = useMemo(() => {
    const trimmed = input.trim();
    if (trimmed.startsWith('[[')) {
      return { currentType: 'bracket' as TagType, filterText: trimmed.slice(2).replace(/\]\]$/, '') };
    } else if (trimmed.startsWith('#')) {
      return { currentType: 'hash' as TagType, filterText: trimmed.slice(1) };
    }
    return { currentType: null, filterText: trimmed };
  }, [input]);

  // Génère les suggestions basées sur le contexte
  const suggestions = useMemo<TagSuggestion[]>(() => {
    const normalizedFilter = filterText.toLowerCase();
    const existingSet = new Set(existingTags.map(t => t.toLowerCase()));

    const results: TagSuggestion[] = [];

    if (currentType === 'bracket' || currentType === null) {
      // Suggestions de notes [[xxx]]
      allNoteLinks
        .filter(note => 
          !existingSet.has(`[[${note.toLowerCase()}]]`) &&
          (!normalizedFilter || note.toLowerCase().includes(normalizedFilter))
        )
        .slice(0, 25)
        .forEach(note => {
          results.push({
            value: `[[${note}]]`,
            type: 'bracket',
            label: `[[${note}]]`,
          });
        });
    }

    if (currentType === 'hash' || currentType === null) {
      // Suggestions de hashtags #xxx
      allTags
        .filter(tag => {
          const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
          return !existingSet.has(`#${normalized.toLowerCase()}`) &&
            (!normalizedFilter || normalized.toLowerCase().includes(normalizedFilter));
        })
        .slice(0, 25)
        .forEach(tag => {
          const normalized = tag.startsWith('#') ? tag.slice(1) : tag;
          results.push({
            value: `#${normalized}`,
            type: 'hash',
            label: `#${normalized}`,
          });
        });
    }

    // Trier par pertinence (ceux qui commencent par le filtre en premier)
    return results.sort((a, b) => {
      const aStarts = a.label.toLowerCase().includes(normalizedFilter);
      const bStarts = b.label.toLowerCase().includes(normalizedFilter);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.label.localeCompare(b.label);
    }).slice(0, 30);
  }, [allTags, allNoteLinks, existingTags, currentType, filterText]);

  const handleAdd = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !existingTags.includes(trimmed)) {
      onAdd(trimmed);
      setInput('');
      setShowSuggestions(false);
      setSelectedIndex(-1);
      inputRef.current?.focus();
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleAdd(suggestions[selectedIndex].value);
      } else if (input.trim()) {
        // Ajouter le tag tel quel s'il commence par # ou [[
        const trimmed = input.trim();
        if (trimmed.startsWith('#') || (trimmed.startsWith('[[') && trimmed.endsWith(']]'))) {
          handleAdd(trimmed);
        } else if (trimmed.startsWith('[[')) {
          // Fermer automatiquement le bracket
          handleAdd(`${trimmed}]]`);
        } else {
          // Tag simple sans préfixe -> on ajoute comme #tag
          handleAdd(`#${trimmed}`);
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleFocus = () => {
    setShowSuggestions(true);
  };

  const handleBlur = () => {
    // Délai pour permettre le clic sur une suggestion
    setTimeout(() => setShowSuggestions(false), 200);
  };

  // Position des suggestions (calculée par rapport à l'input)
  const [suggestionsStyle, setSuggestionsStyle] = useState<React.CSSProperties>({});
  
  const updateSuggestionsPosition = useCallback(() => {
    if (inputRef.current && showSuggestions) {
      const rect = inputRef.current.getBoundingClientRect();
      setSuggestionsStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 100000,
      });
    }
  }, [showSuggestions]);

  useEffect(() => {
    updateSuggestionsPosition();
    // Mettre à jour la position si la fenêtre est redimensionnée ou scrollée
    window.addEventListener('resize', updateSuggestionsPosition);
    window.addEventListener('scroll', updateSuggestionsPosition, true);
    return () => {
      window.removeEventListener('resize', updateSuggestionsPosition);
      window.removeEventListener('scroll', updateSuggestionsPosition, true);
    };
  }, [updateSuggestionsPosition]);

  return (
    <div className="lumina-tag-input-container">
      <input
        ref={inputRef}
        type="text"
        className="lumina-tag-input"
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder || t(locale, 'addTag')}
      />
      {showSuggestions && suggestions.length > 0 && createPortal(
        <div className="lumina-tag-suggestions" style={suggestionsStyle}>
          {suggestions.map((suggestion, idx) => (
            <div
              key={suggestion.value}
              className={`lumina-tag-suggestion ${idx === selectedIndex ? 'selected' : ''} ${suggestion.type}`}
              onClick={() => handleAdd(suggestion.value)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <span className="lumina-tag-suggestion-icon">
                {suggestion.type === 'bracket' ? '📄' : '#'}
              </span>
              <span className="lumina-tag-suggestion-label">{suggestion.label}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

interface TagBadgeProps {
  tag: string;
  onRemove?: () => void;
  clickable?: boolean;
  onClick?: () => void;
}

/**
 * Extrait le nom d'affichage d'un tag
 * Pour [[folder/test]], retourne [[test]]
 * Pour #tag, retourne #tag
 */
function getTagDisplayName(tag: string): string {
  if (tag.startsWith('[[') && tag.endsWith(']]')) {
    const linkContent = tag.slice(2, -2); // Enlever [[ et ]]
    const lastSlashIndex = linkContent.lastIndexOf('/');
    return `[[${lastSlashIndex >= 0 ? linkContent.slice(lastSlashIndex + 1) : linkContent}]]`;
  }
  return tag;
}

export const TagBadge: React.FC<TagBadgeProps> = ({ tag, onRemove, clickable, onClick }) => {
  // Déterminer le type de tag pour la couleur
  const tagTypeClass = tag.startsWith('[[') && tag.endsWith(']]') 
    ? 'lumina-tag-link' 
    : tag.startsWith('#') 
      ? 'lumina-tag-hashtag' 
      : '';

  const displayName = getTagDisplayName(tag);

  return (
    <span
      className={`lumina-tag-badge ${tagTypeClass} ${clickable ? 'clickable' : ''}`}
      onClick={onClick}
      title={tag}
    >
      {displayName}
      {onRemove && (
        <button
          className="lumina-tag-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove tag"
        >
          ×
        </button>
      )}
    </span>
  );
};

interface TagListProps {
  tags: string[];
  maxVisible?: number;
  onTagClick?: (tag: string) => void;
  onRemove?: (tag: string) => void;
  showCount?: boolean;
}

export const TagList: React.FC<TagListProps> = ({
  tags,
  maxVisible = 4,
  onTagClick,
  onRemove,
  showCount = true,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (tags.length === 0) {
    return null;
  }

  const visibleTags = expanded ? tags : tags.slice(0, maxVisible);
  const hiddenCount = tags.length - maxVisible;

  return (
    <div className="lumina-tag-list">
      {visibleTags.map((tag) => (
        <TagBadge
          key={tag}
          tag={tag}
          clickable={!!onTagClick}
          onClick={() => onTagClick?.(tag)}
          onRemove={onRemove ? () => onRemove(tag) : undefined}
        />
      ))}
      {!expanded && hiddenCount > 0 && showCount && (
        <button
          className="lumina-tag-more"
          onClick={() => setExpanded(true)}
          title={tags.slice(maxVisible).join(', ')}
        >
          +{hiddenCount}
        </button>
      )}
      {expanded && tags.length > maxVisible && (
        <button
          className="lumina-tag-less"
          onClick={() => setExpanded(false)}
        >
          −
        </button>
      )}
    </div>
  );
};
