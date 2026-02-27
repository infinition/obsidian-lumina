/**
 * Extensions de fichiers supportées par Lumina
 * Organisées par catégorie pour une meilleure gestion
 */

export const FILE_EXTENSIONS = {
  // Images
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'ico', 'avif', 'apng'],
  
  // Vidéos
  videos: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv', 'm4v', 'flv', 'wmv'],
  
  // Audio
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
  
  // Documents
  documents: ['pdf', 'doc', 'docx', 'odt', 'txt', 'rtf', 'tex'],
  
  // Tableurs
  spreadsheets: ['xls', 'xlsx', 'ods', 'csv'],
  
  // Présentations
  presentations: ['ppt', 'pptx', 'odp'],
  
  // Code
  code: [
    'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'php',
    'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'r', 'lua', 'sh', 'bash'
  ],
  
  // Web
  web: ['html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'json', 'yaml', 'yml'],
  
  // 3D & Design
  threeD: ['fbx', 'obj', 'gltf', 'glb', 'stl', '3ds', 'blend', 'dae', 'ply'],
  
  // Images vectorielles & Design
  design: ['ai', 'eps', 'psd', 'xcf', 'sketch', 'fig'],
  
  // Archives
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  
  // Autres
  others: ['md', 'markdown', 'epub', 'mobi', 'apk', 'dmg', 'iso']
} as const;

/**
 * Liste plate de toutes les extensions supportées
 */
export const ALL_SUPPORTED_EXTENSIONS = [
  ...FILE_EXTENSIONS.images,
  ...FILE_EXTENSIONS.videos,
  ...FILE_EXTENSIONS.audio,
  ...FILE_EXTENSIONS.documents,
  ...FILE_EXTENSIONS.spreadsheets,
  ...FILE_EXTENSIONS.presentations,
  ...FILE_EXTENSIONS.code,
  ...FILE_EXTENSIONS.web,
  ...FILE_EXTENSIONS.threeD,
  ...FILE_EXTENSIONS.design,
  ...FILE_EXTENSIONS.archives,
  ...FILE_EXTENSIONS.others
];

/**
 * Vérifie si un fichier est supporté par Lumina
 */
export function isSupportedFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? ALL_SUPPORTED_EXTENSIONS.includes(ext as any) : false;
}

/**
 * Obtient la catégorie d'un fichier
 */
export function getFileCategory(filename: string): keyof typeof FILE_EXTENSIONS | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  
  for (const [category, extensions] of Object.entries(FILE_EXTENSIONS)) {
    if ((extensions as readonly string[]).includes(ext)) {
      return category as keyof typeof FILE_EXTENSIONS;
    }
  }
  return null;
}

/**
 * Obtient l'icône appropriée pour une catégorie de fichier
 */
export function getCategoryIcon(category: keyof typeof FILE_EXTENSIONS): string {
  const icons: Record<keyof typeof FILE_EXTENSIONS, string> = {
    images: 'image',
    videos: 'video',
    audio: 'music',
    documents: 'file-text',
    spreadsheets: 'table',
    presentations: 'presentation',
    code: 'code',
    web: 'globe',
    threeD: 'box',
    design: 'palette',
    archives: 'archive',
    others: 'file'
  };
  return icons[category] || 'file';
}

/**
 * Obtient une couleur appropriée pour une catégorie de fichier
 */
export function getCategoryColor(category: keyof typeof FILE_EXTENSIONS): string {
  const colors: Record<keyof typeof FILE_EXTENSIONS, string> = {
    images: '#10b981',
    videos: '#ef4444',
    audio: '#8b5cf6',
    documents: '#3b82f6',
    spreadsheets: '#22c55e',
    presentations: '#f59e0b',
    code: '#6366f1',
    web: '#ec4899',
    threeD: '#14b8a6',
    design: '#f43f5e',
    archives: '#84cc16',
    others: '#6b7280'
  };
  return colors[category] || '#6b7280';
}
