export type LocaleKey = 'en' | 'fr' | 'de' | 'es' | 'zh';

export const LOCALE_NAMES: Record<LocaleKey, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  zh: '中文',
};

export type StringKey =
  | 'openLumina'
  | 'vaultUnavailable'
  | 'squareGrid'
  | 'justifiedLayout'
  | 'panorama'
  | 'panoramaHint'
  | 'layoutCycle'
  | 'search'
  | 'clearSearch'
  | 'searchPlaceholder'
  | 'sortBy'
  | 'filter'
  | 'photos'
  | 'videos'
  | 'filterFolders'
  | 'allVault'
  | 'toggleFilenames'
  | 'editMode'
  | 'zoom'
  | 'help'
  | 'slideshow'
  | 'slideshowHint'
  | 'fullscreen'
  | 'dragToNote'
  | 'selected'
  | 'addToNote'
  | 'copyLinks'
  | 'delete'
  | 'cancel'
  | 'deleteConfirm'
  | 'copied'
  | 'copyLink'
  | 'addedToNote'
  | 'deleteConfirmSingle'
  | 'addToNoteTitle'
  | 'searchNotes'
  | 'galleryGuide'
  | 'interactions'
  | 'helpDoubleClick'
  | 'helpLeftClick'
  | 'helpDrag'
  | 'helpCtrlWheel'
  | 'helpPinch'
  | 'lightbox'
  | 'helpArrows'
  | 'features'
  | 'dateNewest'
  | 'dateOldest'
  | 'dateModificationNewest'
  | 'dateModificationOldest'
  | 'dateTakenNewest'
  | 'byType'
  | 'byExtension'
  | 'createdNewest'
  | 'nameAZ'
  | 'sizeLargest'
  | 'toolbarPin'
  | 'dragHandle'
  | 'previous'
  | 'next'
  | 'language'
  | 'settingsTitle'
  | 'copyEmbedHtml'
  | 'pasteVideoUrl';

const en: Record<StringKey, string> = {
  openLumina: 'Open Lumina',
  vaultUnavailable: 'Obsidian vault unavailable',
  squareGrid: 'Square Grid',
  justifiedLayout: 'Justified Layout',
  panorama: 'Panorama',
  panoramaHint: 'Panorama (fill height). Click again: square ↔ justified',
  layoutCycle: 'Layout (click to cycle)',
  search: 'Search',
  clearSearch: 'Clear search',
  searchPlaceholder: 'Search...',
  sortBy: 'Sort By',
  filter: 'Filter',
  photos: 'Photos',
  videos: 'Videos',
  filterFolders: 'Filter folders...',
  allVault: 'All Vault',
  toggleFilenames: 'Toggle Filenames',
  editMode: 'Edit Mode',
  zoom: 'Zoom',
  help: 'Help',
  slideshow: 'Slideshow',
  slideshowHint: 'Slideshow (cycle: 5s, 10s, 30s, 60s, 10min, OFF)',
  fullscreen: 'Fullscreen',
  dragToNote: 'Drag to note',
  selected: 'selected',
  addToNote: 'Add to Note',
  copyLinks: 'Copy Links',
  delete: 'Delete',
  cancel: 'Cancel',
  deleteConfirm: 'Delete {n} images?',
  copied: 'Copied!',
  copyLink: 'Copy Link',
  addedToNote: 'Added to note!',
  deleteConfirmSingle: 'Delete {name}?',
  addToNoteTitle: 'Add to Note',
  searchNotes: 'Search notes...',
  galleryGuide: 'Gallery Guide & Shortcuts',
  interactions: 'Interactions',
  helpDoubleClick: 'Double-click / Double-tap: Open photo in Lightbox.',
  helpLeftClick: 'Single tap (Edit Mode): Select.',
  helpDrag: 'Drag / Swipe: Scroll the gallery.',
  helpCtrlWheel: 'Ctrl + Wheel / Pinch: Zoom grid size.',
  helpPinch: 'Pinch: Zoom in/out (touch).',
  lightbox: 'Lightbox',
  helpArrows: 'Arrows / Swipe: Navigate. Escape / Double-tap: Close.',
  features: 'Features',
  dateNewest: 'Date (Newest)',
  dateOldest: 'Date (Oldest)',
  dateModificationNewest: 'Modifications (newest)',
  dateModificationOldest: 'Modifications (oldest)',
  dateTakenNewest: 'Taken',
  byType: 'By type',
  byExtension: 'By extension',
  createdNewest: 'Created (Newest)',
  nameAZ: 'Name (A-Z)',
  sizeLargest: 'Size (Largest)',
  toolbarPin: 'Pin toolbar (disable auto-hide after 10s)',
  dragHandle: 'Drag to note',
  previous: 'Previous',
  next: 'Next',
  language: 'Language',
  settingsTitle: 'Lumina Settings',
  copyEmbedHtml: 'Copy embed HTML',
  pasteVideoUrl: 'Paste or drag a YouTube URL (Ctrl+V) to open in player',
};

const fr: Record<StringKey, string> = {
  openLumina: 'Ouvrir Lumina',
  vaultUnavailable: 'Coffre Obsidian indisponible',
  squareGrid: 'Grille carrée',
  justifiedLayout: 'Mise en page justifiée',
  panorama: 'Panorama',
  panoramaHint: 'Panorama (remplir hauteur). Recliquer : carré ↔ justifié',
  layoutCycle: 'Disposition (cliquer pour changer)',
  search: 'Recherche',
  clearSearch: 'Effacer la recherche',
  searchPlaceholder: 'Rechercher...',
  sortBy: 'Trier par',
  filter: 'Filtrer',
  photos: 'Photos',
  videos: 'Vidéos',
  filterFolders: 'Filtrer les dossiers...',
  allVault: 'Tout le coffre',
  toggleFilenames: 'Afficher les noms',
  editMode: 'Mode édition',
  zoom: 'Zoom',
  help: 'Aide',
  slideshow: 'Diaporama',
  slideshowHint: 'Diaporama (cycle: 5s, 10s, 30s, 60s, 10min, OFF)',
  fullscreen: 'Plein écran',
  dragToNote: 'Glisser vers une note',
  selected: 'sélectionné(s)',
  addToNote: 'Ajouter à la note',
  copyLinks: 'Copier les liens',
  delete: 'Supprimer',
  cancel: 'Annuler',
  deleteConfirm: 'Supprimer {n} images ?',
  copied: 'Copié !',
  copyLink: 'Copier le lien',
  addedToNote: 'Ajouté à la note !',
  deleteConfirmSingle: 'Supprimer {name} ?',
  addToNoteTitle: 'Ajouter à la note',
  searchNotes: 'Rechercher des notes...',
  galleryGuide: 'Guide & raccourcis',
  interactions: 'Interactions',
  helpDoubleClick: 'Double-clic / Double-tap : ouvrir en aperçu.',
  helpLeftClick: 'Tap simple (mode édition) : sélectionner.',
  helpDrag: 'Glisser / Swipe : faire défiler la galerie.',
  helpCtrlWheel: 'Ctrl + Molette / Pincement : zoom.',
  helpPinch: 'Pincement : zoom tactile.',
  lightbox: 'Aperçu',
  helpArrows: 'Flèches / Swipe : naviguer. Échap / Double-tap : fermer.',
  features: 'Fonctionnalités',
  dateNewest: 'Date (récent)',
  dateOldest: 'Date (ancien)',
  dateModificationNewest: 'Modifications (récent)',
  dateModificationOldest: 'Modifications (ancien)',
  dateTakenNewest: 'Prise de vue',
  byType: 'Par type',
  byExtension: 'Par extension',
  createdNewest: 'Créé (récent)',
  nameAZ: 'Nom (A-Z)',
  sizeLargest: 'Taille (grand)',
  toolbarPin: 'Épingler la barre (désactiver masquage auto 10s)',
  dragHandle: 'Glisser vers une note',
  previous: 'Précédent',
  next: 'Suivant',
  language: 'Langue',
  settingsTitle: 'Paramètres Lumina',
  copyEmbedHtml: 'Copier le HTML embed',
  pasteVideoUrl: 'Coller ou glisser une URL YouTube (Ctrl+V) pour ouvrir le lecteur',
};

const de: Record<StringKey, string> = {
  openLumina: 'Lumina öffnen',
  vaultUnavailable: 'Obsidian-Tresor nicht verfügbar',
  squareGrid: 'Quadratraster',
  justifiedLayout: 'Blocksatz-Layout',
  panorama: 'Panorama',
  panoramaHint: 'Panorama (Höhe füllen). Erneut klicken: Quadrat ↔ Blocksatz',
  layoutCycle: 'Layout (klicken zum Wechseln)',
  search: 'Suchen',
  clearSearch: 'Suche löschen',
  searchPlaceholder: 'Suchen...',
  sortBy: 'Sortieren nach',
  filter: 'Filter',
  photos: 'Fotos',
  videos: 'Videos',
  filterFolders: 'Ordner filtern...',
  allVault: 'Gesamter Tresor',
  toggleFilenames: 'Dateinamen ein/aus',
  editMode: 'Bearbeitungsmodus',
  zoom: 'Zoom',
  help: 'Hilfe',
  slideshow: 'Diashow',
  slideshowHint: 'Diashow (Zyklus: 5s, 10s, 30s, 60s, 10min, AUS)',
  fullscreen: 'Vollbild',
  dragToNote: 'In Notiz ziehen',
  selected: 'ausgewählt',
  addToNote: 'Zu Notiz hinzufügen',
  copyLinks: 'Links kopieren',
  delete: 'Löschen',
  cancel: 'Abbrechen',
  deleteConfirm: '{n} Bilder löschen?',
  copied: 'Kopiert!',
  copyLink: 'Link kopieren',
  addedToNote: 'Zu Notiz hinzugefügt!',
  deleteConfirmSingle: '{name} löschen?',
  addToNoteTitle: 'Zu Notiz hinzufügen',
  searchNotes: 'Notizen suchen...',
  galleryGuide: 'Galerie-Anleitung & Shortcuts',
  interactions: 'Interaktionen',
  helpDoubleClick: 'Doppelklick / Doppeltippen: Foto in Lightbox öffnen.',
  helpLeftClick: 'Einfach tippen (Bearbeitungsmodus): Auswählen.',
  helpDrag: 'Ziehen / Wischen: Galerie scrollen.',
  helpCtrlWheel: 'Strg + Mausrad / Pinch: Zoom.',
  helpPinch: 'Pinch: Zoom (Touch).',
  lightbox: 'Lightbox',
  helpArrows: 'Pfeile / Wischen: Navigieren. Escape / Doppeltippen: Schließen.',
  features: 'Funktionen',
  dateNewest: 'Datum (neueste)',
  dateOldest: 'Datum (älteste)',
  dateModificationNewest: 'Änderungen (neueste)',
  dateModificationOldest: 'Änderungen (älteste)',
  dateTakenNewest: 'Aufnahme',
  byType: 'Nach Typ',
  byExtension: 'Nach Erweiterung',
  createdNewest: 'Erstellt (neueste)',
  nameAZ: 'Name (A-Z)',
  sizeLargest: 'Größe (größte)',
  toolbarPin: 'Symbolleiste anpinnen (Auto-Ausblenden nach 10s deaktivieren)',
  dragHandle: 'In Notiz ziehen',
  previous: 'Zurück',
  next: 'Weiter',
  language: 'Sprache',
  settingsTitle: 'Lumina-Einstellungen',
  copyEmbedHtml: 'Embed-HTML kopieren',
  pasteVideoUrl: 'YouTube-URL einfügen oder ziehen (Strg+V) zum Abspielen',
};

const es: Record<StringKey, string> = {
  openLumina: 'Abrir Lumina',
  vaultUnavailable: 'Bóveda Obsidian no disponible',
  squareGrid: 'Cuadrícula',
  justifiedLayout: 'Diseño justificado',
  panorama: 'Panorama',
  panoramaHint: 'Panorama (rellenar altura). Clic de nuevo: cuadrado ↔ justificado',
  layoutCycle: 'Diseño (clic para cambiar)',
  search: 'Buscar',
  clearSearch: 'Borrar búsqueda',
  searchPlaceholder: 'Buscar...',
  sortBy: 'Ordenar por',
  filter: 'Filtrar',
  photos: 'Fotos',
  videos: 'Vídeos',
  filterFolders: 'Filtrar carpetas...',
  allVault: 'Toda la bóveda',
  toggleFilenames: 'Nombres de archivo',
  editMode: 'Modo edición',
  zoom: 'Zoom',
  help: 'Ayuda',
  slideshow: 'Presentación',
  slideshowHint: 'Presentación (ciclo: 5s, 10s, 30s, 60s, 10min, OFF)',
  fullscreen: 'Pantalla completa',
  dragToNote: 'Arrastrar a nota',
  selected: 'seleccionado(s)',
  addToNote: 'Añadir a nota',
  copyLinks: 'Copiar enlaces',
  delete: 'Eliminar',
  cancel: 'Cancelar',
  deleteConfirm: '¿Eliminar {n} imágenes?',
  copied: '¡Copiado!',
  copyLink: 'Copiar enlace',
  addedToNote: '¡Añadido a la nota!',
  deleteConfirmSingle: '¿Eliminar {name}?',
  addToNoteTitle: 'Añadir a nota',
  searchNotes: 'Buscar notas...',
  galleryGuide: 'Guía y atajos',
  interactions: 'Interacciones',
  helpDoubleClick: 'Doble clic / Doble toque: Abrir en vista previa.',
  helpLeftClick: 'Toque simple (modo edición): Seleccionar.',
  helpDrag: 'Arrastrar / Deslizar: Desplazar galería.',
  helpCtrlWheel: 'Ctrl + Rueda / Pellizco: Zoom.',
  helpPinch: 'Pellizco: Zoom táctil.',
  lightbox: 'Vista previa',
  helpArrows: 'Flechas / Deslizar: Navegar. Escape / Doble toque: Cerrar.',
  features: 'Funciones',
  dateNewest: 'Fecha (más reciente)',
  dateOldest: 'Fecha (más antigua)',
  dateModificationNewest: 'Modificaciones (reciente)',
  dateModificationOldest: 'Modificaciones (antigua)',
  dateTakenNewest: 'Toma',
  byType: 'Por tipo',
  byExtension: 'Por extensión',
  createdNewest: 'Creado (más reciente)',
  nameAZ: 'Nombre (A-Z)',
  sizeLargest: 'Tamaño (mayor)',
  toolbarPin: 'Fijar barra (desactivar ocultar tras 10s)',
  dragHandle: 'Arrastrar a nota',
  previous: 'Anterior',
  next: 'Siguiente',
  language: 'Idioma',
  settingsTitle: 'Ajustes de Lumina',
  copyEmbedHtml: 'Copiar HTML de inserción',
  pasteVideoUrl: 'Pegar o arrastrar URL de YouTube (Ctrl+V) para abrir en el reproductor',
};

const zh: Record<StringKey, string> = {
  openLumina: '打开 Lumina',
  vaultUnavailable: 'Obsidian 保险库不可用',
  squareGrid: '方形网格',
  justifiedLayout: '两端对齐布局',
  panorama: '全景',
  panoramaHint: '全景（填满高度）。再次点击：方形 ↔ 两端对齐',
  layoutCycle: '布局（点击切换）',
  search: '搜索',
  clearSearch: '清除搜索',
  searchPlaceholder: '搜索...',
  sortBy: '排序',
  filter: '筛选',
  photos: '照片',
  videos: '视频',
  filterFolders: '筛选文件夹...',
  allVault: '全部保险库',
  toggleFilenames: '显示文件名',
  editMode: '编辑模式',
  zoom: '缩放',
  help: '帮助',
  slideshow: '幻灯片',
  slideshowHint: '幻灯片（循环：5秒、10秒、30秒、60秒、10分钟、关闭）',
  fullscreen: '全屏',
  dragToNote: '拖到笔记',
  selected: '已选',
  addToNote: '添加到笔记',
  copyLinks: '复制链接',
  delete: '删除',
  cancel: '取消',
  deleteConfirm: '删除 {n} 张图片？',
  copied: '已复制！',
  copyLink: '复制链接',
  addedToNote: '已添加到笔记！',
  deleteConfirmSingle: '删除 {name}？',
  addToNoteTitle: '添加到笔记',
  searchNotes: '搜索笔记...',
  galleryGuide: '图库指南与快捷键',
  interactions: '交互',
  helpDoubleClick: '双击 / 双指点击：在灯箱中打开照片。',
  helpLeftClick: '单击（编辑模式）：选择。',
  helpDrag: '拖动 / 滑动：滚动图库。',
  helpCtrlWheel: 'Ctrl + 滚轮 / 捏合：缩放。',
  helpPinch: '捏合：触控缩放。',
  lightbox: '灯箱',
  helpArrows: '箭头 / 滑动：导航。Esc / 双指点击：关闭。',
  features: '功能',
  dateNewest: '日期（最新）',
  dateOldest: '日期（最旧）',
  dateModificationNewest: '修改（最新）',
  dateModificationOldest: '修改（最旧）',
  dateTakenNewest: '拍摄',
  byType: '按类型',
  byExtension: '按扩展名',
  createdNewest: '创建（最新）',
  nameAZ: '名称（A-Z）',
  sizeLargest: '大小（最大）',
  toolbarPin: '固定工具栏（禁用10秒后自动隐藏）',
  dragHandle: '拖到笔记',
  previous: '上一个',
  next: '下一个',
  language: '语言',
  settingsTitle: 'Lumina 设置',
  copyEmbedHtml: '复制嵌入 HTML',
  pasteVideoUrl: '粘贴或拖放 YouTube 链接 (Ctrl+V) 在播放器中打开',
};

const LOCALES: Record<LocaleKey, Record<StringKey, string>> = { en, fr, de, es, zh };

export function t(locale: LocaleKey, key: StringKey, params?: { n?: number; name?: string }): string {
  let str = (LOCALES[locale] ?? LOCALES.en)[key] ?? (LOCALES.en as Record<string, string>)[key] ?? key;
  if (params?.n != null) str = str.replace('{n}', String(params.n));
  if (params?.name != null) str = str.replace('{name}', params.name);
  return str;
}
