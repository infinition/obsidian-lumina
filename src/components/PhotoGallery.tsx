import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import type { WebOSAPI } from '../types';
import {
  loadImage,
  loadVideoThumbnail,
  getAspectRatio,
  getImageDimensions,
  initWorker,
  type CachedImage,
} from '../utils/imageLoader';
import { t, type LocaleKey } from '../i18n/locales';
import { GalleryContextMenu } from './GalleryContextMenu';
import { BatchTagModal } from './TagModals';
import { SearchBarWithTags } from './SearchBarWithTags';
import { TagList } from './TagComponents';

const IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'ico', 'avif', 'apng'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv', 'm4v'];
const GAP = 10;
const ZOOM_MIN = 50;
const ZOOM_MAX = 1000;
const ZOOM_BASE = 50;
const ZOOM_LOG_RATIO = Math.log(ZOOM_MAX / ZOOM_BASE);
function zoomToLevel(zoom: number): number {
  return (1000 * Math.log(Math.max(ZOOM_BASE, zoom) / ZOOM_BASE)) / ZOOM_LOG_RATIO;
}
function levelToZoom(level: number): number {
  return Math.round(ZOOM_BASE * Math.exp((level / 1000) * ZOOM_LOG_RATIO));
}
function zoomMultiply(zoom: number, factor: number): number {
  const level = zoomToLevel(zoom);
  return levelToZoom(Math.max(0, Math.min(1000, level + factor * 50)));
}
const SORT_OPTIONS = [
  { val: 'mtime-desc', labelKey: 'dateModificationNewest' as const },
  { val: 'mtime-asc', labelKey: 'dateModificationOldest' as const },
  { val: 'dateTaken-desc', labelKey: 'dateTakenNewest' as const },
  { val: 'ctime-desc', labelKey: 'createdNewest' as const },
  { val: 'type-asc', labelKey: 'byExtension' as const },
  { val: 'name-asc', labelKey: 'nameAZ' as const },
  { val: 'size-desc', labelKey: 'sizeLargest' as const }
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['val'];

const SLIDESHOW_OPTIONS = [5, 10, 30, 60, 600, 0] as const; // 0 = OFF

type DetailSortField = 'name' | 'type' | 'size' | 'mtime' | 'tags';

interface GallerySettings {
  folders: string[];
  includeAll: boolean;
  sortBy: SortKey;
  zoom: number;
  layout: 'square' | 'justified' | 'detail' | 'panorama-square' | 'panorama-justified';
  height?: number;
  width?: number;
  search: string;
  searchMode: 'AND' | 'OR';
  showNames: boolean;
  showTags: boolean;
  showPhotos: boolean;
  showVideos: boolean;
  showOther: boolean;
  showAllFiles: boolean;
  slideshowIntervalSec: number;
  slideshowInactivitySec: number;
  toolbarPinned: boolean;
  detailSortField: DetailSortField;
  detailSortAsc: boolean;
}

const DEFAULT_SETTINGS: GallerySettings = {
  folders: [],
  includeAll: true,
  sortBy: 'mtime-desc',
  zoom: 200,
  layout: 'justified',
  search: '',
  searchMode: 'OR',
  showNames: false,
  showTags: false,
  showPhotos: true,
  showVideos: false,
  showOther: false,
  showAllFiles: false,
  slideshowIntervalSec: 0,
  slideshowInactivitySec: 10,
  toolbarPinned: false,
  detailSortField: 'name',
  detailSortAsc: true,
};

type MediaType = 'image' | 'video' | 'other';

interface ImageData {
  name: string;
  path: string;
  url: string;
  mtime: number;
  ctime: number;
  size: number;
  mediaType: MediaType;
}

function getMediaType(ext: string): MediaType {
  const lowerExt = ext.toLowerCase();
  if (IMG_EXT.includes(lowerExt)) return 'image';
  if (VIDEO_EXT.includes(lowerExt)) return 'video';
  return 'other';
}

function isGif(path: string): boolean {
  return path.toLowerCase().endsWith('.gif');
}

interface EmbedData {
  url: string;
  embedSrc: string;
  embedHtml: string;
}

/** Convert YouTube (or other) URL to embed. Returns null if not supported. */
function urlToEmbed(input: string): EmbedData | null {
  const raw = input.trim();
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    // YouTube: watch?v=ID or youtu.be/ID
    if (host === 'youtube.com' && u.pathname === '/watch' && u.searchParams.get('v')) {
      const id = u.searchParams.get('v')!;
      const embedSrc = `https://www.youtube.com/embed/${id}`;
      const embedHtml = `<iframe width="560" height="315" src="${embedSrc}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
      return { url, embedSrc, embedHtml };
    }
    if (host === 'youtu.be' && u.pathname.length > 1) {
      const id = u.pathname.slice(1).split('?')[0];
      const embedSrc = `https://www.youtube.com/embed/${id}`;
      const embedHtml = `<iframe width="560" height="315" src="${embedSrc}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
      return { url, embedSrc, embedHtml };
    }
    return null;
  } catch {
    return null;
  }
}

interface LayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
  index?: number;
}

interface ObsidianVaultFile {
  path: string;
  name: string;
  extension: string;
  stat: { mtime: number; ctime: number; size: number };
}

interface ObsidianApp {
  vault: {
    getFiles(): ObsidianVaultFile[];
    getResourcePath(f: { path: string }): string;
    getAbstractFileByPath(p: string): unknown;
    read(f: unknown): Promise<string>;
    modify(f: unknown, content: string): Promise<void>;
    trash(f: unknown, system: boolean): Promise<void>;
  };
  vault?: {
    getMarkdownFiles?(): { path: string }[];
  };
}

interface PhotoGalleryWidgetProps {
  api: WebOSAPI;
  instanceId?: string;
}

export const PhotoGalleryWidget: React.FC<PhotoGalleryWidgetProps> = ({
  api,
  instanceId
}) => {
  const stateId = instanceId || 'photo-gallery';
  const app = api.getObsidianApp() as ObsidianApp | null;
  const locale = api.getLocale() as LocaleKey;
  const tagManager = api.getTagManager();

  const [settings, setSettings] = useState<GallerySettings>(DEFAULT_SETTINGS);
  const [allImages, setAllImages] = useState<ImageData[]>([]);
  const [filteredImages, setFilteredImages] = useState<ImageData[]>([]);
  const [layoutData, setLayoutData] = useState<LayoutItem[]>([]);
  const scrollRef = useRef(0);
  const [targetScroll, setTargetScroll] = useState(0);
  const scrollRefX = useRef(0);
  const [targetScrollX, setTargetScrollX] = useState(0);
  const startXRef = useRef(0);
  const startScrollXRef = useRef(0);
  const panoramaTotalWidthRef = useRef(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [isEditMode, setIsEditMode] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxEmbed, setLightboxEmbed] = useState<EmbedData | null>(null);
  const [lbUiVisible, setLbUiVisible] = useState(true);
  const [lbZoom, setLbZoom] = useState(1);
  const [lbPan, setLbPan] = useState({ x: 0, y: 0 });
  const [lbDragging, setLbDragging] = useState(false);
  const [folderPopup, setFolderPopup] = useState(false);
  const [sortPopup, setSortPopup] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const [folderSearch, setFolderSearch] = useState('');
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [compact, setCompact] = useState(false);
  const [extraCompact, setExtraCompact] = useState(false);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [slideshowCountdown, setSlideshowCountdown] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; paths: string[] } | null>(null);
  const [availableHashTags, setAvailableHashTags] = useState<string[]>([]);
  const [availableNoteLinks, setAvailableNoteLinks] = useState<string[]>([]);

  const lastActivityRef = useRef(Date.now());
  const lastSelectedIndexRef = useRef<number>(-1);
  const slideshowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const layoutDataRef = useRef<LayoutItem[]>([]);
  const slideshowIndexRef = useRef(0);
  const isSlideshowActiveRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<Map<string, HTMLImageElement | ImageBitmap | 'loading'>>(new Map());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const velocityRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const startYRef = useRef(0);
  const startScrollRef = useRef(0);
  const lbZoomRef = useRef(1);
  useEffect(() => { lbZoomRef.current = lbZoom; }, [lbZoom]);
  const lbXRef = useRef(0);
  const lbYRef = useRef(0);
  const lbDraggingRef = useRef(false);
  const lbPointerDownRef = useRef(false);
  const lbStartXRef = useRef(0);
  const lbStartYRef = useRef(0);
  const lbStartPanRef = useRef({ x: 0, y: 0 });
  const lightboxViewerRef = useRef<HTMLDivElement>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement>(null);
  const [isPipActive, setIsPipActive] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Double-tap detection for mobile zoom
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);
  const overlayContentRef = useRef<HTMLDivElement>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const galMainRef = useRef<HTMLDivElement>(null);
  const detailViewRef = useRef<HTMLDivElement>(null);
  const [detailScrollInfo, setDetailScrollInfo] = useState({ scrollTop: 0, scrollHeight: 1, clientHeight: 1 });
  const videoHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nameTooltip, setNameTooltip] = useState<{ imgData: ImageData; clientX: number; clientY: number } | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const toolbarHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lbUiHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Plugin settings (for tag system enable/disable) - refresh on each render to catch setting changes
  const [pluginSettings, setPluginSettings] = useState(api.getPluginSettings());
  
  // Refresh plugin settings via CustomEvent (dispatched by main.ts on save)
  useEffect(() => {
    const refreshSettings = () => setPluginSettings(api.getPluginSettings());
    const onSettingsChanged = () => refreshSettings();
    window.addEventListener('lumina:settings-changed', onSettingsChanged);
    document.addEventListener('visibilitychange', refreshSettings);
    return () => {
      window.removeEventListener('lumina:settings-changed', onSettingsChanged);
      document.removeEventListener('visibilitychange', refreshSettings);
    };
  }, [api]);
  
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const folderBtnRef = useRef<HTMLButtonElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [searchPopupStyle, setSearchPopupStyle] = useState<React.CSSProperties | null>(null);
  const [folderPopupStyle, setFolderPopupStyle] = useState<React.CSSProperties | null>(null);
  const [sortPopupStyle, setSortPopupStyle] = useState<React.CSSProperties | null>(null);
  const [timelineVisible, setTimelineVisible] = useState(false);
  const timelineHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineScrubRef = useRef<HTMLDivElement>(null);

  // Détecter le fullscreen pour augmenter le z-index des popups
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const checkFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    checkFullscreen();
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      document.removeEventListener('mozfullscreenchange', checkFullscreen);
    };
  }, []);

  const popupZIndex = isFullscreen ? 2000000 : 10001;

  useEffect(() => {
    if (!app) return undefined;
    const metadataCache = (app as any).metadataCache;
    const vault = app.vault as unknown as {
      on?: (name: string, callback: () => void) => void;
      off?: (name: string, callback: () => void) => void;
      getFiles(): ObsidianVaultFile[];
    };

    const normalizeHash = (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return '';
      return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    };

    const updateHashTags = () => {
      const tagSet = new Set<string>();
      tagManager.getAllTags().forEach((tag) => tagSet.add(tag));
      const metaTags = metadataCache?.getTags?.();
      if (metaTags) {
        Object.keys(metaTags).forEach((tag) => {
          const normalized = normalizeHash(tag);
          if (normalized) {
            tagSet.add(normalized);
          }
        });
      }
      setAvailableHashTags(
        Array.from(tagSet).sort((a, b) => a.localeCompare(b, locale, { sensitivity: 'base' }))
      );
    };

    const updateNoteLinks = () => {
      const files = app.vault.getMarkdownFiles?.() ?? app.vault.getFiles().filter((f) => f.path.toLowerCase().endsWith('.md'));
      const noteSet = new Set<string>();
      files.forEach((file) => {
        const pathWithoutExt = file.path.replace(/\.md$/i, '');
        const baseName = file.path.split('/').pop()?.replace(/\.md$/i, '');
        if (pathWithoutExt) noteSet.add(pathWithoutExt);
        if (baseName) noteSet.add(baseName);
      });
      setAvailableNoteLinks(
        Array.from(noteSet).sort((a, b) => a.localeCompare(b, locale, { sensitivity: 'base' }))
      );
    };

    updateHashTags();
    updateNoteLinks();

    const tagListener = () => updateHashTags();
    tagManager.addListener(tagListener);

    const onCacheUpdate = () => {
      updateHashTags();
      updateNoteLinks();
    };
    metadataCache?.on?.('changed', onCacheUpdate);
    metadataCache?.on?.('resolve', onCacheUpdate);

    const onCreate = () => updateNoteLinks();
    const onDelete = () => updateNoteLinks();
    const onRename = () => updateNoteLinks();
    vault.on?.('create', onCreate);
    vault.on?.('delete', onDelete);
    vault.on?.('rename', onRename);

    return () => {
      tagManager.removeListener(tagListener);
      metadataCache?.off?.('changed', onCacheUpdate);
      metadataCache?.off?.('resolve', onCacheUpdate);
      vault.off?.('create', onCreate);
      vault.off?.('delete', onDelete);
      vault.off?.('rename', onRename);
    };
  }, [app, locale, tagManager]);

  // Calcul des bornes visibles (intersection conteneur + viewport)
  const getVisibleBounds = useCallback(() => {
    if (!containerRef.current) return null;
    const cr = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      left: Math.max(cr.left, 0),
      right: Math.min(cr.right, vw),
      top: Math.max(cr.top, 0),
      bottom: Math.min(cr.bottom, vh),
      width: Math.min(cr.right, vw) - Math.max(cr.left, 0),
      height: Math.min(cr.bottom, vh) - Math.max(cr.top, 0)
    };
  }, []);

  useLayoutEffect(() => {
    if (!searchExpanded || !searchBtnRef.current) { setSearchPopupStyle(null); return; }
    const bounds = getVisibleBounds();
    if (!bounds || bounds.width < 50) { setSearchPopupStyle(null); return; }
    const rect = searchBtnRef.current.getBoundingClientRect();
    const pad = 8;
    const w = Math.min(450, bounds.width - 2 * pad);
    let left = rect.left;
    if (left + w > bounds.right - pad) left = bounds.right - w - pad;
    if (left < bounds.left + pad) left = bounds.left + pad;
    let top = rect.bottom + pad;
    const popupH = 120;
    if (top + popupH > bounds.bottom - pad) top = Math.max(bounds.top + pad, bounds.bottom - popupH - pad);
    if (top < bounds.top + pad) top = bounds.top + pad;
    const maxHeight = Math.max(80, bounds.bottom - top - pad);
    setSearchPopupStyle({ position: 'fixed', top, left, width: w, maxHeight, zIndex: popupZIndex, overflowY: 'auto' });
  }, [searchExpanded, getVisibleBounds, popupZIndex]);

  useLayoutEffect(() => {
    if (!folderPopup || !folderBtnRef.current) { setFolderPopupStyle(null); return; }
    const bounds = getVisibleBounds();
    if (!bounds || bounds.width < 50) { setFolderPopupStyle(null); return; }
    const rect = folderBtnRef.current.getBoundingClientRect();
    const pad = 8;
    const w = Math.min(280, bounds.width - 2 * pad);
    let left = rect.right - w;
    if (left < bounds.left + pad) left = bounds.left + pad;
    if (left + w > bounds.right - pad) left = bounds.right - w - pad;
    let top = rect.bottom + pad;
    const popupH = 300;
    if (top + popupH > bounds.bottom - pad) top = Math.max(bounds.top + pad, bounds.bottom - popupH - pad);
    if (top < bounds.top + pad) top = bounds.top + pad;
    const maxHeight = Math.max(120, bounds.bottom - top - pad);
    setFolderPopupStyle({ position: 'fixed', top, left, width: w, maxHeight, zIndex: popupZIndex, overflowY: 'auto' });
  }, [folderPopup, getVisibleBounds, popupZIndex]);

  useLayoutEffect(() => {
    if (!sortPopup || !sortBtnRef.current) { setSortPopupStyle(null); return; }
    const bounds = getVisibleBounds();
    if (!bounds || bounds.width < 50) { setSortPopupStyle(null); return; }
    const rect = sortBtnRef.current.getBoundingClientRect();
    const pad = 8;
    const w = 160;
    let left = rect.left;
    if (left + w > bounds.right - pad) left = bounds.right - w - pad;
    if (left < bounds.left + pad) left = bounds.left + pad;
    let top = rect.bottom + pad;
    const popupH = 280;
    if (top + popupH > bounds.bottom - pad) top = Math.max(bounds.top + pad, bounds.bottom - popupH - pad);
    if (top < bounds.top + pad) top = bounds.top + pad;
    const maxHeight = Math.max(120, bounds.bottom - top - pad);
    setSortPopupStyle({ position: 'fixed', top, left, width: w, maxHeight, zIndex: popupZIndex, overflowY: 'auto', padding: 4 });
  }, [sortPopup, getVisibleBounds, popupZIndex]);

  // Fermeture au clic à l'extérieur (listener global car l'overlay peut ne pas recevoir les clics sous Obsidian)
  useEffect(() => {
    if (!searchExpanded && !folderPopup && !sortPopup) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (searchBtnRef.current?.contains(target) || folderBtnRef.current?.contains(target) || sortBtnRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.gal-popup')) return;
      if (searchExpanded) setSearchExpanded(false);
      if (folderPopup) setFolderPopup(false);
      if (sortPopup) setSortPopup(false);
    };
    const doc = document;
    doc.addEventListener('mousedown', handleOutside);
    doc.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      doc.removeEventListener('mousedown', handleOutside);
      doc.removeEventListener('touchstart', handleOutside);
    };
  }, [searchExpanded, folderPopup, sortPopup]);

  // Load state – apply plugin defaults for new widgets, then overlay saved state
  useEffect(() => {
    let active = true;
    // Build defaults from plugin settings
    const ps = api.getPluginSettings();
    const pluginDefaults: Partial<GallerySettings> = {
      layout: ps.defaultLayout ?? DEFAULT_SETTINGS.layout,
      zoom: ps.defaultZoom ?? DEFAULT_SETTINGS.zoom,
      showNames: ps.defaultShowNames ?? DEFAULT_SETTINGS.showNames,
      showPhotos: ps.defaultMediaFilter === 'videos' ? false : true,
      showVideos: ps.defaultMediaFilter === 'photos' ? false : true,
    };

    api.loadWidgetState(stateId).then((saved: unknown) => {
      if (!active) return;
      const s = saved as { settings?: Partial<GallerySettings> } | null;
      if (s?.settings) {
        const loaded = { ...s.settings };
        if ((loaded as { layout?: string }).layout === 'panorama') {
          (loaded as { layout: string }).layout = 'panorama-square';
        }
        // Saved state takes precedence over plugin defaults
        setSettings((prev) => ({ ...prev, ...pluginDefaults, ...loaded }));
      } else {
        // No saved state – use plugin defaults
        setSettings((prev) => ({ ...prev, ...pluginDefaults }));
      }
    });
    return () => {
      active = false;
    };
  }, [api, stateId]);

  // Persist settings (dossiers, zoom, disposition, noms, etc.)
  const saveState = useCallback(
    (immediate: boolean) => {
      const save = () => api.saveWidgetState(stateId, { settings });
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (immediate) save();
      else saveTimeoutRef.current = setTimeout(save, 400);
    },
    [api, stateId, settings]
  );

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    api.saveWidgetState(stateId, { settings: settingsRef.current });
  }, [api, stateId]);

  // Refresh gallery from vault
  const refreshGallery = useCallback(() => {
    if (!app?.vault) return;
    const files = app.vault.getFiles();
    const taggedPaths = new Set(Object.keys(tagManager.getData()));
    const wantAll = settingsRef.current.showAllFiles;
    const list: ImageData[] = files
      .filter((f) => {
        // Skip hidden/system files
        if (f.path.startsWith('.')) return false;
        if (wantAll) return true;
        const ext = f.extension.toLowerCase();
        const isMedia = IMG_EXT.includes(ext) || VIDEO_EXT.includes(ext);
        const isTagged = taggedPaths.has(f.path);
        // Include media files OR tagged files (for "Other" category)
        return isMedia || isTagged;
      })
      .map((f) => ({
        name: f.name,
        path: f.path,
        url: api.resolveResourcePath(f.path),
        mtime: f.stat.mtime,
        ctime: f.stat.ctime,
        size: f.stat.size,
        mediaType: getMediaType(f.extension)
      }));
    setAllImages(list);
  }, [app, api, tagManager]);

  // Open batch tag modal
  const openBatchTagModal = useCallback((paths: string[]) => {
    if (!app || paths.length === 0) return;
    const modal = new BatchTagModal(app, paths, tagManager, locale);
    modal.open();
  }, [app, tagManager, locale]);

  // Navigate to file when clicking on a tag link
  const handleTagClick = useCallback((tag: string) => {
    if (!app?.vault) return;
    
    // Check if it's a [[link]] - always navigate to the file (tagClickAction doesn't apply to links)
    if (tag.startsWith('[[') && tag.endsWith(']]')) {
      const linkName = tag.slice(2, -2).trim();
      if (!linkName) return;
      
      // Find the file and navigate to it
      const files = app.vault.getFiles();
      const targetFile = files.find(f => 
        f.name.toLowerCase() === linkName.toLowerCase() ||
        f.name.toLowerCase() === `${linkName.toLowerCase()}.md` ||
        f.path.replace(/\.[^/.]+$/, '').toLowerCase() === linkName.toLowerCase()
      );
      
      if (targetFile) {
        // Check if it's a media file - open in Lumina lightbox
        const ext = targetFile.extension.toLowerCase();
        if (IMG_EXT.includes(ext) || VIDEO_EXT.includes(ext)) {
          // Find index in filtered images and open lightbox
          const idx = filteredImages.findIndex(img => img.path === targetFile.path);
          if (idx >= 0) {
            setLightboxIndex(idx);
            setLightboxOpen(true);
            setLightboxEmbed(null);
          }
        } else {
          // It's a markdown or other file - open in Obsidian
          const obsidianApp = api.getObsidianApp() as { workspace?: { openLinkText?: (link: string, sourcePath: string) => void } } | null;
          if (obsidianApp?.workspace?.openLinkText) {
            obsidianApp.workspace.openLinkText(linkName, '');
          }
        }
      }
    } else if (tag.startsWith('#')) {
      // It's a hashtag - check tagClickAction setting
      const hashTag = tag.startsWith('#') ? tag : `#${tag}`;
      
      // Fermer la lightbox d'abord
      setLightboxOpen(false);
      setLightboxEmbed(null);
      
      // Check tagClickAction setting
      if (pluginSettings.tagClickAction === 'obsidian') {
        // Open in Obsidian global search
        const obsidianApp = api.getObsidianApp() as { 
          internalPlugins?: {
            getPluginById?: (id: string) => { instance?: { openGlobalSearch?: (query: string) => void } } | null;
          };
          commands?: {
            executeCommandById?: (id: string) => void;
          };
        } | null;
        
        // Try to open global search with the tag
        if (obsidianApp?.internalPlugins?.getPluginById) {
          const searchPlugin = obsidianApp.internalPlugins.getPluginById('global-search');
          if (searchPlugin?.instance?.openGlobalSearch) {
            searchPlugin.instance.openGlobalSearch(`tag:${hashTag}`);
            return;
          }
        }
        // Fallback: use command
        if (obsidianApp?.commands?.executeCommandById) {
          obsidianApp.commands.executeCommandById('global-search:open');
          return;
        }
      }
      
      // Default: add to Lumina search
      setSettings(s => ({
        ...s,
        search: s.search ? `${s.search} ${hashTag}` : hashTag
      }));
    }
  }, [app, api, filteredImages]);

  useEffect(() => {
    refreshGallery();
  }, [refreshGallery, settings.showAllFiles, settings.showOther]);

  // Refresh gallery when tags change (for "Other" files)
  useEffect(() => {
    const tagListener = () => {
      if (settings.showOther) {
        refreshGallery();
      }
    };
    tagManager.addListener(tagListener);
    return () => tagManager.removeListener(tagListener);
  }, [tagManager, refreshGallery, settings.showOther]);

  useEffect(() => {
    initWorker(api.getWorkerUrl());
  }, [api]);

  // Préchargement des images et miniatures vidéo en arrière-plan
  // Prioritizes visible images first, then loads the rest progressively
  useEffect(() => {
    const cache = cacheRef.current;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const BATCH = 5;
    const DELAY_MS = 150;

    // Determine how many images are likely visible in the viewport
    const viewportCount = (() => {
      if (!containerRef.current) return 20;
      const { clientWidth, clientHeight } = containerRef.current;
      const cols = Math.max(1, Math.floor(clientWidth / (settings.zoom + GAP)));
      const rows = Math.max(1, Math.ceil(clientHeight / (settings.zoom + GAP)));
      return cols * rows;
    })();

    // Split into visible (immediate) and offscreen (deferred)
    const visible = filteredImages.slice(0, viewportCount);
    const offscreen = filteredImages.slice(viewportCount);

    const loadOne = (imgData: ImageData) => {
      if (cache.get(imgData.path)) return;
      cache.set(imgData.path, 'loading');
      if (imgData.mediaType === 'video') {
        loadVideoThumbnail(imgData.url, imgData.path, (img) => {
          cache.set(imgData.path, img);
          setLayoutVersion((v) => v + 1);
        }, () => { cache.delete(imgData.path); });
      } else {
        loadImage(imgData.url, imgData.path, (img) => {
          cache.set(imgData.path, img);
          setLayoutVersion((v) => v + 1);
        }, () => { cache.delete(imgData.path); }, api.getWorkerUrl());
      }
    };

    // Visible images: load immediately in one batch
    visible.forEach((imgData) => {
      if (!cache.get(imgData.path)) loadOne(imgData);
    });

    // Offscreen images: stagger in batches with delay
    offscreen.forEach((imgData, i) => {
      if (cache.get(imgData.path)) return;
      const t = setTimeout(() => {
        if (cache.get(imgData.path)) return;
        loadOne(imgData);
      }, Math.floor(i / BATCH) * DELAY_MS);
      timeouts.push(t);
    });

    return () => timeouts.forEach(clearTimeout);
  }, [filteredImages, api, settings.zoom]);

  // Sort and filter
  const sortedAndFiltered = useMemo(() => {
    const rawQuery = settings.search || '';
    const tagQueries = rawQuery.match(/#[\w\-/]+|\[\[[^\]]+\]\]/g) || [];
    const textPart = rawQuery
      .replace(/#[\w\-/]+/g, '')
      .replace(/\[\[[^\]]+\]\]/g, '')
      .trim()
      .toLowerCase();
    
    // Split text into individual search terms
    const textTerms = textPart.split(/\s+/).filter(t => t.length > 0);

    const inFolder = (img: ImageData) =>
      settings.includeAll || settings.folders.some((f) => img.path.startsWith(f));
    
    const matchesSearch = (img: ImageData) => {
      const imgNameLower = img.name.toLowerCase();
      const fileTags = tagManager.getTags(img.path);
      const fileTagsLower = fileTags.map(t => t.toLowerCase());
      
      // Check text terms against filename
      const textMatches = textTerms.map(term => imgNameLower.includes(term));
      
      // Check tag queries against file tags
      // Compare with original format (#tag or [[link]])
      const tagMatches = tagQueries.map(query => {
        const queryLower = query.toLowerCase();
        
        // Direct match with the query as-is
        if (fileTagsLower.includes(queryLower)) return true;
        
        // For hashtags: also check without #
        if (query.startsWith('#')) {
          const tagWithout = query.slice(1).toLowerCase();
          return fileTagsLower.some(ft => 
            ft === `#${tagWithout}` || 
            ft === tagWithout ||
            ft.replace(/^#/, '') === tagWithout
          );
        }
        
        // For links: also check the inner name
        if (query.startsWith('[[') && query.endsWith(']]')) {
          const linkName = query.slice(2, -2).toLowerCase();
          return fileTagsLower.some(ft => 
            ft === queryLower || 
            ft === `[[${linkName}]]` ||
            ft.replace(/^\[\[/, '').replace(/\]\]$/, '') === linkName
          );
        }
        
        return false;
      });
      
      // Combine all matches
      const allMatches = [...textMatches, ...tagMatches];
      
      // If no search criteria, match everything
      if (allMatches.length === 0) return true;
      
      // Apply AND/OR logic
      if (settings.searchMode === 'AND') {
        return allMatches.every(m => m);
      } else {
        return allMatches.some(m => m);
      }
    };

    const matchesMediaType = (img: ImageData) =>
      settings.showAllFiles ||
      (img.mediaType === 'image' && settings.showPhotos) ||
      (img.mediaType === 'video' && settings.showVideos) ||
      (img.mediaType === 'other' && settings.showOther);
    let list = allImages.filter(
      (img) => inFolder(img) && matchesSearch(img) && matchesMediaType(img)
    );
    const mode = settings.sortBy;
    list = [...list].sort((a, b) => {
      if (mode === 'mtime-desc') return b.mtime - a.mtime;
      if (mode === 'mtime-asc') return a.mtime - b.mtime;
      if (mode === 'dateTaken-desc') return b.ctime - a.ctime;
      if (mode === 'ctime-desc') return b.ctime - a.ctime;
      if (mode === 'type-asc') {
        const extA = (a.path.split('.').pop() || '').toLowerCase();
        const extB = (b.path.split('.').pop() || '').toLowerCase();
        return extA.localeCompare(extB) || a.name.localeCompare(b.name);
      }
      if (mode === 'name-asc') return a.name.localeCompare(b.name);
      if (mode === 'size-desc') return b.size - a.size;
      return 0;
    });
    return list;
  }, [allImages, settings.includeAll, settings.folders, settings.search, settings.sortBy, settings.showPhotos, settings.showVideos, settings.showOther, settings.showAllFiles, settings.searchMode, tagManager]);

  useEffect(() => {
    setFilteredImages(sortedAndFiltered);
  }, [sortedAndFiltered]);

  const isPanoramaLayout = settings.layout === 'panorama-square' || settings.layout === 'panorama-justified';
  // En panorama: hauteur de base = remplir l'écran à zoom 200; settings.zoom contrôle le zoom (comme square/justified)
  const textH = settings.showNames ? 25 : 0;
  const panoramaBaseHeight = Math.max(100, (containerHeight || 400) - 2 * GAP - textH);
  const panoramaRowHeight = Math.max(80, panoramaBaseHeight * (settings.zoom / 200));
  const rowHeight = isPanoramaLayout ? panoramaRowHeight : settings.zoom;

  useLayoutEffect(() => {
    if (containerWidth <= 0 || filteredImages.length === 0) {
      setLayoutData([]);
      return;
    }
    const width = containerWidth;
    const cache = cacheRef.current;
    const layout: LayoutItem[] = [];

    if (settings.layout === 'square') {
      const cols = Math.max(1, Math.floor((width - GAP) / (rowHeight + GAP)));
      const itemW = (width - (cols + 1) * GAP) / cols;
      filteredImages.forEach((_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        layout.push({
          x: GAP + col * (itemW + GAP),
          y: GAP + row * (itemW + GAP + textH),
          w: itemW,
          h: itemW
        });
      });
    } else if (settings.layout === 'panorama-square') {
      let x = GAP;
      filteredImages.forEach((_, i) => {
        layout.push({ x, y: GAP, w: rowHeight, h: rowHeight, index: i });
        x += rowHeight + GAP;
      });
      panoramaTotalWidthRef.current = x;
    } else if (settings.layout === 'panorama-justified') {
      let x = GAP;
      filteredImages.forEach((imgData, i) => {
        const cached = cache.get(imgData.path);
        const aspect =
          imgData.mediaType === 'video'
            ? 16 / 9
            : cached && cached !== 'loading'
              ? getAspectRatio(cached as CachedImage)
              : 1.5;
        const itemW = rowHeight * aspect;
        layout.push({ x, y: GAP, w: itemW, h: rowHeight, index: i });
        x += itemW + GAP;
      });
      panoramaTotalWidthRef.current = x;
    } else {
      let currentRow: LayoutItem[] = [];
      let currentRowWidth = 0;
      let y = GAP;
      filteredImages.forEach((imgData, i) => {
        const cached = cache.get(imgData.path);
        const aspect =
          imgData.mediaType === 'video'
            ? 16 / 9
            : cached && cached !== 'loading'
              ? getAspectRatio(cached as CachedImage)
              : 1.5;
        const itemW = rowHeight * aspect;
        if (
          currentRowWidth + itemW + GAP > width - GAP &&
          currentRow.length > 0
        ) {
          const scale = (width - (currentRow.length + 1) * GAP) / currentRowWidth;
          let x = GAP;
          currentRow.forEach((item) => {
            item.w *= scale;
            item.h *= scale;
            item.x = x;
            item.y = y;
            x += item.w + GAP;
          });
          y += currentRow[0].h + GAP + textH;
          currentRow = [];
          currentRowWidth = 0;
        }
        const item: LayoutItem = {
          x: 0,
          y: 0,
          w: itemW,
          h: rowHeight,
          index: i
        };
        currentRow.push(item);
        layout.push(item);
        currentRowWidth += itemW;
      });
      let lx = GAP;
      currentRow.forEach((item) => {
        item.x = lx;
        item.y = y;
        lx += item.w + GAP;
      });
    }
    setLayoutData(layout);
  }, [filteredImages, settings.layout, settings.zoom, settings.showNames, containerWidth, containerHeight, rowHeight, textH, layoutVersion]);

  // Sections pour la timeline style Google Photos (date / lettre / taille selon tri)
  const timelineSections = useMemo(() => {
    if (filteredImages.length === 0 || layoutData.length === 0 || isPanoramaLayout) return [];
    const sortBy = settings.sortBy;
    const sections: { label: string; y: number }[] = [];
    const localeStr = locale.startsWith('zh') ? 'zh-CN' : locale;
    const formatDateMonth = (ts: number) => {
      const d = new Date(ts);
      return d.toLocaleDateString(localeStr, { month: 'short', year: 'numeric' });
    };
    const formatDateDay = (ts: number) => {
      const d = new Date(ts);
      return d.toLocaleDateString(localeStr, { day: 'numeric', month: 'short' });
    };
    const useDayGranularity = (() => {
      const ts = sortBy === 'ctime-desc' || sortBy === 'dateTaken-desc' ? (i: ImageData) => i.ctime : (i: ImageData) => i.mtime;
      const months = new Set(filteredImages.map((x) => new Date(ts(x)).toISOString().slice(0, 7)));
      return months.size <= 2;
    })();
    const formatSize = (bytes: number) => {
      if (bytes < 1024) return '<1 KB';
      if (bytes < 1024 * 1024) return '<1 MB';
      if (bytes < 10 * 1024 * 1024) return '1–10 MB';
      return '>10 MB';
    };
    let lastKey = '';
    filteredImages.forEach((img, i) => {
      const layout = layoutData[i];
      if (!layout) return;
      let key: string;
      let label: string;
      if (sortBy === 'mtime-desc' || sortBy === 'mtime-asc' || sortBy === 'ctime-desc' || sortBy === 'dateTaken-desc') {
        const ts = sortBy === 'ctime-desc' || sortBy === 'dateTaken-desc' ? img.ctime : img.mtime;
        const d = new Date(ts);
        const monthKey = d.toISOString().slice(0, 7);
        const dayKey = d.toISOString().slice(0, 10);
        key = useDayGranularity ? dayKey : monthKey;
        label = useDayGranularity ? formatDateDay(ts) : formatDateMonth(ts);
      } else if (sortBy === 'type-asc') {
        const ext = (img.path.split('.').pop() || '').toLowerCase();
        key = ext || '?';
        label = ext ? `.${ext}` : '?';
      } else if (sortBy === 'name-asc') {
        const c = (img.name[0] || '#').toUpperCase();
        key = /[A-Z0-9]/.test(c) ? c : '#';
        label = key;
      } else if (sortBy === 'size-desc') {
        key = formatSize(img.size);
        label = key;
      } else return;
      if (key !== lastKey) {
        lastKey = key;
        sections.push({ label, y: layout.y });
      }
    });
    return sections;
  }, [filteredImages, layoutData, settings.sortBy, isPanoramaLayout, locale]);

  // ResizeObserver + lecture initiale (responsive)
  useEffect(() => {
    const updateWidth = (w: number) => {
      setContainerWidth(w);
      setCompact(w < 800);
      setExtraCompact(w < 550);
    };
    const el = containerRef.current;
    if (!el) return;
    updateWidth(el.offsetWidth || el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        const w = rect.width || (entry.target as HTMLElement).offsetWidth;
        updateWidth(w);
      }
    });
    ro.observe(el);
    const onResize = () => {
      if (el) updateWidth(el.offsetWidth || el.getBoundingClientRect().width);
    };
    window.addEventListener('resize', onResize);
    const t = setTimeout(onResize, 100);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const main = galMainRef.current;
    if (!main) return;
    const updateHeight = () => {
      const h = main.getBoundingClientRect().height || main.offsetHeight;
      setContainerHeight(h);
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(main);
    return () => ro.disconnect();
  }, []);

  // Canvas render loop
  const canvasHeightRef = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      canvasHeightRef.current = rect.height;

      const isPanorama = isPanoramaLayout;
      let scrollVal = scrollRef.current;
      let scrollXVal = scrollRefX.current;
      if (!isDraggingRef.current) {
        if (isPanorama) {
          scrollXVal += (targetScrollX - scrollXVal) * 0.08;
          if (Math.abs(targetScrollX - scrollXVal) < 0.1) scrollXVal = targetScrollX;
          scrollRefX.current = scrollXVal;
        } else {
          scrollVal += (targetScroll - scrollVal) * 0.08;
          if (Math.abs(targetScroll - scrollVal) < 0.1) scrollVal = targetScroll;
          scrollRef.current = scrollVal;
        }
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const cache = cacheRef.current;

      // Mode diaporama : une seule image en grand (largeur = widget)
      if (isSlideshowActive && filteredImages.length > 0) {
        const idx = Math.min(slideshowIndex, filteredImages.length - 1);
        const imgData = filteredImages[idx];
        if (imgData) {
          const isGifOrVideo = imgData.mediaType === 'video' || isGif(imgData.path);
          if (!isGifOrVideo) {
            const cached = cache.get(imgData.path);
            if (!cached) {
              cache.set(imgData.path, 'loading');
              loadImage(imgData.url, imgData.path, (img) => {
                cache.set(imgData.path, img);
                setLayoutVersion((v) => v + 1);
              }, () => {
                cache.delete(imgData.path);
              }, api.getWorkerUrl());
            }
            if (cached === 'loading') {
              ctx.fillStyle = '#111';
              ctx.fillRect(0, 0, rect.width, rect.height);
              ctx.fillStyle = '#333';
              ctx.font = '14px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(t(locale, 'loading'), rect.width / 2, rect.height / 2);
            } else if (cached && cached !== 'loading') {
              const { w: iw, h: ih } = getImageDimensions(cached as CachedImage);
              const r = Math.min(rect.width / iw, rect.height / ih);
              const nw = iw * r;
              const nh = ih * r;
              const dx = (rect.width - nw) / 2;
              const dy = (rect.height - nh) / 2;
              ctx.drawImage(cached, dx, dy, nw, nh);
            }
          } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, rect.width, rect.height);
          }
        }
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      layoutData.forEach((layout, i) => {
        const x = isPanorama ? layout.x - scrollXVal : layout.x;
        const y = isPanorama ? layout.y : layout.y - scrollVal;
        if (isPanorama) {
          if (x + layout.w + 30 < 0 || x > rect.width) return;
        } else {
          if (y + layout.h + 30 < 0 || y > rect.height) return;
        }
        const imgData = filteredImages[i];
        if (!imgData) return;
        const cached = cache.get(imgData.path);
        const isSelected = selection.has(imgData.path);

        if (!cached && imgData.mediaType === 'image') {
          cache.set(imgData.path, 'loading');
          loadImage(imgData.url, imgData.path, (img) => {
            cache.set(imgData.path, img);
            setLayoutVersion((v) => v + 1);
          }, () => {
            cache.delete(imgData.path);
          }, api.getWorkerUrl());
        }
        if (!cached && imgData.mediaType === 'video') {
          cache.set(imgData.path, 'loading');
          loadVideoThumbnail(imgData.url, imgData.path, (img) => {
            cache.set(imgData.path, img);
            setLayoutVersion((v) => v + 1);
          }, () => {
            cache.delete(imgData.path);
          });
        }

        const w = layout.w;
        const h = layout.h;
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, w, h, 8);
        } else {
          ctx.rect(x, y, w, h);
        }
        ctx.clip();
        if (cached === 'loading') {
          ctx.fillStyle = '#111';
          ctx.fillRect(x, y, w, h);
        } else if (cached && cached !== 'loading') {
          const { w: iw, h: ih } = getImageDimensions(cached as CachedImage);
          const r = Math.max(w / iw, h / ih);
          const nw = iw * r;
          const nh = ih * r;
          ctx.drawImage(cached, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
        } else if (imgData.mediaType === 'video') {
          ctx.fillStyle = '#111';
          ctx.fillRect(x, y, w, h);
        } else if (imgData.mediaType === 'other') {
          // Draw a placeholder for "other" file types
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(x, y, w, h);
          // Draw file extension as text
          const ext = imgData.name.split('.').pop()?.toUpperCase() || 'FILE';
          ctx.fillStyle = '#6366f1';
          ctx.font = `bold ${Math.min(w / 4, 24)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ext.substring(0, 4), x + w / 2, y + h / 2);
        }
        ctx.restore();
        if (isSelected) {
          ctx.strokeStyle = isEditMode ? '#ff4444' : (getComputedStyle(canvasRef.current!).getPropertyValue('--gal-accent').trim() || '#0ea5e9');
          ctx.lineWidth = 4;
          ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
          ctx.fillStyle = 'rgba(0, 210, 255, 0.2)';
          ctx.fillRect(x, y, w, h);
        }
        if (settings.showNames) {
          ctx.fillStyle = '#fff';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          const displayName =
            imgData.name.length > 20
              ? imgData.name.substring(0, 17) + '...'
              : imgData.name;
          ctx.fillText(displayName, x + w / 2, y + h + 15);
        }
      });

      // Sync overlay scroll
      const oc = overlayContentRef.current;
      if (oc) {
        if (isPanorama) oc.style.transform = `translate(${-scrollXVal}px, 0)`;
        else oc.style.transform = `translate(0, ${-scrollVal}px)`;
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetScroll, targetScrollX, layoutData, filteredImages, selection, isEditMode, settings.showNames, settings.showTags, settings.layout, isSlideshowActive, slideshowIndex, tagManager]);

  // Clamp scroll (vertical ou horizontal en panorama)
  const clampScroll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (isPanoramaLayout) {
      const totalW = panoramaTotalWidthRef.current;
      const maxScrollX = Math.max(0, totalW - rect.width);
      setTargetScrollX((t) => Math.max(0, Math.min(t, maxScrollX)));
    } else {
      const last = layoutData[layoutData.length - 1];
      const maxScroll = last
        ? Math.max(0, last.y + last.h + GAP + textH - rect.height)
        : 0;
      setTargetScroll((t) => Math.max(0, Math.min(t, maxScroll)));
    }
  }, [layoutData, textH, settings.layout]);

  const canShowTimeline =
    !isPanoramaLayout &&
    !isSlideshowActive &&
    timelineSections.length >= 1 &&
    ['mtime-desc', 'mtime-asc', 'dateTaken-desc', 'ctime-desc', 'type-asc', 'name-asc', 'size-desc'].includes(settings.sortBy);

  const { maxScroll, totalContentHeight } = useMemo(() => {
    if (settings.layout === 'detail') {
      const max = Math.max(0, detailScrollInfo.scrollHeight - detailScrollInfo.clientHeight);
      return { maxScroll: max, totalContentHeight: Math.max(1, detailScrollInfo.scrollHeight) };
    }
    if (isPanoramaLayout || layoutData.length === 0) return { maxScroll: 0, totalContentHeight: 1 };
    const last = layoutData[layoutData.length - 1];
    if (!last) return { maxScroll: 0, totalContentHeight: 1 };
    const total = last.y + last.h + GAP + textH;
    const max = Math.max(0, total - (containerHeight || 400));
    return { maxScroll: max, totalContentHeight: total };
  }, [layoutData, textH, containerHeight, isPanoramaLayout, settings.layout, detailScrollInfo]);

  const handleTimelineZonePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!canShowTimeline || !galMainRef.current) return;
      const rect = galMainRef.current.getBoundingClientRect();
      const inRightZone = e.clientX >= rect.right - rect.width * 0.15;
      if (inRightZone) {
        if (timelineHideTimeoutRef.current) {
          clearTimeout(timelineHideTimeoutRef.current);
          timelineHideTimeoutRef.current = null;
        }
        setTimelineVisible(true);
      } else {
        if (!timelineHideTimeoutRef.current) {
          timelineHideTimeoutRef.current = setTimeout(() => {
            setTimelineVisible(false);
            timelineHideTimeoutRef.current = null;
          }, 400);
        }
      }
    },
    [canShowTimeline]
  );

  const handleTimelineZonePointerLeave = useCallback(() => {
    if (timelineHideTimeoutRef.current) {
      clearTimeout(timelineHideTimeoutRef.current);
      timelineHideTimeoutRef.current = null;
    }
    timelineHideTimeoutRef.current = setTimeout(() => {
      setTimelineVisible(false);
      timelineHideTimeoutRef.current = null;
    }, 500);
  }, []);

  const [timelineDragging, setTimelineDragging] = useState(false);
  const [timelineLabel, setTimelineLabel] = useState<{ text: string; top: number } | null>(null);

  const updateTimelineLabelFromY = useCallback(
    (clientY: number) => {
      const scrub = timelineScrubRef.current;
      if (!scrub || timelineSections.length === 0) return;
      const rect = scrub.getBoundingClientRect();
      const relY = (clientY - rect.top) / rect.height;
      const t = Math.max(0, Math.min(1, relY));
      const scrollAt = t * (totalContentHeight || 1);
      const idx = timelineSections.findIndex((s) => s.y > scrollAt);
      const section = idx <= 0 ? timelineSections[0] : timelineSections[idx - 1];
      if (section) setTimelineLabel({ text: section.label, top: clientY });
    },
    [timelineSections, totalContentHeight]
  );

  const onTimelineScrub = useCallback(
    (clientY: number) => {
      const scrub = timelineScrubRef.current;
      if (!scrub || maxScroll <= 0) return;
      const rect = scrub.getBoundingClientRect();
      const relY = (clientY - rect.top) / rect.height;
      const t = Math.max(0, Math.min(1, relY));
      const newScroll = t * maxScroll;
      if (settingsRef.current.layout === 'detail' && detailViewRef.current) {
        detailViewRef.current.scrollTop = newScroll;
      } else {
        setTargetScroll(newScroll);
        scrollRef.current = newScroll;
        clampScroll();
      }
      updateTimelineLabelFromY(clientY);
    },
    [maxScroll, clampScroll, updateTimelineLabelFromY]
  );

  const onTimelineScrubPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setTimelineDragging(true);
      onTimelineScrub(e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onTimelineScrub]
  );

  const onTimelineScrubPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons & 1) {
        onTimelineScrub(e.clientY);
      } else {
        updateTimelineLabelFromY(e.clientY);
      }
    },
    [onTimelineScrub, updateTimelineLabelFromY]
  );

  const onTimelineScrubPointerUp = useCallback(() => {
    setTimelineDragging(false);
  }, []);

  const onTimelineScrubPointerLeave = useCallback(() => {
    setTimelineDragging(false);
    setTimelineLabel(null);
  }, []);

  const onSlideshowInterrupt = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isSlideshowActive) {
      setIsSlideshowActive(false);
      setSettings((s) => ({ ...s, slideshowIntervalSec: 0 }));
      api.saveWidgetState(stateId, { settings: { ...settingsRef.current, slideshowIntervalSec: 0 } });
    }
    setSlideshowCountdown(0);
  }, [isSlideshowActive, api, stateId]);

  // Canvas pointer handlers (seul le clic interrompt le diaporama, pas le mouvement)
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      onSlideshowInterrupt();
      if (e.button !== 0) return;
      e.stopPropagation();
      isPointerDownRef.current = true;
      startYRef.current = e.clientY;
      startXRef.current = e.clientX;
      startScrollRef.current = targetScroll;
      startScrollXRef.current = targetScrollX;
      hasMovedRef.current = false;
      isDraggingRef.current = false;
      lastYRef.current = e.clientY;
      lastTimeRef.current = performance.now();
      velocityRef.current = 0;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    },
    [targetScroll, targetScrollX, onSlideshowInterrupt]
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPointerDownRef.current || (e.buttons & 1) === 0) {
        isPointerDownRef.current = false;
        isDraggingRef.current = false;
        return;
      }
      e.stopPropagation();
      const isPanorama = isPanoramaLayout;
      const delta = isPanorama ? e.clientX - startXRef.current : e.clientY - startYRef.current;
      if (Math.abs(delta) > 8) hasMovedRef.current = true;
      if (hasMovedRef.current) {
        isDraggingRef.current = true;
        const now = performance.now();
        const dt = now - lastTimeRef.current;
        if (dt > 0 && !isPanorama) {
          velocityRef.current =
            velocityRef.current * 0.7 +
            ((lastYRef.current - e.clientY) / dt) * 0.3;
        }
        lastYRef.current = e.clientY;
        lastTimeRef.current = now;
        if (isPanorama) {
          const newScrollX = startScrollXRef.current - delta;
          setTargetScrollX(newScrollX);
          scrollRefX.current = newScrollX;
        } else {
          const newScroll = startScrollRef.current - delta;
          setTargetScroll(newScroll);
          scrollRef.current = newScroll;
        }
        clampScroll();
      }
    },
    [clampScroll, settings.layout]
  );

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isPointerDownRef.current) {
        return;
      }
      e.stopPropagation();
      const target = e.target as HTMLCanvasElement;
      target.releasePointerCapture(e.pointerId);
      isPointerDownRef.current = false;
      isDraggingRef.current = false;
      if (!hasMovedRef.current) {
        const rect = target.getBoundingClientRect();
        const isPanorama = isPanoramaLayout;
        const mx = e.clientX - rect.left + (isPanorama ? scrollRefX.current : 0);
        const my = e.clientY - rect.top + (isPanorama ? 0 : scrollRef.current);
        const hit = layoutData.find(
          (l) =>
            mx >= l.x &&
            mx <= l.x + l.w &&
            my >= l.y &&
            my <= l.y + l.h
        );
        if (hit) {
          const idx = layoutData.indexOf(hit);
          const img = filteredImages[idx];
          if (!img) return;
          if (e.button === 2) {
            console.log('[PhotoGallery] Right-click detected, isEditMode:', isEditMode);
            if (isEditMode) {
              // En mode édition, afficher le menu contextuel
              const paths = selection.size > 0 && selection.has(img.path) 
                ? Array.from(selection)
                : [img.path];
              console.log('[PhotoGallery] Showing context menu for paths:', paths);
              setContextMenu({ x: e.clientX, y: e.clientY, paths });
              return;
            } else {
              // Hors mode édition, ouvrir le lightbox
              console.log('[PhotoGallery] Opening lightbox');
              setLightboxIndex(idx);
              setLightboxOpen(true);
            }
            return;
          }
          if (e.button === 0) {
            if (e.ctrlKey) {
              setIsEditMode(true);
              setSelection(new Set([img.path]));
              lastSelectedIndexRef.current = idx;
            } else if (e.shiftKey && isEditMode) {
              const anchor = lastSelectedIndexRef.current >= 0 ? lastSelectedIndexRef.current : idx;
              const lo = Math.min(anchor, idx);
              const hi = Math.max(anchor, idx);
              const paths = new Set<string>();
              for (let k = lo; k <= hi; k++) {
                const m = filteredImages[k];
                if (m) paths.add(m.path);
              }
              setSelection(paths);
            } else if (isEditMode) {
              setSelection((prev) => {
                const next = new Set(prev);
                if (next.has(img.path)) next.delete(img.path);
                else next.add(img.path);
                return next;
              });
              lastSelectedIndexRef.current = idx;
            }
          }
        }
      } else {
        if (!isPanoramaLayout && Math.abs(velocityRef.current) > 0.1) {
          setTargetScroll((t) => t + velocityRef.current * 350);
        }
        clampScroll();
      }
    },
    [layoutData, filteredImages, isEditMode, clampScroll, settings.layout]
  );

  // Wheel + touch pinch sur gal-main (scroll + zoom tactile)
  const pinchZoomRef = useRef<{ initialZoom: number; initialDist: number } | null>(null);
  useEffect(() => {
    const el = galMainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // In detail mode, let native scrolling work (except ctrl+wheel for zoom)
      if (settingsRef.current.layout === 'detail') {
        if (e.ctrlKey) {
          e.preventDefault();
          const factor = e.deltaY > 0 ? -1 : 1;
          setSettings((s) => ({
            ...s,
            zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomMultiply(s.zoom, factor)))
          }));
          saveState(false);
        }
        return;
      }
      e.preventDefault();
      lastActivityRef.current = Date.now();
      if (e.ctrlKey) {
        const factor = e.deltaY > 0 ? -1 : 1;
        setSettings((s) => ({
          ...s,
          zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomMultiply(s.zoom, factor)))
        }));
        saveState(false);
      } else if (isPanoramaLayout) {
        setTargetScrollX((v) => v + e.deltaY);
        clampScroll();
      } else {
        setTargetScroll((v) => v + e.deltaY);
        clampScroll();
      }
    };
    const dist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const onTouchStart = (e: TouchEvent) => {
      lastActivityRef.current = Date.now();
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchZoomRef.current = {
          initialZoom: settingsRef.current.zoom,
          initialDist: dist(e.touches[0], e.touches[1])
        };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchZoomRef.current) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const ratio = d / pinchZoomRef.current.initialDist;
        const level = zoomToLevel(pinchZoomRef.current.initialZoom);
        const newLevel = level + (ratio - 1) * 200;
        const newZoom = levelToZoom(Math.max(0, Math.min(1000, newLevel)));
        setSettings((s) => ({ ...s, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom)) }));
      }
    };
    const onTouchEndClean = () => { pinchZoomRef.current = null; };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEndClean);
    el.addEventListener('touchcancel', onTouchEndClean);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEndClean);
      el.removeEventListener('touchcancel', onTouchEndClean);
    };
  }, [clampScroll, saveState, settings.layout]);

  layoutDataRef.current = layoutData;
  slideshowIndexRef.current = slideshowIndex;
  isSlideshowActiveRef.current = isSlideshowActive;

  // Compte à rebours 5s avant de lancer le diaporama
  useEffect(() => {
    if (slideshowCountdown <= 0) return;
    const id = setInterval(() => {
      setSlideshowCountdown((c) => {
        if (c <= 1) {
          isSlideshowActiveRef.current = true;
          setIsSlideshowActive(true);
          const randomIdx = layoutDataRef.current.length > 0 ? Math.floor(Math.random() * layoutDataRef.current.length) : 0;
          setSlideshowIndex(randomIdx);
          slideshowIndexRef.current = randomIdx;
          if (layoutDataRef.current.length > 0 && layoutDataRef.current[randomIdx]) setTargetScroll(Math.max(0, layoutDataRef.current[randomIdx].y - GAP));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    countdownIntervalRef.current = id;
    return () => {
      clearInterval(id);
      countdownIntervalRef.current = null;
    };
  }, [slideshowCountdown]);

  // Inactivité → activer diaporama après N secondes (une seule fois, pas à chaque tick)
  useEffect(() => {
    const ms = (settings.slideshowInactivitySec || 10) * 1000;
    const interval = setInterval(() => {
      if (settings.slideshowIntervalSec <= 0) return;
      if (isSlideshowActiveRef.current) return; // déjà en diaporama, ne pas réinitialiser
      if (Date.now() - lastActivityRef.current >= ms) {
        isSlideshowActiveRef.current = true;
        setIsSlideshowActive(true);
        const randomIdx = layoutDataRef.current.length > 0 ? Math.floor(Math.random() * layoutDataRef.current.length) : 0;
        setSlideshowIndex(randomIdx);
        slideshowIndexRef.current = randomIdx;
        const layout = layoutDataRef.current;
        if (layout.length > 0 && layout[randomIdx]) setTargetScroll(Math.max(0, layout[randomIdx].y - GAP));
      }
    }, 1000);
    inactivityCheckRef.current = interval;
    return () => {
      clearInterval(interval);
      inactivityCheckRef.current = null;
    };
  }, [settings.slideshowInactivitySec, settings.slideshowIntervalSec]);

  // Diaporama : avancer l'index et scroller toutes les N secondes
  useEffect(() => {
    if (!isSlideshowActive || settings.slideshowIntervalSec <= 0) {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
        slideshowIntervalRef.current = null;
      }
      return;
    }
    const ms = settings.slideshowIntervalSec * 1000;
    const id = setInterval(() => {
      const layout = layoutDataRef.current;
      if (layout.length === 0) return;
      const current = slideshowIndexRef.current;
      const next =
        layout.length <= 1
          ? 0
          : (() => {
              let r = Math.floor(Math.random() * layout.length);
              return r === current ? (r + 1) % layout.length : r;
            })();
      slideshowIndexRef.current = next;
      setSlideshowIndex(next);
      const item = layout[next];
      if (item) setTargetScroll(Math.max(0, item.y - GAP));
    }, ms);
    slideshowIntervalRef.current = id;
    return () => {
      clearInterval(id);
      slideshowIntervalRef.current = null;
    };
  }, [isSlideshowActive, settings.slideshowIntervalSec]);

  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const isPanorama = isPanoramaLayout;
      const mx = e.clientX - rect.left + (isPanorama ? scrollRefX.current : 0);
      const my = e.clientY - rect.top + (isPanorama ? 0 : scrollRef.current);
      const hit = layoutData.find(
        (l) =>
          mx >= l.x && mx <= l.x + l.w && my >= l.y && my <= l.y + l.h
      );
      if (hit) {
        const idx = layoutData.indexOf(hit);
        setLightboxIndex(idx);
        setLightboxOpen(true);
      }
    },
    [layoutData, settings.layout]
  );

  const onCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Lightbox
  const currentImage = filteredImages[lightboxIndex];
  const closeLightbox = useCallback(() => {
    if (lbUiHideTimeoutRef.current) {
      clearTimeout(lbUiHideTimeoutRef.current);
      lbUiHideTimeoutRef.current = null;
    }
    lbPointerDownRef.current = false;
    lbDraggingRef.current = false;
    setLightboxOpen(false);
    setLightboxEmbed(null);
    setLbZoom(1);
    setLbPan({ x: 0, y: 0 });
    lbZoomRef.current = 1;
    lbXRef.current = 0;
    lbYRef.current = 0;
  }, []);

  const scheduleLbUiHide = useCallback(() => {
    if (lbUiHideTimeoutRef.current) clearTimeout(lbUiHideTimeoutRef.current);
    setLbUiVisible(true);
    lbUiHideTimeoutRef.current = setTimeout(() => {
      lbUiHideTimeoutRef.current = null;
      setLbUiVisible(false);
    }, 5000);
  }, []);

  const onLbPointerMoveForUi = useCallback(() => {
    scheduleLbUiHide();
  }, [scheduleLbUiHide]);

  useEffect(() => {
    if (!lightboxOpen) return;
    setLbUiVisible(true);
    if (lbUiHideTimeoutRef.current) clearTimeout(lbUiHideTimeoutRef.current);
    lbUiHideTimeoutRef.current = setTimeout(() => {
      lbUiHideTimeoutRef.current = null;
      setLbUiVisible(false);
    }, 5000);
    return () => {
      if (lbUiHideTimeoutRef.current) {
        clearTimeout(lbUiHideTimeoutRef.current);
        lbUiHideTimeoutRef.current = null;
      }
    };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        scheduleLbUiHide();
        setLightboxIndex((i) => (i <= 0 ? filteredImages.length - 1 : i - 1));
        setLbZoom(1);
        setLbPan({ x: 0, y: 0 });
      }
      if (e.key === 'ArrowRight') {
        scheduleLbUiHide();
        setLightboxIndex((i) =>
          i >= filteredImages.length - 1 ? 0 : i + 1
        );
        setLbZoom(1);
        setLbPan({ x: 0, y: 0 });
      }
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, filteredImages.length, closeLightbox, scheduleLbUiHide]);

  // Diaporama : flèches clavier gauche/droite pour naviguer
  useEffect(() => {
    if (!isSlideshowActive || filteredImages.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const layout = layoutDataRef.current;
      const current = slideshowIndexRef.current;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        lastActivityRef.current = Date.now();
        const next = (current - 1 + filteredImages.length) % filteredImages.length;
        slideshowIndexRef.current = next;
        setSlideshowIndex(next);
        if (layout[next]) setTargetScroll(Math.max(0, layout[next].y - GAP));
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        lastActivityRef.current = Date.now();
        const next = (current + 1) % filteredImages.length;
        slideshowIndexRef.current = next;
        setSlideshowIndex(next);
        if (layout[next]) setTargetScroll(Math.max(0, layout[next].y - GAP));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSlideshowActive, filteredImages.length]);

  const KEY_SCROLL_STEP = 80;

  // Touche Échap pour sortir du mode édition (priorité à la lightbox si ouverte)
  useEffect(() => {
    if (!isEditMode || lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsEditMode(false);
        setSelection(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditMode, lightboxOpen]);

  // Galerie : flèches directionnelles pour défiler (smooth, sans lightbox/diapo)
  useEffect(() => {
    if (lightboxOpen || isSlideshowActive) return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;
      e.preventDefault();
      lastActivityRef.current = Date.now();
      const isPanorama = isPanoramaLayout;
      if (isPanorama) {
        const deltaX = key === 'ArrowLeft' || key === 'ArrowUp' ? KEY_SCROLL_STEP : key === 'ArrowRight' || key === 'ArrowDown' ? -KEY_SCROLL_STEP : 0;
        if (deltaX) setTargetScrollX((t) => t + deltaX);
      } else {
        const deltaY = key === 'ArrowUp' || key === 'ArrowLeft' ? -KEY_SCROLL_STEP : key === 'ArrowDown' || key === 'ArrowRight' ? KEY_SCROLL_STEP : 0;
        if (deltaY) setTargetScroll((t) => t + deltaY);
      }
      clampScroll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, isSlideshowActive, settings.layout, clampScroll]);

  const lbHasMovedRef = useRef(false);

  // Limiter le pan de la lightbox pour que l'image reste visible
  const clampLbPan = useCallback((pan: { x: number; y: number }, zoom: number, imgW: number, imgH: number, viewW: number, viewH: number) => {
    if (zoom <= 1) return { x: 0, y: 0 };
    const scaledW = imgW * zoom;
    const scaledH = imgH * zoom;
    const maxX = Math.max(0, (scaledW - viewW) / 2);
    const maxY = Math.max(0, (scaledH - viewH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, pan.x)),
      y: Math.max(-maxY, Math.min(maxY, pan.y))
    };
  }, []);

  // Lightbox : pan par drag (gauche uniquement, ne démarre que si mouvement)
  const onLbPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    lbPointerDownRef.current = true;
    lbHasMovedRef.current = false;
    lbStartXRef.current = e.clientX;
    lbStartYRef.current = e.clientY;
    lbStartPanRef.current = lbPan;
  }, [lbPan]);
  const onLbPointerMove = useCallback((e: React.PointerEvent) => {
    if (!lbPointerDownRef.current) return;
    if ((e.buttons & 1) === 0) {
      lbPointerDownRef.current = false;
      lbDraggingRef.current = false;
      setLbDragging(false);
      return;
    }
    if (lbDraggingRef.current) {
      const dx = e.clientX - lbStartXRef.current;
      const dy = e.clientY - lbStartYRef.current;
      const newPan = {
        x: lbStartPanRef.current.x + dx,
        y: lbStartPanRef.current.y + dy
      };
      // Récupérer les dimensions de l'image actuelle pour clamper
      if (currentImage && lightboxViewerRef.current) {
        const cached = cacheRef.current.get(currentImage.path);
        if (cached && cached !== 'loading') {
          const { w: imgW, h: imgH } = getImageDimensions(cached as CachedImage);
          const viewRect = lightboxViewerRef.current.getBoundingClientRect();
          const clamped = clampLbPan(newPan, lbZoomRef.current, imgW, imgH, viewRect.width, viewRect.height);
          setLbPan(clamped);
        } else {
          setLbPan(newPan);
        }
      } else {
        setLbPan(newPan);
      }
      return;
    }
    if (!lbHasMovedRef.current && (Math.abs(e.clientX - lbStartXRef.current) > 5 || Math.abs(e.clientY - lbStartYRef.current) > 5)) {
      lbHasMovedRef.current = true;
      lbDraggingRef.current = true;
      setLbDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [clampLbPan, currentImage]);
  const onLbPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    lbPointerDownRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    lbDraggingRef.current = false;
    setLbDragging(false);
  }, []);
  const onLbPointerCancel = useCallback((e: React.PointerEvent) => {
    lbPointerDownRef.current = false;
    lbDraggingRef.current = false;
    setLbDragging(false);
  }, []);

  // Lightbox : zoom molette + pinch tactile
  const lbPinchRef = useRef<{ initialZoom: number; initialDist: number } | null>(null);
  useEffect(() => {
    if (!lightboxOpen) return;
    const el = lightboxViewerRef.current;
    if (!el) return;
    const dist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setLbZoom((z) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(1, Math.min(5, z + delta));
        // Clamper le pan avec le nouveau zoom
        if (currentImage && el) {
          const cached = cacheRef.current.get(currentImage.path);
          if (cached && cached !== 'loading') {
            const { w: imgW, h: imgH } = getImageDimensions(cached as CachedImage);
            const viewRect = el.getBoundingClientRect();
            const clamped = clampLbPan(lbPan, newZoom, imgW, imgH, viewRect.width, viewRect.height);
            if (clamped.x !== lbPan.x || clamped.y !== lbPan.y) {
              setLbPan(clamped);
            }
          }
        }
        return newZoom;
      });
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lbPinchRef.current = { initialZoom: lbZoomRef.current, initialDist: dist(e.touches[0], e.touches[1]) };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lbPinchRef.current) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const ratio = d / lbPinchRef.current.initialDist;
        const z = lbPinchRef.current.initialZoom * ratio;
        const newZoom = Math.max(1, Math.min(5, z));
        setLbZoom(newZoom);
        // Clamper le pan avec le nouveau zoom
        if (currentImage && el) {
          const cached = cacheRef.current.get(currentImage.path);
          if (cached && cached !== 'loading') {
            const { w: imgW, h: imgH } = getImageDimensions(cached as CachedImage);
            const viewRect = el.getBoundingClientRect();
            const clamped = clampLbPan(lbPan, newZoom, imgW, imgH, viewRect.width, viewRect.height);
            if (clamped.x !== lbPan.x || clamped.y !== lbPan.y) {
              setLbPan(clamped);
            }
          }
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => { 
      lbPinchRef.current = null;
      
      // Double-tap detection for zoom toggle
      if (e.changedTouches.length === 1 && !lbPinchRef.current) {
        const touch = e.changedTouches[0];
        const now = Date.now();
        const lastTap = lastTapRef.current;
        
        if (lastTap && now - lastTap.time < 300) {
          // Check if the taps are close together (within 50px)
          const dist = Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y);
          if (dist < 50) {
            // Double-tap detected! Toggle zoom
            e.preventDefault();
            
            if (lbZoomRef.current > 1) {
              // If zoomed, reset to 1
              setLbZoom(1);
              setLbPan({ x: 0, y: 0 });
            } else {
              // If not zoomed, zoom to 2.5x centered on tap position
              const newZoom = 2.5;
              setLbZoom(newZoom);
              
              // Calculate pan to center on tap point
              if (currentImage && el) {
                const viewRect = el.getBoundingClientRect();
                const centerX = viewRect.width / 2;
                const centerY = viewRect.height / 2;
                const tapX = touch.clientX - viewRect.left;
                const tapY = touch.clientY - viewRect.top;
                
                // Pan to make tap point stay under finger
                const panX = (centerX - tapX) * (newZoom - 1) / newZoom;
                const panY = (centerY - tapY) * (newZoom - 1) / newZoom;
                
                const cached = cacheRef.current.get(currentImage.path);
                if (cached && cached !== 'loading') {
                  const { w: imgW, h: imgH } = getImageDimensions(cached as CachedImage);
                  const clamped = clampLbPan({ x: panX, y: panY }, newZoom, imgW, imgH, viewRect.width, viewRect.height);
                  setLbPan(clamped);
                }
              }
            }
            
            lastTapRef.current = null;
            return;
          }
        }
        
        // Store this tap for potential double-tap
        lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [lightboxOpen, currentImage, lbPan, clampLbPan]);

  // PIP event listeners
  useEffect(() => {
    const video = lightboxVideoRef.current;
    if (!video) return;
    
    const onEnterPip = () => setIsPipActive(true);
    const onLeavePip = () => setIsPipActive(false);
    
    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);
    
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, [lightboxOpen, currentImage]);

  // Folders list for popup
  const foldersList = useMemo(() => {
    if (!app?.vault) return [];
    const files = app.vault.getFiles();
    const folders = new Set<string>();
    files.forEach((f) => {
      const parts = f.path.split('/');
      if (parts.length > 1) folders.add(parts.slice(0, -1).join('/'));
    });
    let list = Array.from(folders).sort((a, b) => {
      const aSel = settings.folders.includes(a) ? 1 : 0;
      const bSel = settings.folders.includes(b) ? 1 : 0;
      return bSel - aSel || a.localeCompare(b);
    });
    if (folderSearch)
      list = list.filter((f) => f.toLowerCase().includes(folderSearch));
    return list;
  }, [app, settings.folders, folderSearch]);

  if (!app) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
        {t(locale, 'vaultUnavailable')}
      </div>
    );
  }

  const cycleLayout = useCallback(() => {
    const order: Array<'square' | 'justified' | 'detail' | 'panorama-square' | 'panorama-justified'> = ['justified', 'square', 'detail', 'panorama-square', 'panorama-justified'];
    const idx = order.indexOf(settings.layout);
    const next = order[(idx + 1) % order.length];
    setSettings((s) => ({ ...s, layout: next }));
    saveState(true);
  }, [settings.layout, saveState]);

  const cycleSlideshowDuration = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    const current = settings.slideshowIntervalSec;
    const idx = (SLIDESHOW_OPTIONS as readonly number[]).indexOf(current);
    const nextIdx = idx < 0 ? 0 : (idx + 1) % SLIDESHOW_OPTIONS.length;
    const next = SLIDESHOW_OPTIONS[nextIdx];
    setSettings((s) => ({ ...s, slideshowIntervalSec: next }));
    saveState(true);
    setSlideshowCountdown(next > 0 ? 5 : 0);
  }, [settings.slideshowIntervalSec, saveState]);

  const formatDuration = (sec: number) =>
    sec === 0 ? 'OFF' : sec >= 60 ? `${Math.round(sec / 60)}min` : `${sec}s`;
  const slideshowDurationLabel = formatDuration(settings.slideshowIntervalSec);

  const scheduleToolbarHide = useCallback(() => {
    if (toolbarHideTimeoutRef.current) {
      clearTimeout(toolbarHideTimeoutRef.current);
      toolbarHideTimeoutRef.current = null;
    }
    if ((settings.toolbarPinned ?? false)) return;
    toolbarHideTimeoutRef.current = setTimeout(() => {
      toolbarHideTimeoutRef.current = null;
      setToolbarVisible(false);
    }, 10000);
  }, [settings.toolbarPinned]);

  const cancelToolbarHide = useCallback(() => {
    if (toolbarHideTimeoutRef.current) {
      clearTimeout(toolbarHideTimeoutRef.current);
      toolbarHideTimeoutRef.current = null;
    }
  }, []);

  const onToolbarPointerEnter = useCallback(() => {
    setToolbarVisible(true);
    cancelToolbarHide();
  }, [cancelToolbarHide]);

  const onToolbarPointerLeave = useCallback(() => {
    scheduleToolbarHide();
  }, [scheduleToolbarHide]);

  useEffect(() => {
    if (settings.toolbarPinned) {
      cancelToolbarHide();
      setToolbarVisible(true);
    }
    return () => cancelToolbarHide();
  }, [settings.toolbarPinned, cancelToolbarHide]);

  const scrollToTop = useCallback(() => {
    scrollRef.current = 0;
    scrollRefX.current = 0;
    setTargetScroll(0);
    setTargetScrollX(0);
  }, []);

  const onHeaderBarClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Node;
      if (target instanceof Element && target.closest('button, input, select, label')) return;
      scrollToTop();
    },
    [scrollToTop]
  );

  return (
    <div
      ref={containerRef}
      className="gal-container"
      style={{ fontFamily: 'var(--font-interface)' }}
    >
      <style>{`
        .gal-container, .gal-portal-root { --gal-bg: var(--background-primary); --gal-header: var(--background-secondary); --gal-accent: var(--interactive-accent); --gal-text: var(--text-normal); --gal-muted: var(--text-muted); --gal-border: var(--background-modifier-border); }
        .gal-container { position: relative; overflow: hidden; background: var(--gal-bg); border-radius: 8px; }
        .gal-container:fullscreen, .gal-container:-webkit-full-screen, .gal-container:-moz-full-screen, .gal-container:-ms-fullscreen { width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; inset: 0 !important; z-index: 999999 !important; }
        .gal-container:fullscreen .gal-header, .gal-container:-webkit-full-screen .gal-header, .gal-container:-moz-full-screen .gal-header { z-index: 1000001 !important; }
        .gal-header { padding: 10px 14px; background: var(--gal-header); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; border-bottom: 1px solid var(--gal-border); z-index: 10; gap: 8px; flex-shrink: 0; min-height: 52px; cursor: pointer; }
        .gal-main { flex: 1; display: flex; position: relative; overflow: hidden; background: #000; min-height: 0; transition: height 0.2s ease-out; touch-action: none; -webkit-user-select: none; user-select: none; }
        .gal-zoom-slider { cursor: pointer; width: 120px; accent-color: var(--gal-accent); }
        .gal-canvas { flex: 1; width: 100%; height: 100%; cursor: default; touch-action: none; -ms-touch-action: none; }
        .gal-canvas:active { cursor: grabbing; }
        .gal-btn { background: none; border: none; color: var(--gal-muted); cursor: pointer; padding: 6px 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; min-width: 36px; min-height: 36px; }
        .gal-btn:hover { background: var(--background-modifier-hover); color: var(--gal-text); }
        .gal-btn.active { background: var(--gal-accent); color: white; }
        .gal-popup { position: absolute; top: 100%; left: 0; margin-top: 8px; width: 280px; background: var(--gal-bg); border: 1px solid var(--gal-border); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; }
        .gal-search-dropdown { width: 220px; }
        .gal-popup-folder { left: auto; right: 0; }
        .gal-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.98); z-index: 10000; display: flex; flex-direction: column; overflow: hidden; }
        .gal-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; z-index: 200; justify-content: center; align-items: center; }
        .gal-note-modal-overlay { position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; padding: 24px; box-sizing: border-box; }
        .gal-edit-toolbar { min-height: 40px; }
        .gal-edit-toolbar-btn { flex-shrink: 0; white-space: nowrap; background: var(--gal-accent); color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: opacity 0.2s; }
        .gal-edit-toolbar-btn:hover { opacity: 0.9; }
        .gal-edit-toolbar-btn-danger:hover { background: #dc2626; }
        .gal-folder-checked { background: rgba(var(--interactive-accent-rgb), 0.1); color: var(--gal-accent); font-weight: 600; }
        .gal-sort-opt { width: 100%; text-align: left; padding: 6px 10px; font-size: 13px; border-radius: 4px; cursor: pointer; border: none; background: none; color: var(--gal-text); transition: background 0.15s; }
        .gal-sort-opt:hover { background: var(--background-modifier-hover); }
        .gal-sort-opt-active { color: var(--gal-accent); font-weight: 600; background: rgba(var(--interactive-accent-rgb), 0.12); }
        .gal-btn.gal-filter-active { color: var(--gal-accent); box-shadow: inset 0 0 0 1px rgba(var(--interactive-accent-rgb), 0.4); }
        .gal-btn.gal-filter-active:hover { color: var(--gal-accent); }
        .gal-folder-item:hover { background: var(--background-modifier-hover); }
        .gal-folder-list { max-height: min(30vh, calc(100vh - 260px)); overflow-y: auto; padding: 4px; }
        .gal-lightbox-close { position: absolute; top: 16px; right: 16px; z-index: 101; width: 44px; height: 44px; border-radius: 50%; background: rgba(0,0,0,0.5); color: white; border: none; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .gal-lightbox-close:hover { background: rgba(0,0,0,0.7); }
        .gal-lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 102; width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.4); color: rgba(255,255,255,0.9); border: none; font-size: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; pointer-events: auto; }
        .gal-lightbox-nav:hover { background: rgba(255,255,255,0.25); color: white; }
        .gal-lightbox-nav-prev { left: 16px; }
        .gal-lightbox-btn-delete { background: rgba(239,68,68,0.6); color: white; }
        .gal-lightbox-btn-delete:hover { background: rgba(239,68,68,0.9); }
        .gal-lightbox-nav-next { right: 16px; }
        .gal-lightbox-viewer-wrap { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; min-height: 0; z-index: 1; touch-action: none; }
        .gal-lightbox-ui { transition: opacity 0.3s ease; }
        .gal-lightbox-ui.gal-lightbox-ui-hidden { opacity: 0; pointer-events: none; }
        .gal-note-modal-box { background: var(--gal-bg); width: min(400px, calc(100vw - 48px)); max-width: calc(100vw - 48px); height: min(55vh, calc(100vh - 100px)); max-height: calc(100vh - 100px); min-width: 280px; min-height: 180px; border-radius: 12px; border: 1px solid var(--gal-border); box-shadow: 0 20px 50px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column; }
        .gal-note-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; border: 1px solid var(--gal-border); border-radius: 6px; }
        .gal-note-item { width: 100%; text-align: left; padding: 8px 10px; font-size: 13px; border: none; border-bottom: 1px solid var(--gal-border); background: none; cursor: pointer; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
        .gal-note-item:hover { background: var(--background-modifier-hover); }
        .gal-note-item:last-child { border-bottom: none; }
        .gal-note-item-name { font-weight: 500; color: var(--gal-text); }
        .gal-note-item-path { font-size: 11px; color: var(--gal-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .gal-slideshow-icon { position: relative; }
        .gal-slideshow-badge { position: absolute; top: 2px; right: 2px; font-size: 10px; font-weight: 700; min-width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; background: var(--gal-accent); color: white; border-radius: 7px; padding: 0 3px; }
        .gal-slideshow-duration { position: absolute; bottom: 0; left: 0; font-size: 9px; font-weight: 600; color: inherit; white-space: nowrap; line-height: 1; }
        .gal-media-overlay { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .gal-media-overlay-content { position: absolute; top: 0; left: 0; will-change: transform; pointer-events: none; }
        .gal-media-overlay-item { position: absolute; overflow: hidden; border-radius: 8px; object-fit: cover; pointer-events: auto; }
        .gal-timeline-zone { position: absolute; right: 0; top: 0; bottom: 0; width: 15%; pointer-events: none; }
        .gal-timeline-scrub { position: absolute; right: 6px; top: 12px; bottom: 12px; width: 72px; display: flex; flex-direction: row; align-items: stretch; pointer-events: auto; opacity: 0; transition: opacity 0.25s ease; z-index: 15; }
        .gal-timeline-scrub.gal-timeline-visible { opacity: 1; }
        .gal-timeline-track { flex: 1; width: 4px; min-width: 4px; background: rgba(255,255,255,0.25); border-radius: 2px; position: relative; cursor: pointer; min-height: 80px; }
        .gal-timeline-track:hover { background: rgba(255,255,255,0.4); }
        .gal-timeline-thumb { position: absolute; left: 50%; transform: translate(-50%, -50%); width: 10px; height: 10px; background: var(--gal-accent); border-radius: 50%; transition: transform 0.15s ease; pointer-events: none; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .gal-timeline-scrub.gal-timeline-dragging .gal-timeline-thumb { transform: translate(-50%, -50%) scale(1.3); }
        .gal-timeline-markers { position: absolute; left: -56px; right: 8px; top: 0; bottom: 0; pointer-events: none; }
        .gal-timeline-marker { position: absolute; right: 0; transform: translateY(-50%); display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
        .gal-timeline-marker-dot { width: 5px; height: 5px; background: rgba(255,255,255,0.6); border-radius: 50%; flex-shrink: 0; }
        .gal-timeline-marker-label { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.95); white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.5); max-width: 56px; overflow: hidden; text-overflow: ellipsis; }
        .gal-timeline-label { position: fixed; right: 36px; transform: translateY(-50%); padding: 6px 12px; background: rgba(0,0,0,0.8); color: white; font-size: 13px; font-weight: 500; border-radius: 6px; pointer-events: none; z-index: 200; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: opacity 0.15s ease; }
        .gal-toolbar-wrap { position: relative; flex-shrink: 0; overflow: hidden; transition: max-height 0.25s ease-out, opacity 0.2s ease; }
        .gal-toolbar-hover-zone { position: absolute; top: 0; left: 0; right: 0; height: 12px; background: var(--gal-header); border-bottom: 1px solid var(--gal-border); z-index: 12; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .gal-toolbar-hover-zone::after { content: ''; width: 24px; height: 4px; background: var(--gal-muted); border-radius: 2px; opacity: 0.6; }
      `}</style>

      {/* Header (masqué en mode diaporama) */}
      {!isSlideshowActive && (
      <div
        className="gal-toolbar-wrap"
        style={{ maxHeight: toolbarVisible ? 200 : 12, minHeight: 12 }}
      >
        {toolbarVisible ? (
      <div
        className="gal-header"
        onClick={onHeaderBarClick}
        role="presentation"
        onPointerEnter={onToolbarPointerEnter}
        onPointerLeave={onToolbarPointerLeave}
      >
          {compact ? (
            <button
              type="button"
              className={`gal-btn ${settings.layout !== 'justified' ? 'active' : ''}`}
              title={t(locale, 'layoutCycle')}
              onClick={cycleLayout}
            >
              {settings.layout === 'square' && (
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <rect x={3} y={3} width={7} height={7} />
                  <rect x={14} y={3} width={7} height={7} />
                  <rect x={3} y={14} width={7} height={7} />
                  <rect x={14} y={14} width={7} height={7} />
                </svg>
              )}
              {settings.layout === 'justified' && (
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <rect x={3} y={3} width={18} height={7} />
                  <rect x={3} y={14} width={10} height={7} />
                  <rect x={15} y={14} width={6} height={7} />
                </svg>
              )}
              {settings.layout === 'detail' && (
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1={3} y1={6} x2={21} y2={6} />
                  <line x1={3} y1={12} x2={21} y2={12} />
                  <line x1={3} y1={18} x2={21} y2={18} />
                </svg>
              )}
              {isPanoramaLayout && (
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <rect x={1} y={5} width={6} height={14} rx={1} />
                  <rect x={9} y={5} width={6} height={14} rx={1} />
                  <rect x={17} y={5} width={6} height={14} rx={1} />
                </svg>
              )}
            </button>
          ) : (
            <div className="gal-flex-row" style={{ background: 'var(--background-primary-alt)', padding: 2, borderRadius: 6, border: '1px solid var(--gal-border)' }}>
              <button
                type="button"
                className="gal-btn"
                title={t(locale, 'justifiedLayout')}
                onClick={() => {
                  setSettings((s) => ({ ...s, layout: 'justified' }));
                  saveState(true);
                }}
              >
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <rect x={3} y={3} width={18} height={7} />
                  <rect x={3} y={14} width={10} height={7} />
                  <rect x={15} y={14} width={6} height={7} />
                </svg>
              </button>
              <button
                type="button"
                className={`gal-btn ${settings.layout === 'square' ? 'active' : ''}`}
                title={t(locale, 'squareGrid')}
                onClick={() => {
                  setSettings((s) => ({ ...s, layout: 'square' }));
                  saveState(true);
                }}
              >
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <rect x={3} y={3} width={7} height={7} />
                  <rect x={14} y={3} width={7} height={7} />
                  <rect x={3} y={14} width={7} height={7} />
                  <rect x={14} y={14} width={7} height={7} />
                </svg>
              </button>
              <button
                type="button"
                className={`gal-btn ${settings.layout === 'detail' ? 'active' : ''}`}
                title={t(locale, 'detailViewHint')}
                onClick={() => {
                  setSettings((s) => ({ ...s, layout: 'detail' }));
                  saveState(true);
                }}
              >
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1={3} y1={6} x2={21} y2={6} />
                  <line x1={3} y1={12} x2={21} y2={12} />
                  <line x1={3} y1={18} x2={21} y2={18} />
                </svg>
              </button>
              <button
                type="button"
                className={`gal-btn ${isPanoramaLayout ? 'active' : ''}`}
                title={t(locale, 'panoramaHint')}
                onClick={() => {
                  if (isPanoramaLayout) {
                    setSettings((s) => ({
                      ...s,
                      layout: settings.layout === 'panorama-square' ? 'panorama-justified' : 'panorama-square'
                    }));
                  } else {
                    setSettings((s) => ({ ...s, layout: 'panorama-square' }));
                  }
                  saveState(true);
                }}
              >
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <rect x={1} y={5} width={6} height={14} rx={1} />
                  <rect x={9} y={5} width={6} height={14} rx={1} />
                  <rect x={17} y={5} width={6} height={14} rx={1} />
                </svg>
              </button>
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <button
              ref={searchBtnRef}
              type="button"
              className={`gal-btn ${(searchExpanded || (settings.search ?? '').trim() !== '') ? 'active' : ''}`}
              title={t(locale, 'search')}
              aria-label={t(locale, 'search')}
              onClick={() => setSearchExpanded((e) => !e)}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx={11} cy={11} r={8} />
                <line x1={21} y1={21} x2={16.65} y2={16.65} />
              </svg>
            </button>
            {searchExpanded &&
              searchPopupStyle &&
              createPortal(
                <div className="gal-portal-root">
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: popupZIndex - 1, cursor: 'default' }}
                    onClick={() => setSearchExpanded(false)}
                    onPointerDown={(e) => {
                      const target = e.target as Element;
                      if (target.closest('.lumina-search-suggestions-portal') || target.closest('.lumina-search-container')) return;
                      setSearchExpanded(false);
                    }}
                    aria-hidden
                  />
                  <div className="gal-popup gal-search-dropdown" style={searchPopupStyle}>
                    <div style={{ padding: 8 }}>
                      <SearchBarWithTags
                        value={settings.search}
                        onChange={(val) => {
                          setSettings((s) => ({ ...s, search: val }));
                          saveState(false);
                        }}
                        searchMode={settings.searchMode}
                        onSearchModeChange={(mode) => {
                          setSettings((s) => ({ ...s, searchMode: mode }));
                          saveState(true);
                        }}
                        allHashTags={availableHashTags}
                        allNoteLinks={availableNoteLinks}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>,
                (isFullscreen && containerRef.current) ? containerRef.current : document.body
              )}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              ref={sortBtnRef}
              type="button"
              className={`gal-btn ${settings.sortBy !== 'mtime-desc' ? 'active' : ''}`}
              title={t(locale, 'sortBy')}
              onClick={() => setSortPopup((p) => !p)}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1={12} y1={5} x2={12} y2={19} />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </button>
            {sortPopup &&
              sortPopupStyle &&
              createPortal(
                <div className="gal-portal-root">
                  <div
                    className="fixed inset-0"
                    style={{ zIndex: popupZIndex - 1, cursor: 'default' }}
                    onClick={() => setSortPopup(false)}
                    onPointerDown={() => setSortPopup(false)}
                    aria-hidden
                  />
                  <div className="gal-popup gal-popup-sort" style={sortPopupStyle}>
                    {SORT_OPTIONS.map((opt) => {
                      const isActive = settings.sortBy === opt.val;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          className="gal-sort-opt"
                          style={isActive ? { color: 'var(--gal-accent)', fontWeight: 600, background: 'var(--background-modifier-hover)', borderLeft: '3px solid var(--gal-accent)', paddingLeft: 7 } : undefined}
                          onClick={() => {
                            setSettings((s) => ({ ...s, sortBy: opt.val }));
                            saveState(true);
                            setSortPopup(false);
                          }}
                        >
                          {t(locale, opt.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>,
                (isFullscreen && containerRef.current) ? containerRef.current : document.body
              )}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              ref={folderBtnRef}
              type="button"
              className={`gal-btn gal-btn-folder ${folderPopup ? 'active' : ''} ${(settings.folders.length > 0 || !settings.includeAll || !settings.showPhotos || !settings.showVideos || settings.showOther || (settings.search ?? '').trim() !== '') ? 'gal-filter-active' : ''}`}
              title={t(locale, 'filter')}
              onClick={() => setFolderPopup((p) => !p)}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            {folderPopup &&
              folderPopupStyle &&
              createPortal(
                <div className="gal-portal-root">
                  <div
                    className="fixed inset-0"
                    style={{ zIndex: popupZIndex - 1, cursor: 'default' }}
                    onClick={() => setFolderPopup(false)}
                    onPointerDown={() => setFolderPopup(false)}
                    aria-hidden
                  />
                  <div className="gal-popup gal-popup-folder" style={folderPopupStyle}>
                    <div className="gal-flex-col" style={{ padding: 8, borderBottom: '1px solid var(--gal-border)' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gal-muted)', marginBottom: 6 }}>{t(locale, 'filter')}</span>
                      <label className="gal-flex-row" style={{ fontSize: 14, marginBottom: 4 }}>
                        <input
                          type="checkbox"
                          checked={settings.showPhotos}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, showPhotos: e.target.checked }));
                            saveState(true);
                          }}
                        />
                        {t(locale, 'photos')}
                      </label>
                      <label className="gal-flex-row" style={{ fontSize: 14, marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          checked={settings.showVideos}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, showVideos: e.target.checked }));
                            saveState(true);
                          }}
                        />
                        {t(locale, 'videos')}
                      </label>
                      <label className="gal-flex-row" style={{ fontSize: 14, marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          checked={settings.showOther}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, showOther: e.target.checked }));
                            saveState(true);
                            refreshGallery();
                          }}
                        />
                        {t(locale, 'other')}
                      </label>
                      <label className="gal-flex-row" style={{ fontSize: 14, marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          checked={settings.showAllFiles}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, showAllFiles: e.target.checked }));
                            saveState(true);
                            refreshGallery();
                          }}
                        />
                        {t(locale, 'allFiles')}
                      </label>
                      <input
                        type="text"
                        className="gal-folder-search-input"
                        placeholder={t(locale, 'filterFolders')}
                        value={folderSearch}
                        onChange={(e) => setFolderSearch(e.target.value.toLowerCase())}
                      />
                      <label className="gal-flex-row" style={{ fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={settings.includeAll}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, includeAll: e.target.checked }));
                            saveState(true);
                            refreshGallery();
                          }}
                        />
                        {t(locale, 'allVault')}
                      </label>
                    </div>
                    <div className="gal-folder-list">
                      {foldersList.map((f) => {
                        const checked = settings.folders.includes(f);
                        return (
                          <label
                            key={f}
                            className={`gal-flex-row gal-folder-item ${checked ? 'gal-folder-checked' : ''}`}
                            style={{ padding: '6px 8px', fontSize: 14, borderRadius: 4, cursor: 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSettings((s) => ({
                                  ...s,
                                  folders: checked
                                    ? s.folders.filter((x) => x !== f)
                                    : [...s.folders, f]
                                }));
                                saveState(true);
                              }}
                            />
                            <span>{f}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>,
                (isFullscreen && containerRef.current) ? containerRef.current : document.body
              )}
          </div>
          <button
            type="button"
            className={`gal-btn ${settings.showNames ? 'active' : ''}`}
            title={settings.showNames && settings.showTags ? t(locale, 'toggleFilenames') : settings.showNames ? t(locale, 'toggleFilenamesAndTags') : t(locale, 'toggleFilenames')}
            onClick={() => {
              setSettings((s) => {
                if (!s.showNames) return { ...s, showNames: true, showTags: false };
                if (!s.showTags) return { ...s, showTags: true };
                return { ...s, showNames: false, showTags: false };
              });
              saveState(true);
            }}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
              {settings.showTags && <circle cx={19} cy={19} r={4} fill="currentColor" stroke="none" />}
            </svg>
          </button>
          <button
            type="button"
            className={`gal-btn ${isEditMode ? 'active' : ''}`}
            title={t(locale, 'editMode')}
            onClick={() => {
              setIsEditMode((e) => !e);
              setSelection(new Set());
            }}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <div className="gal-flex-row" style={{ background: 'var(--background-primary-alt)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--gal-border)' }}>
            <button
              type="button"
              className="gal-zoom-btn"
              onClick={() => {
                setSettings((s) => ({ ...s, zoom: Math.max(ZOOM_MIN, zoomMultiply(s.zoom, -1)) }));
                saveState(false);
              }}
            >
              −
            </button>
            {!extraCompact && (
              <input
                type="range"
                min={0}
                max={1000}
                step={1}
                value={zoomToLevel(settings.zoom)}
                className="gal-zoom-slider"
                title={t(locale, 'zoom')}
                aria-label={t(locale, 'zoom')}
                onChange={(e) => {
                  const level = parseInt(e.target.value, 10);
                  setSettings((s) => ({ ...s, zoom: levelToZoom(level) }));
                  saveState(false);
                }}
              />
            )}
            <button
              type="button"
              className="gal-zoom-btn"
              onClick={() => {
                setSettings((s) => ({ ...s, zoom: Math.min(ZOOM_MAX, zoomMultiply(s.zoom, 1)) }));
                saveState(false);
              }}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={`gal-btn ${settings.toolbarPinned ? 'active' : ''}`}
            title={t(locale, 'toolbarPin')}
            onClick={() => {
              setSettings((s) => ({ ...s, toolbarPinned: !s.toolbarPinned }));
              saveState(true);
            }}
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx={12} cy={12} r={3} />
            </svg>
          </button>
          <button
            type="button"
            className={`gal-btn gal-slideshow-icon ${settings.slideshowIntervalSec > 0 || slideshowCountdown > 0 ? 'active' : ''}`}
            title={t(locale, 'slideshowHint')}
            onClick={cycleSlideshowDuration}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x={2} y={4} width={20} height={16} rx={1} />
              <polygon points="10 8 10 16 16 12" fill="currentColor" stroke="none" />
            </svg>
            {slideshowCountdown > 0 && (
              <span className="gal-slideshow-badge">{slideshowCountdown}</span>
            )}
            <span className="gal-slideshow-duration">{slideshowDurationLabel}</span>
          </button>
          <button type="button" className="gal-btn" title={t(locale, 'help')} onClick={() => setHelpModal(true)}>
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx={12} cy={12} r={10} />
              <line x1={12} y1={16} x2={12} y2={12} />
              <line x1={12} y1={8} x2={12.01} y2={8} />
            </svg>
          </button>
          <button
            type="button"
            className="gal-btn"
            title={t(locale, 'fullscreen')}
            onClick={() => {
              if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
              else document.exitFullscreen?.();
            }}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
      </div>
        ) : (
          <div
            className="gal-toolbar-hover-zone"
            onPointerEnter={onToolbarPointerEnter}
            role="button"
            aria-label={t(locale, 'toolbarPin')}
          />
        )}
      </div>
      )}

      {/* Active filter bubbles bar */}
      {(() => {
        const filterTokens = (settings.search || '').match(/#[\w\-/]+|\[\[[^\]]+\]\]/g);
        if (!filterTokens || filterTokens.length === 0) return null;
        return (
          <div className="gal-filter-bar">
            {filterTokens.map((token, i) => (
              <span key={i} className={`gal-filter-bubble ${token.startsWith('#') ? 'gal-filter-tag' : 'gal-filter-link'}`}>
                {token}
                <button
                  type="button"
                  className="gal-filter-bubble-x"
                  title={t(locale, 'removeFilter')}
                  onClick={() => {
                    const newSearch = settings.search.replace(token, '').replace(/\s{2,}/g, ' ').trim();
                    setSettings((s) => ({ ...s, search: newSearch }));
                    saveState(true);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Drag handle flottant : visible uniquement en mode édition avec sélection */}
      {!isSlideshowActive && isEditMode && selection.size > 0 && (
        <div
          draggable
          onDragStart={(e) => {
            const paths = Array.from(selection);
            const links = paths
              .map((path) => {
                const img = allImages.find((i) => i.path === path);
                return img ? `![[${img.name}]]` : '';
              })
              .filter(Boolean)
              .join('\n');
            e.dataTransfer.setData('text/plain', links);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
            padding: '8px 16px', borderRadius: 20, background: 'var(--gal-accent)', color: 'white',
            fontSize: 13, fontWeight: 600, cursor: 'grab', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap', userSelect: 'none'
          }}
        >
          {t(locale, 'dragToNote')} ({selection.size})
        </div>
      )}

      {/* Edit toolbar */}
      {!isSlideshowActive && isEditMode && (
        <div className="gal-edit-toolbar gal-flex-row" style={{ flexShrink: 0, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--gal-header)', borderBottom: '1px solid var(--gal-border)', zIndex: 20 }}>
          <span className="text-[var(--gal-muted)] text-xs mr-2">{selection.size} {t(locale, 'selected')}</span>
          <button
            type="button"
            className="gal-edit-toolbar-btn"
            onClick={() => setNoteModal(true)}
          >
            {t(locale, 'addToNote')}
          </button>
          <button
            type="button"
            className="gal-edit-toolbar-btn"
            onClick={async () => {
              const links = Array.from(selection)
                .map((path) => {
                  const img = allImages.find((i) => i.path === path);
                  return img ? `![[${img.name}]]` : '';
                })
                .filter(Boolean)
                .join('\n');
              await navigator.clipboard.writeText(links);
              alert(t(locale, 'copied'));
            }}
          >
            {t(locale, 'copyLinks')}
          </button>
          <button
            type="button"
            className="gal-edit-toolbar-btn"
            onClick={() => openBatchTagModal(Array.from(selection))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            {t(locale, 'manageTags')} ({selection.size})
          </button>
          <button
            type="button"
            className="gal-edit-toolbar-btn gal-edit-toolbar-btn-danger"
            onClick={async () => {
              if (!confirm(t(locale, 'deleteConfirm', { n: selection.size }))) return;
              for (const path of selection) {
                const file = app.vault.getAbstractFileByPath(path);
                if (file) await app.vault.trash(file, true);
              }
              setSelection(new Set());
              setIsEditMode(false);
              refreshGallery();
            }}
          >
            {t(locale, 'delete')}
          </button>
          <button
            type="button"
            className="gal-edit-toolbar-btn"
            onClick={() => {
              setIsEditMode(false);
              setSelection(new Set());
            }}
          >
            {t(locale, 'cancel')}
          </button>
        </div>
      )}

      {/* Canvas + GIF/Video overlay + Slideshow GIF/Video */}
      <div
        ref={galMainRef}
        className="gal-main"
        tabIndex={0}
        onPointerMove={canShowTimeline ? handleTimelineZonePointerMove : undefined}
        onPointerLeave={canShowTimeline ? handleTimelineZonePointerLeave : undefined}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/plain')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const text = e.dataTransfer.getData('text/plain');
          const embed = text ? urlToEmbed(text) : null;
          if (embed) {
            setLightboxEmbed(embed);
            setLightboxOpen(true);
            setLbZoom(1);
            setLbPan({ x: 0, y: 0 });
          }
        }}
        onPaste={(e) => {
          const text = e.clipboardData?.getData('text/plain');
          if (text) {
            const embed = urlToEmbed(text);
            if (embed) {
              e.preventDefault();
              setLightboxEmbed(embed);
              setLightboxOpen(true);
              setLbZoom(1);
              setLbPan({ x: 0, y: 0 });
            }
          }
        }}
      >
        {isSlideshowActive && filteredImages.length > 0 && (() => {
          const slide = filteredImages[Math.min(slideshowIndex, filteredImages.length - 1)];
          if (!slide || (slide.mediaType !== 'video' && !isGif(slide.path))) return null;
          return (
            <div
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 5
              }}
            >
              {slide.mediaType === 'video' ? (
                <video
                  key={slide.path}
                  src={slide.url}
                  muted
                  loop
                  autoPlay
                  playsInline
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <img
                  key={slide.path}
                  src={slide.url}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              )}
            </div>
          );
        })()}
        {settings.layout === 'detail' ? (
          <div
            ref={detailViewRef}
            className="gal-detail-view"
            style={{ flex: 1, width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' as any, background: 'var(--gal-bg)' }}
            onScroll={(e) => {
              const el = e.currentTarget;
              setDetailScrollInfo({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
            }}
          >
            {/* Detail view header - sortable columns */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--gal-border)', background: 'var(--gal-header)', fontSize: 12, fontWeight: 600, color: 'var(--gal-muted)', gap: 4, position: 'sticky', top: 0, zIndex: 2 }}>
              {isEditMode && <div style={{ width: 32 }} />}
              <div style={{ width: 40, textAlign: 'center' }}></div>
              {([
                { field: 'name' as DetailSortField, label: t(locale, 'fileName'), style: { flex: 2, minWidth: 0 } },
                { field: 'type' as DetailSortField, label: t(locale, 'fileType'), style: { width: 60, textAlign: 'center' as const } },
                { field: 'size' as DetailSortField, label: t(locale, 'fileSize'), style: { width: 80, textAlign: 'right' as const } },
                { field: 'mtime' as DetailSortField, label: t(locale, 'dateModified'), style: { width: 120, textAlign: 'right' as const } },
              ]).map(col => (
                <div
                  key={col.field}
                  style={{ ...col.style, cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 2 }}
                  onClick={() => {
                    setSettings(s => s.detailSortField === col.field
                      ? { ...s, detailSortAsc: !s.detailSortAsc }
                      : { ...s, detailSortField: col.field, detailSortAsc: true });
                    saveState(true);
                  }}
                  title={settings.detailSortField === col.field ? (settings.detailSortAsc ? t(locale, 'sortDescending') : t(locale, 'sortAscending')) : t(locale, 'sortAscending')}
                >
                  <span>{col.label}</span>
                  {settings.detailSortField === col.field && (
                    <span style={{ fontSize: 10, opacity: 0.8 }}>{settings.detailSortAsc ? '▲' : '▼'}</span>
                  )}
                </div>
              ))}
              {pluginSettings.enableTagSystem && (
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 2 }}
                  onClick={() => {
                    setSettings(s => s.detailSortField === 'tags'
                      ? { ...s, detailSortAsc: !s.detailSortAsc }
                      : { ...s, detailSortField: 'tags', detailSortAsc: true });
                    saveState(true);
                  }}
                  title={settings.detailSortField === 'tags' ? (settings.detailSortAsc ? t(locale, 'sortDescending') : t(locale, 'sortAscending')) : t(locale, 'sortAscending')}
                >
                  <span>{t(locale, 'tags')}</span>
                  {settings.detailSortField === 'tags' && (
                    <span style={{ fontSize: 10, opacity: 0.8 }}>{settings.detailSortAsc ? '▲' : '▼'}</span>
                  )}
                </div>
              )}
            </div>
            {filteredImages.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gal-muted)', fontSize: 14 }}>{t(locale, 'noResults')}</div>
            ) : (
              (() => {
                // Sort for detail view
                const sorted = [...filteredImages].sort((a, b) => {
                  const dir = settings.detailSortAsc ? 1 : -1;
                  switch (settings.detailSortField) {
                    case 'name': return dir * a.name.localeCompare(b.name);
                    case 'type': {
                      const ea = (a.name.split('.').pop() || '').toLowerCase();
                      const eb = (b.name.split('.').pop() || '').toLowerCase();
                      return dir * ea.localeCompare(eb);
                    }
                    case 'size': return dir * (a.size - b.size);
                    case 'mtime': return dir * (a.mtime - b.mtime);
                    case 'tags': {
                      const ta = tagManager.getTags(a.path).length;
                      const tb = tagManager.getTags(b.path).length;
                      return dir * (ta - tb);
                    }
                    default: return 0;
                  }
                });
                return sorted.map((img, idx) => {
                  const isSelected = selection.has(img.path);
                  const globalIdx = filteredImages.indexOf(img);
                  const ext = img.name.split('.').pop()?.toLowerCase() || '';
                  const sizeStr = img.size < 1024 ? `${img.size} B`
                    : img.size < 1048576 ? `${(img.size / 1024).toFixed(1)} KB`
                    : `${(img.size / 1048576).toFixed(1)} MB`;
                  const dateStr = new Date(img.mtime).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
                  const fileTags = tagManager.getTags(img.path);
                  return (
                    <div
                      key={img.path}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 4,
                        borderBottom: '1px solid var(--gal-border)',
                        background: isSelected ? 'rgba(14, 165, 233, 0.15)' : (idx % 2 === 0 ? 'var(--gal-bg)' : 'var(--background-primary-alt)'),
                        cursor: 'pointer', fontSize: 13, color: 'var(--gal-text)',
                        transition: 'background 0.15s',
                      }}
                      onClick={(e) => {
                        if (isEditMode) {
                          if (e.shiftKey && lastSelectedIndexRef.current >= 0) {
                            const start = Math.min(lastSelectedIndexRef.current, globalIdx);
                            const end = Math.max(lastSelectedIndexRef.current, globalIdx);
                            const newSel = new Set(selection);
                            for (let i = start; i <= end; i++) newSel.add(filteredImages[i].path);
                            setSelection(newSel);
                          } else if (e.ctrlKey || e.metaKey) {
                            const newSel = new Set(selection);
                            if (newSel.has(img.path)) newSel.delete(img.path); else newSel.add(img.path);
                            setSelection(newSel);
                          } else {
                            // Toggle selection on simple click in edit mode
                            const newSel = new Set(selection);
                            if (newSel.has(img.path)) newSel.delete(img.path); else newSel.add(img.path);
                            setSelection(newSel);
                          }
                          lastSelectedIndexRef.current = globalIdx;
                        }
                        // Non-edit: single click does nothing (double-click to open)
                      }}
                      onDoubleClick={() => {
                        if (!isEditMode) {
                          setLightboxIndex(globalIdx);
                          setLightboxOpen(true);
                          setLbZoom(1);
                          setLbPan({ x: 0, y: 0 });
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const paths = selection.size > 0 && selection.has(img.path) ? Array.from(selection) : [img.path];
                        setContextMenu({ x: e.clientX, y: e.clientY, paths });
                      }}
                    >
                      {isEditMode && (
                        <div style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            aria-label={img.name}
                            style={{ accentColor: 'var(--gal-accent)' }}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newSel = new Set(selection);
                              if (e.target.checked) newSel.add(img.path); else newSel.delete(img.path);
                              setSelection(newSel);
                              lastSelectedIndexRef.current = globalIdx;
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                      <div style={{ width: 40, height: 32, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {img.mediaType === 'video' ? (
                          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="var(--gal-muted)" strokeWidth={2}><polygon points="5,3 19,12 5,21" /></svg>
                        ) : img.mediaType === 'image' ? (
                          <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        ) : (
                          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="var(--gal-muted)" strokeWidth={2}><path d="M14,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8Z"/><polyline points="14,2 14,8 20,8"/></svg>
                        )}
                      </div>
                      <div style={{ flex: 2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{img.name}</div>
                      <div style={{ width: 60, textAlign: 'center', color: 'var(--gal-muted)', textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>{ext}</div>
                      <div style={{ width: 80, textAlign: 'right', color: 'var(--gal-muted)' }}>{sizeStr}</div>
                      <div style={{ width: 120, textAlign: 'right', color: 'var(--gal-muted)' }}>{dateStr}</div>
                      {pluginSettings.enableTagSystem && (
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 3, overflow: 'hidden' }}>
                          {fileTags.slice(0, 3).map(tag => (
                            <span
                              key={tag}
                              className="gal-detail-tag-bubble"
                              onClick={(e) => { e.stopPropagation(); handleTagClick('#' + tag); }}
                            >{tag}</span>
                          ))}
                          {fileTags.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>+{fileTags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            )}
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="gal-canvas"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            onDoubleClick={onCanvasDoubleClick}
            onContextMenu={onCanvasContextMenu}
          />
        )}
        {canShowTimeline && (
          <>
          <div
            ref={timelineScrubRef}
            className={`gal-timeline-scrub ${timelineVisible ? 'gal-timeline-visible' : ''} ${timelineDragging ? 'gal-timeline-dragging' : ''}`}
            onPointerDown={onTimelineScrubPointerDown}
            onPointerMove={onTimelineScrubPointerMove}
            onPointerUp={onTimelineScrubPointerUp}
            onPointerLeave={onTimelineScrubPointerLeave}
            onPointerCancel={onTimelineScrubPointerLeave}
          >
            <div className="gal-timeline-track">
              <div
                className="gal-timeline-thumb"
                style={{
                  top: maxScroll > 0 ? `${((settings.layout === 'detail' ? detailScrollInfo.scrollTop : targetScroll) / maxScroll) * 100}%` : '0%',
                  transform: 'translate(-50%, -50%)'
                }}
              />
              <div className="gal-timeline-markers">
                {timelineSections.map((s, i) => (
                  <div
                    key={i}
                    className="gal-timeline-marker"
                    style={{ top: totalContentHeight > 0 ? `${(s.y / totalContentHeight) * 100}%` : '0%' }}
                  >
                    <span className="gal-timeline-marker-label" title={s.label}>{s.label}</span>
                    <span className="gal-timeline-marker-dot" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {timelineLabel && (
            <div
              className="gal-timeline-label"
              style={{ top: timelineLabel.top }}
            >
              {timelineLabel.text}
            </div>
          )}
          </>
        )}
        {!isSlideshowActive && settings.layout !== 'detail' && layoutData.length > 0 && (
          <div className="gal-media-overlay">
            <div
              ref={overlayContentRef}
              className="gal-media-overlay-content"
              style={{
                width: isPanoramaLayout
                  ? Math.max(0, ...layoutData.map((l) => l.x + l.w)) + GAP
                  : containerWidth,
                height: isPanoramaLayout
                  ? rowHeight + 2 * GAP
                  : (layoutData[layoutData.length - 1]?.y ?? 0) + (layoutData[layoutData.length - 1]?.h ?? 0) + textH + GAP
              }}
            >
              {layoutData.map((layout, i) => {
                const imgData = filteredImages[i];
                if (!imgData) return null;
                const pathsToLink = selection.has(imgData.path)
                  ? Array.from(selection)
                  : [imgData.path];
                const linksText = pathsToLink
                  .map((path) => {
                    const m = allImages.find((x) => x.path === path);
                    return m ? `![[${m.name}]]` : '';
                  })
                  .filter(Boolean)
                  .join('\n');
                return (
                  <div
                    key={imgData.path}
                    style={{
                      left: layout.x,
                      top: layout.y,
                      width: layout.w,
                      height: layout.h,
                      pointerEvents: isEditMode || imgData.mediaType === 'video' || isGif(imgData.path) ? 'auto' : 'none',
                      cursor: isEditMode ? 'grab' : 'default'
                    }}
                    className="gal-media-overlay-item"
                    draggable={isEditMode}
                    onDragStart={isEditMode ? (e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('text/plain', linksText);
                      e.dataTransfer.effectAllowed = 'copy';
                    } : undefined}
                    onClick={isEditMode ? (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (e.ctrlKey) {
                        setIsEditMode(true);
                        setSelection(new Set([imgData.path]));
                        lastSelectedIndexRef.current = i;
                        return;
                      }
                      if (e.shiftKey) {
                        const anchor = lastSelectedIndexRef.current >= 0 ? lastSelectedIndexRef.current : i;
                        const lo = Math.min(anchor, i);
                        const hi = Math.max(anchor, i);
                        const paths = new Set<string>();
                        for (let k = lo; k <= hi; k++) {
                          const m = filteredImages[k];
                          if (m) paths.add(m.path);
                        }
                        setSelection(paths);
                        return;
                      }
                      setSelection((prev) => {
                        const next = new Set(prev);
                        if (next.has(imgData.path)) next.delete(imgData.path);
                        else next.add(imgData.path);
                        return next;
                      });
                      lastSelectedIndexRef.current = i;
                    } : undefined}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setLightboxIndex(i);
                      setLightboxOpen(true);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (isEditMode) {
                        const paths = selection.has(imgData.path) 
                          ? Array.from(selection)
                          : [imgData.path];
                        setContextMenu({ x: e.clientX, y: e.clientY, paths });
                      } else {
                        setLightboxIndex(i);
                        setLightboxOpen(true);
                      }
                    }}
                    {...(imgData.mediaType === 'video'
                      ? {
                          onMouseEnter: (e: React.MouseEvent) => {
                            if (videoHoverTimeoutRef.current) {
                              clearTimeout(videoHoverTimeoutRef.current);
                              videoHoverTimeoutRef.current = null;
                            }
                            const el = e.currentTarget;
                            videoHoverTimeoutRef.current = setTimeout(() => {
                              videoHoverTimeoutRef.current = null;
                              (el.querySelector('video') as HTMLVideoElement)?.play();
                            }, 800);
                          },
                          onMouseLeave: (e: React.MouseEvent) => {
                            if (videoHoverTimeoutRef.current) {
                              clearTimeout(videoHoverTimeoutRef.current);
                              videoHoverTimeoutRef.current = null;
                            }
                            (e.currentTarget.querySelector('video') as HTMLVideoElement)?.pause();
                          },
                          onTouchStart: (e: React.TouchEvent) => {
                            if (videoHoverTimeoutRef.current) return;
                            const el = e.currentTarget;
                            videoHoverTimeoutRef.current = setTimeout(() => {
                              videoHoverTimeoutRef.current = null;
                              (el.querySelector('video') as HTMLVideoElement)?.play();
                            }, 800);
                          },
                          onTouchEnd: (e: React.TouchEvent) => {
                            if (videoHoverTimeoutRef.current) {
                              clearTimeout(videoHoverTimeoutRef.current);
                              videoHoverTimeoutRef.current = null;
                            }
                            (e.currentTarget.querySelector('video') as HTMLVideoElement)?.pause();
                          },
                        }
                      : {})}
                  >
                    {imgData.mediaType === 'video' ? (
                      <video
                        src={imgData.url}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          pointerEvents: isEditMode ? 'none' : 'auto'
                        }}
                      />
                    ) : isGif(imgData.path) ? (
                      <img
                        src={imgData.url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        draggable={false}
                      />
                    ) : null}
                    {isEditMode && selection.has(imgData.path) && (imgData.mediaType === 'video' || isGif(imgData.path)) && (
                      <div
                        style={{
                          position: 'absolute', inset: 0, pointerEvents: 'none',
                          border: '4px solid #ff4444', borderRadius: 8,
                          boxSizing: 'border-box'
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {settings.showTags && layoutData.map((layout, i) => {
                const imgData = filteredImages[i];
                if (!imgData) return null;
                const fileTags = tagManager.getTags(imgData.path);
                if (fileTags.length === 0) return null;
                return (
                  <div
                    key={`tags-${imgData.path}`}
                    style={{
                      position: 'absolute',
                      left: layout.x,
                      top: layout.y + layout.h - 28,
                      width: layout.w,
                      height: 28,
                      pointerEvents: 'auto',
                      display: 'flex',
                      flexWrap: 'nowrap',
                      alignItems: 'flex-end',
                      gap: 2,
                      padding: '0 3px 3px',
                      boxSizing: 'border-box',
                      overflow: 'hidden'
                    }}
                  >
                    {fileTags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="gal-thumb-tag-bubble"
                        onClick={(e) => { e.stopPropagation(); handleTagClick('#' + tag); }}
                      >{tag}</span>
                    ))}
                    {fileTags.length > 4 && (
                      <span className="gal-thumb-tag-bubble gal-thumb-tag-more">+{fileTags.length - 4}</span>
                    )}
                  </div>
                );
              })}
              {settings.showNames && textH > 0 && layoutData.map((layout, i) => {
                const imgData = filteredImages[i];
                if (!imgData) return null;
                return (
                  <div
                    key={`name-${imgData.path}`}
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: layout.x,
                      top: layout.y + layout.h,
                      width: layout.w,
                      height: textH,
                      cursor: 'default',
                      pointerEvents: 'auto'
                    }}
                    onPointerEnter={(e) => {
                      if (nameTooltipTimeoutRef.current) {
                        clearTimeout(nameTooltipTimeoutRef.current);
                        nameTooltipTimeoutRef.current = null;
                      }
                      nameTooltipTimeoutRef.current = setTimeout(() => {
                        nameTooltipTimeoutRef.current = null;
                        setNameTooltip({
                          imgData,
                          clientX: e.clientX,
                          clientY: e.clientY
                        });
                      }, 500);
                    }}
                    onPointerLeave={() => {
                      if (nameTooltipTimeoutRef.current) {
                        clearTimeout(nameTooltipTimeoutRef.current);
                        nameTooltipTimeoutRef.current = null;
                      }
                      setNameTooltip(null);
                    }}
                    onPointerMove={(e) => {
                      if (nameTooltip && nameTooltip.imgData.path === imgData.path) {
                        setNameTooltip((t) => t ? { ...t, clientX: e.clientX, clientY: e.clientY } : null);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
        {nameTooltip && createPortal(
          <div
            className="gal-portal-root"
            style={{
              position: 'fixed',
              left: Math.min(nameTooltip.clientX + 12, window.innerWidth - 220),
              top: nameTooltip.clientY + 12,
              zIndex: 20001,
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.9)',
              color: 'white',
              fontSize: 12,
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
              maxWidth: 320,
              lineHeight: 1.4
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, wordBreak: 'break-all' }}>{nameTooltip.imgData.name}</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 3 }}>{nameTooltip.imgData.path}</div>
            <div style={{ fontSize: 11, opacity: 0.9, display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginBottom: 6 }}>
              <span>{new Date(nameTooltip.imgData.mtime).toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : locale, { dateStyle: 'medium' })}</span>
              <span>•</span>
              <span>{(nameTooltip.imgData.size / 1024) < 1024 ? `${(nameTooltip.imgData.size / 1024).toFixed(1)} KB` : `${(nameTooltip.imgData.size / 1024 / 1024).toFixed(2)} MB`}</span>
              <span>•</span>
              <span>.{(nameTooltip.imgData.path.split('.').pop() || '').toLowerCase()}</span>
              {(() => {
                const cached = cacheRef.current.get(nameTooltip.imgData.path);
                if (cached && cached !== 'loading') {
                  const { w, h } = getImageDimensions(cached as CachedImage);
                  return <><span>•</span><span>{w} × {h}</span></>;
                }
                return null;
              })()}
            </div>
            {pluginSettings.enableTagSystem && tagManager.getTags(nameTooltip.imgData.path).length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <TagList 
                  tags={tagManager.getTags(nameTooltip.imgData.path)} 
                  maxVisible={10} 
                  showCount={false}
                  onTagClick={handleTagClick}
                />
              </div>
            )}
          </div>,
          (isFullscreen && containerRef.current) ? containerRef.current : document.body
        )}
      </div>      {/* Lightbox */}
      {lightboxOpen && (currentImage || lightboxEmbed) && (
        <div
          className="gal-lightbox"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
          onPointerMove={onLbPointerMoveForUi}
        >
          <div
            ref={lightboxViewerRef}
            className={`gal-lightbox-viewer-wrap gal-lightbox-viewer ${!lightboxEmbed && lbDragging ? 'cursor-grabbing' : !lightboxEmbed ? 'cursor-grab' : ''}`}
            style={{ flex: 1 }}
            onPointerDown={lightboxEmbed ? undefined : onLbPointerDown}
            onPointerMove={lightboxEmbed ? undefined : onLbPointerMove}
            onPointerUp={lightboxEmbed ? undefined : onLbPointerUp}
            onPointerCancel={lightboxEmbed ? undefined : onLbPointerCancel}
            onDoubleClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            {lightboxEmbed ? (
              <div className="gal-lightbox-embed-container">
                <iframe
                  src={lightboxEmbed.embedSrc}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  className="gal-lightbox-embed-iframe"
                />
              </div>
            ) : currentImage ? (
              <div
                draggable={false}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  cursor: lbZoom > 1 ? (lbDragging ? 'grabbing' : 'grab') : 'default'
                }}
              >
                {currentImage.mediaType === 'video' ? (
                  <video
                    ref={lightboxVideoRef}
                    src={currentImage.url}
                    controls
                    autoPlay
                    loop
                    playsInline
                    draggable={false}
                    style={{
                      maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none',
                      transform: `translate(${lbPan.x}px, ${lbPan.y}px) scale(${lbZoom})`,
                      pointerEvents: 'auto'
                    }}
                  />
                ) : (
                  <img
                    src={currentImage.url}
                    alt={currentImage.name}
                    draggable={false}
                    style={{
                      maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none',
                      transform: `translate(${lbPan.x}px, ${lbPan.y}px) scale(${lbZoom})`
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
          
          {/* Video controls with PIP button */}
          {(currentImage?.mediaType === 'video' || lightboxEmbed) && (
            <div className={`gal-video-controls ${lbUiVisible ? 'visible' : ''}`}>
              <button
                type="button"
                className={`gal-video-control-btn ${isPipActive ? 'pip-active' : ''}`}
                title={t(locale, 'pip')}
                onClick={async () => {
                  try {
                    if (document.pictureInPictureElement) {
                      await document.exitPictureInPicture();
                      return;
                    }
                    if (!document.pictureInPictureEnabled) return;
                    // Try local video ref first
                    const localVideo = lightboxVideoRef.current;
                    if (localVideo) {
                      await localVideo.requestPictureInPicture();
                      return;
                    }
                    // For embeds: try to find video inside iframe, then fallback to page videos
                    const iframe = document.querySelector('.gal-lightbox-embed-iframe') as HTMLIFrameElement | null;
                    if (iframe) {
                      try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (iframeDoc) {
                          const videos = iframeDoc.querySelectorAll('video');
                          if (videos.length > 0) {
                            await videos[0].requestPictureInPicture();
                            return;
                          }
                        }
                      } catch { /* cross-origin - expected */ }
                    }
                    // Final fallback: scan all videos on the page (like the bookmarklet)
                    const allVideos = document.querySelectorAll('video');
                    if (allVideos.length > 0) {
                      await allVideos[allVideos.length - 1].requestPictureInPicture();
                    }
                  } catch (err) {
                    console.error('PIP error:', err);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          )}
          
          <div
            className={`gal-lightbox-ui ${!lbUiVisible ? 'gal-lightbox-ui-hidden' : ''}`}
            style={{
              position: 'absolute', inset: 0, zIndex: 103, pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              background: 'transparent'
            }}
          >
            <button
              type="button"
              className="gal-lightbox-close"
              style={{ pointerEvents: lbUiVisible ? 'auto' : 'none' }}
              onClick={() => { scheduleLbUiHide(); closeLightbox(); }}
            >
              ✕
            </button>
            {!lightboxEmbed && (
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
                <button
                  type="button"
                  aria-label={t(locale, 'previous')}
                  className="gal-lightbox-nav gal-lightbox-nav-prev"
                  style={{ pointerEvents: lbUiVisible ? 'auto' : 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    scheduleLbUiHide();
                    setLightboxIndex((i) => (i <= 0 ? filteredImages.length - 1 : i - 1));
                    setLbZoom(1);
                    setLbPan({ x: 0, y: 0 });
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  ❮
                </button>
                <button
                  type="button"
                  aria-label={t(locale, 'next')}
                  className="gal-lightbox-nav gal-lightbox-nav-next"
                  style={{ pointerEvents: lbUiVisible ? 'auto' : 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    scheduleLbUiHide();
                    setLightboxIndex((i) => (i >= filteredImages.length - 1 ? 0 : i + 1));
                    setLbZoom(1);
                    setLbPan({ x: 0, y: 0 });
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  ❯
                </button>
              </div>
            )}
            <div
              className="gal-lightbox-info"
              style={{
                pointerEvents: lbUiVisible ? 'auto' : 'none',
                background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)'
              }}
            >
              {lightboxEmbed ? (
                <>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 16px' }} title={lightboxEmbed.url}>{lightboxEmbed.url}</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <button
                      type="button"
                      className="gal-lightbox-action-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(lightboxEmbed.embedHtml);
                        alert(t(locale, 'copied'));
                      }}
                    >
                      {t(locale, 'copyEmbedHtml')}
                    </button>
                  </div>
                </>
              ) : currentImage ? (
                <>
                  <div>{currentImage.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {(currentImage.size / 1024 / 1024).toFixed(2)} MB •{' '}
                    {new Date(currentImage.mtime).toLocaleString()}
                  </div>
                  {pluginSettings.enableTagSystem && tagManager.getTags(currentImage.path).length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                      <TagList 
                        tags={tagManager.getTags(currentImage.path)} 
                        maxVisible={15} 
                        showCount={false}
                        onTagClick={handleTagClick}
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <button
                      type="button"
                      className="gal-lightbox-action-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(`![[${currentImage.name}]]`);
                        alert(t(locale, 'copied'));
                      }}
                    >
                      {t(locale, 'copyLink')}
                    </button>
                    <button
                      type="button"
                      className="gal-lightbox-action-btn"
                      onClick={() => {
                        setSelection(new Set([currentImage.path]));
                        setNoteModal(true);
                      }}
                    >
                      {t(locale, 'addToNote')}
                    </button>
                    {pluginSettings.enableTagSystem && (
                      <button
                        type="button"
                        className="gal-lightbox-action-btn"
                        onClick={() => {
                          openBatchTagModal([currentImage.path]);
                        }}
                      >
                        {t(locale, 'manageTags')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="gal-lightbox-action-btn"
                      onClick={() => {
                        const obsidianApp = api.getObsidianApp() as { workspace?: { openLinkText?: (link: string, sourcePath: string) => void } } | null;
                        if (obsidianApp?.workspace?.openLinkText) {
                          obsidianApp.workspace.openLinkText(currentImage.path, '');
                        }
                      }}
                    >
                      {t(locale, 'openFile')}
                    </button>
                    <button
                      type="button"
                      className="gal-lightbox-action-btn gal-lightbox-btn-delete"
                      onClick={async () => {
                        if (!confirm(t(locale, 'deleteConfirmSingle', { name: currentImage.name }))) return;
                        const file = app.vault.getAbstractFileByPath(currentImage.path);
                        if (file) {
                          await app.vault.trash(file, true);
                          closeLightbox();
                          refreshGallery();
                        }
                      }}
                    >
                      {t(locale, 'delete')}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Note selector modal */}
      {noteModal && (
        <div
          className="gal-note-modal-overlay"
          onClick={() => setNoteModal(false)}
        >
          <div
            className="gal-note-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', background: 'var(--gal-header)', borderBottom: '1px solid var(--gal-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
              <span>{t(locale, 'addToNoteTitle')}</span>
              <button type="button" style={{ color: 'var(--gal-muted)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setNoteModal(false)}>
                ✕
              </button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="text"
                style={{ width: '100%', padding: '8px', border: '1px solid var(--gal-border)', borderRadius: 6, background: 'var(--background-primary)', color: 'var(--gal-text)' }}
                placeholder={t(locale, 'searchNotes')}
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
              />
              <div className="gal-note-list">
                {((app.vault as { getMarkdownFiles?: () => { path: string; name?: string }[] }).getMarkdownFiles?.() ?? [])
                  .filter((f) => f.path.toLowerCase().includes(noteSearch.toLowerCase()))
                  .slice(0, 50)
                  .map((f) => {
                    const name = f.name ?? f.path.split('/').pop() ?? f.path;
                    return (
                      <button
                        key={f.path}
                        type="button"
                        className="gal-note-item"
                        onClick={async () => {
                          const file = app.vault.getAbstractFileByPath(f.path);
                          if (file) {
                            const content = await app.vault.read(file);
                            const links = Array.from(selection)
                              .map((path) => {
                                const img = allImages.find((i) => i.path === path);
                                return img ? `![[${img.name}]]` : '';
                              })
                              .filter(Boolean)
                              .join('\n');
                            await app.vault.modify(file, content + '\n' + links);
                            alert(t(locale, 'addedToNote'));
                          }
                          setNoteModal(false);
                          setIsEditMode(false);
                          setSelection(new Set());
                        }}
                      >
                        <span className="gal-note-item-name">{name}</span>
                        <span className="gal-note-item-path">{f.path}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpModal && (
        <div className="gal-modal-overlay" onClick={() => setHelpModal(false)}>
          <div
            style={{ background: 'var(--gal-bg)', width: 450, maxWidth: '90%', borderRadius: 12, border: '1px solid var(--gal-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', background: 'var(--gal-header)', borderBottom: '1px solid var(--gal-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700 }}>
              <span>{t(locale, 'galleryGuide')}</span>
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--gal-muted)', fontSize: 20, cursor: 'pointer' }} onClick={() => setHelpModal(false)}>
                ✕
              </button>
            </div>
            <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--gal-text)' }}>
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ color: 'var(--gal-accent)', borderBottom: '1px solid var(--gal-border)', paddingBottom: 4, marginBottom: 4 }}>{t(locale, 'interactions')}</h4>
                <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                  <li>{t(locale, 'helpDoubleClick')}</li>
                  <li>{t(locale, 'helpLeftClick')}</li>
                  <li>{t(locale, 'helpDrag')}</li>
                  <li>{t(locale, 'helpCtrlWheel')}</li>
                  <li>{t(locale, 'helpPinch')}</li>
                </ul>
              </div>
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ color: 'var(--gal-accent)', borderBottom: '1px solid var(--gal-border)', paddingBottom: 4, marginBottom: 4 }}>{t(locale, 'lightbox')}</h4>
                <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                  <li>{t(locale, 'helpArrows')}</li>
                </ul>
              </div>
              <div>
                <h4 style={{ color: 'var(--gal-accent)', borderBottom: '1px solid var(--gal-border)', paddingBottom: 4, marginBottom: 4 }}>{t(locale, 'features')}</h4>
                <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                  <li>{t(locale, 'featuresListDetail')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <GalleryContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedPaths={contextMenu.paths}
          enableTagSystem={pluginSettings.enableTagSystem}
          onManageTags={() => {
            if (!selection.has(contextMenu.paths[0]) || selection.size === 0) {
              setSelection(new Set(contextMenu.paths));
            }
            openBatchTagModal(contextMenu.paths);
            setContextMenu(null);
          }}
          onDelete={async () => {
            const pathsToDelete = contextMenu.paths;
            if (!confirm(t(locale, 'deleteConfirm', { n: pathsToDelete.length }))) {
              setContextMenu(null);
              return;
            }
            for (const path of pathsToDelete) {
              const file = app.vault.getAbstractFileByPath(path);
              if (file) await app.vault.trash(file, true);
            }
            setSelection(new Set());
            setContextMenu(null);
            refreshGallery();
          }}
          onClose={() => setContextMenu(null)}
          locale={locale}
        />
      )}
    </div>
  );
};
