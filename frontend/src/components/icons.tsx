// ───── Icons ─────
// All icons are lucide line icons, 16px (18px for section marks),
// 1.5 stroke. One wrapper keeps size/stroke consistent everywhere.
import type { LucideIcon } from 'lucide-react';
import {
  Archive, AudioLines, Bot, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Clock, Cloud, Copy, Download, Eye, EyeOff,
  File, FileArchive, FileCode2, FileSpreadsheet, FileText, Film, Folder,
  FolderOpen, FolderPlus, HardDrive, Image, KeyRound, Link2, LoaderCircle,
  Lock, LockOpen, LogOut, Menu, Move, Music, Pause, Pencil, Play, Plus,
  RefreshCw, RotateCcw, Save, Search, Settings, ShieldCheck, SkipBack,
  SkipForward, Trash2, TriangleAlert, Upload, X,
} from 'lucide-react';
import type { CSSProperties } from 'react';

export type IconProps = {
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
};

function make(Icon: LucideIcon) {
  return function IconWrap({ size = 16, color, style, className }: IconProps) {
    return <Icon size={size} strokeWidth={1.5} color={color} style={style} className={className} aria-hidden />;
  };
}

export const I = {
  archive: make(Archive),
  audio: make(AudioLines),
  bot: make(Bot),
  check: make(Check),
  chevronDown: make(ChevronDown),
  chevronLeft: make(ChevronLeft),
  chevronRight: make(ChevronRight),
  chevronsLeft: make(ChevronsLeft),
  chevronsRight: make(ChevronsRight),
  clock: make(Clock),
  cloud: make(Cloud),
  copy: make(Copy),
  download: make(Download),
  eye: make(Eye),
  eyeOff: make(EyeOff),
  file: make(File),
  fileArchive: make(FileArchive),
  fileCode: make(FileCode2),
  fileSheet: make(FileSpreadsheet),
  fileText: make(FileText),
  film: make(Film),
  folder: make(Folder),
  folderOpen: make(FolderOpen),
  folderPlus: make(FolderPlus),
  drive: make(HardDrive),
  image: make(Image),
  key: make(KeyRound),
  link: make(Link2),
  loader: make(LoaderCircle),
  lock: make(Lock),
  lockOpen: make(LockOpen),
  logout: make(LogOut),
  menu: make(Menu),
  move: make(Move),
  music: make(Music),
  pause: make(Pause),
  pencil: make(Pencil),
  play: make(Play),
  plus: make(Plus),
  refresh: make(RefreshCw),
  revert: make(RotateCcw),
  save: make(Save),
  search: make(Search),
  settings: make(Settings),
  shield: make(ShieldCheck),
  skipBack: make(SkipBack),
  skipForward: make(SkipForward),
  trash: make(Trash2),
  alert: make(TriangleAlert),
  upload: make(Upload),
  x: make(X),
} as const;

/** File-type icon by extension, replacing the old emoji map. */
export function FileIcon({ name, size = 18 }: { name: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const color = 'var(--text-secondary)';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return <I.image size={size} color={color} />;
  if (['mp4', 'mkv', 'mov', 'webm'].includes(ext)) return <I.film size={size} color={color} />;
  if (['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'].includes(ext)) return <I.music size={size} color={color} />;
  if (ext === 'pdf') return <I.fileText size={size} color="var(--danger)" />;
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return <I.fileText size={size} color={color} />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <I.fileArchive size={size} color={color} />;
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'sh', 'css', 'sql'].includes(ext)) return <I.fileCode size={size} color={color} />;
  if (['json', 'csv', 'xlsx', 'xls'].includes(ext)) return <I.fileSheet size={size} color={color} />;
  return <I.file size={size} color={color} />;
}
