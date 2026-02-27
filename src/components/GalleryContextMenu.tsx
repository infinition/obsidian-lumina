import React, { useRef, useLayoutEffect, useState } from 'react';
import { t, type LocaleKey } from '../i18n/locales';

interface ContextMenuProps {
  x: number;
  y: number;
  selectedPaths: string[];
  onManageTags: () => void;
  onDelete: () => void;
  onClose: () => void;
  locale: LocaleKey;
  enableTagSystem?: boolean;
}

export const GalleryContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  selectedPaths,
  onManageTags,
  onDelete,
  onClose,
  locale,
  enableTagSystem = true,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp position so menu stays within viewport
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (top + rect.height > vh - 8) top = vh - rect.height - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    setPos({ left, top });
  }, [x, y]);

  const handleClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <>
      <div
        className="gal-context-menu-overlay"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className="gal-context-menu"
        style={{
          left: `${pos.left}px`,
          top: `${pos.top}px`,
        }}
      >
        {enableTagSystem && (
          <>
            <div className="gal-context-menu-item" onClick={() => handleClick(onManageTags)}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg>
              <span>
                {t(locale, 'manageTags')}
                {selectedPaths.length > 1 && ` (${selectedPaths.length})`}
              </span>
            </div>

            <div className="gal-context-menu-separator" />
          </>
        )}

        <div className="gal-context-menu-item danger" onClick={() => handleClick(onDelete)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          <span>
            {t(locale, 'delete')}
            {selectedPaths.length > 1 && ` (${selectedPaths.length})`}
          </span>
        </div>
      </div>
    </>
  );
};
