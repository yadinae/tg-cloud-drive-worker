// ───── Dashboard ─────
// Stateful shell: all data loading, uploads, drag-drop, audio, shares and
// settings handlers live here (ported unchanged from App.tsx); the JSX is
// split into TopBar / Sidebar / FileList / ShareList / SettingsView and
// the modal components. window.alert / window.confirm are replaced by
// an in-app toast and ConfirmModal.
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStats, fetchTopics, createTopic, renameTopic, fetchFiles, uploadFile, deleteFile, renameFile, searchFiles, fetchAllShares, updateShare, downloadFile, downloadFiles, transferFromUrl, fetchFolders, createFolderApi, renameFolderApi, deleteFolderApi, fetchFolderPath, fetchAllFolderShares, deleteFolderShare, deleteShare, fetchConfig, updateConfig, changePassword, cleanupOrphans } from '../api/client';
import { formatBytes, getCategory, isAudioFile, isImageFile } from './types';
import type { ConfirmFn, DriveFile, Folder, NotifyFn, ShareCategory, ShareLink, Topic } from './types';
import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import FileList from '../components/FileList';
import ShareList from '../components/ShareList';
import SettingsView from '../components/SettingsView';
import ShareManager from '../components/ShareManager';
import FolderShareModal from '../components/FolderShareModal';
import type { FolderShareTarget } from '../components/FolderShareModal';
import PreviewModal from '../components/PreviewModal';
import GalleryModal from '../components/GalleryModal';
import MoveModal from '../components/MoveModal';
import EditShareModal from '../components/EditShareModal';
import type { EditShareState } from '../components/EditShareModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import type { ChangePasswordState } from '../components/ChangePasswordModal';
import RenameModal from '../components/RenameModal';
import AudioPlayerBar from '../components/AudioPlayerBar';
import type { AudioHandlers } from '../components/AudioPlayerBar';
import ProgressToasts from '../components/ProgressToasts';
import type { BatchProgress, DownloadProgress } from '../components/ProgressToasts';
import { ConfirmModal, Toast } from '../components/ui';

const PAGE_SIZE = 50;

interface ConfirmRequest { message: string; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void; }

export default function Dashboard() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [stats, setStats] = useState({ fileCount: 0, totalSize: 0, topicCount: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newTopicName, setNewTopicName] = useState('');
  const [shareFile, setShareFile] = useState<DriveFile | null>(null);
  const [folderShareTarget, setFolderShareTarget] = useState<FolderShareTarget | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string; type: 'topic' | 'file' | 'folder' } | null>(null);

  // Toast + confirm (replacing alert / confirm)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const notify: NotifyFn = useCallback((text, kind = 'success') => {
    setToast({ kind, text });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const confirmAsync: ConfirmFn = useCallback((message, opts) => {
    return new Promise<boolean>((resolve) => {
      setConfirmReq({ message, confirmLabel: opts?.confirmLabel ?? '确认', danger: opts?.danger ?? false, resolve });
    });
  }, []);

  // Share management state
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ShareCategory | 'all' | null>(null);
  const [editShare, setEditShare] = useState<ShareLink | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editRemovePassword, setEditRemovePassword] = useState(false);
  const [editExpiresIn, setEditExpiresIn] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({ active: false, pct: 0 });
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const [transferUrl, setTransferUrl] = useState('');
  const [transferName, setTransferName] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPath, setFolderPath] = useState<{ id: number; name: string }[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFolderName, setUploadingFolderName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ─── Audio Player State ───
  const [audioQueue, setAudioQueue] = useState<DriveFile[]>([]);
  const [audioIndex, setAudioIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const showAudioPlayer = audioIndex >= 0 && audioQueue.length > 0;

  // ─── Pagination ───
  const [page, setPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalFiles / PAGE_SIZE));

  // ─── Settings / Config state ───
  const [activeView, setActiveView] = useState<'topics' | 'settings'>('topics');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpOldPassword, setCpOldPassword] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmPassword, setCpConfirmPassword] = useState('');
  const [cpSaving, setCpSaving] = useState(false);
  const [cpMessage, setCpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const r = await fetchConfig();
      setSettings(r.settings);
      setSettingsMessage(null);
    } catch (e: any) {
      setSettingsMessage({ type: 'error', text: '加载设置失败: ' + (e.message || '网络错误') });
    }
  }, []);

  const loadTopics = useCallback(async () => {
    const r = await fetchTopics();
    setTopics(r.topics);
  }, []);

  const loadFiles = useCallback(async (topicId: number, folderId?: undefined | number | null, targetPage?: number) => {
    const folderParam = folderId === undefined ? undefined : (folderId === null ? '' : String(folderId));
    const pg = targetPage ?? page;
    const r = await fetchFiles(topicId, folderParam, pg, PAGE_SIZE);
    setFiles(r.files);
    setTotalFiles(r.total);
  }, [page]);

  const loadStats = useCallback(async () => {
    const r = await fetchStats();
    setStats(r);
  }, []);

  const loadShares = useCallback(async () => {
    setSharesLoading(true);
    try {
      const [r, fr] = await Promise.all([
        fetchAllShares(),
        fetchAllFolderShares(),
      ]);
      const fileShares = (r.shares || []).map((s: any) => ({ ...s, _type: 'file' }));
      const folderItems = (fr.shares || []).map((fs: any) => ({
        code: fs.code || '',
        fileId: 0,
        fileName: fs.name || '(unnamed)',
        fileSize: fs.fileCount || 0,
        hasPassword: !!fs.hasPassword,
        // 注意：这里是白名单映射，新增字段要显式加上，否则列表里读不到。
        // 之前漏了 password，文件夹分享的眼睛图标只能显示 (hash only)。
        password: fs.password || null,
        expiresAt: fs.expiresAt || null,
        downloadCount: fs.downloadCount || 0,
        createdAt: fs.createdAt || 0,
        _type: 'folder' as const,
      }));
      setShares([...fileShares, ...folderItems]);
    } catch (e) { /* ignore */ }
    setSharesLoading(false);
  }, []);

  const loadFolders = useCallback(async (topicId: number, parentId?: number | null) => {
    const r = await fetchFolders(topicId, parentId);
    setFolders(r.folders);
  }, []);

  useEffect(() => { loadTopics(); loadStats(); loadShares(); }, [loadTopics, loadStats, loadShares]);

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;
    await createTopic(newTopicName.trim());
    setNewTopicName('');
    await loadTopics();
  };

  const handleRename = async () => {
    if (!renaming || !renaming.name.trim()) return;
    if (renaming.type === 'topic') {
      await renameTopic(renaming.id, renaming.name.trim());
      await loadTopics();
    } else if (renaming.type === 'folder') {
      await renameFolderApi(renaming.id, renaming.name.trim());
      if (currentTopic) await loadFolders(currentTopic.topicId, currentFolder);
    } else {
      await renameFile(renaming.id, renaming.name.trim());
      if (currentTopic) await loadFiles(currentTopic.topicId, currentFolder);
    }
    setRenaming(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.target;
    if (!fileInput.files || !fileInput.files.length || !currentTopic) return;
    const fileList = Array.from(fileInput.files);
    setUploading(true);
    setUploadProgress(0);
    try {
      for (let idx = 0; idx < fileList.length; idx++) {
        const file = fileList[idx];
        await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((idx * 100 + pct) / fileList.length))), currentFolder);
      }
      await loadFiles(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) {
      notify('Upload failed: ' + err.message, 'error');
    }
    setUploading(false);
    setUploadProgress(0);
    fileInput.value = '';
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (!input.files || !input.files.length || !currentTopic) return;
    const fileList = Array.from(input.files);
    const folderName = fileList[0].webkitRelativePath?.split('/')[0] || 'folder';
    setUploading(true);
    setUploadProgress(0);
    setUploadingFolderName(folderName);
    try {
      const dirMap = new Map<string, File[]>();
      for (const file of fileList) {
        const parts = file.webkitRelativePath?.split('/') || [file.name];
        const dirPath = parts.slice(0, -1).join('/');
        if (!dirMap.has(dirPath)) dirMap.set(dirPath, []);
        dirMap.get(dirPath)!.push(file);
      }
      const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
      let folderCache: Folder[] = [];
      try { const r = await fetchFolders(currentTopic.topicId); folderCache = r.folders || []; } catch {}

      function resolveFolderId(leafName: string, parentId: number | null): number | null {
        const existing = folderCache.find((f: Folder) => f.name === leafName && f.parentId === parentId);
        return existing?.id ?? null;
      }

      const pathFolderMap = new Map<string, number | null>();
      pathFolderMap.set('', currentFolder);
      let total = 0, done = 0;
      for (const [, files] of sortedDirs) total += files.length;
      for (const [dirPath, files] of sortedDirs) {
        const parts = dirPath ? dirPath.split('/') : [];
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = pathFolderMap.get(parentPath) ?? currentFolder;
        let folderId: number | null = parentId;
        if (parts.length > 0) {
          const leafName = parts[parts.length - 1];
          const existingId = resolveFolderId(leafName, parentId);
          if (existingId !== null) {
            folderId = existingId;
          } else {
            const cr = await createFolderApi(currentTopic.topicId, leafName, parentId);
            folderId = cr.folder?.id ?? null;
          }
        }
        pathFolderMap.set(dirPath, folderId);
        for (const file of files) {
          await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((done * 100 + pct) / total))), folderId);
          done++;
        }
      }
      await loadFiles(currentTopic.topicId, currentFolder);
      await loadFolders(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) {
      notify('Folder upload failed: ' + err.message, 'error');
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadingFolderName('');
    input.value = '';
  };

  const handleDeleteFile = async (id: number) => {
    await deleteFile(id);
    if (currentTopic) await loadFiles(currentTopic.topicId);
    await loadStats();
  };

  // ─── File Move ───
  const [moveFile, setMoveFile] = useState<DriveFile | null>(null);
  const [moveFileCount, setMoveFileCount] = useState(0);
  const [moveTargetFolder, setMoveTargetFolder] = useState<number | null>(null);
  const [moveTargetFolders, setMoveTargetFolders] = useState<Folder[]>([]);
  const [moveTopicId, setMoveTopicId] = useState<number | null>(null);
  const [moveTopics, setMoveTopics] = useState<Topic[]>([]);

  // ─── Batch Selection ───
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());

  const toggleFileSelect = (id: number) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllFiles = () => {
    if (selectedFileIds.size === files.length) setSelectedFileIds(new Set());
    else setSelectedFileIds(new Set(files.map(f => f.id)));
  };

  const handleOpenMove = async (f: DriveFile) => {
    setMoveFile(f);
    setMoveTopicId(f.topicId);
    setMoveTargetFolder(f.folderId);
    setMoveTargetFolders([]);
    setMoveTopics([]);
    try {
      const t = await fetchTopics();
      setMoveTopics(t.topics || []);
      const r = await fetchFolders(f.topicId);
      const allFolders = (r.folders || []).filter((folder: Folder) => folder.id !== f.folderId);
      setMoveTargetFolders(allFolders);
    } catch (err: any) {
      notify('Failed to load topics/folders: ' + (err.message || 'unknown error'), 'error');
      setMoveTargetFolders([]);
    }
  };

  const handleChangeMoveTopic = async (topicId: number) => {
    setMoveTopicId(topicId);
    setMoveTargetFolder(null);
    setMoveTargetFolders([]);
    try {
      const r = await fetchFolders(topicId);
      setMoveTargetFolders(r.folders || []);
    } catch {
      setMoveTargetFolders([]);
    }
  };

  const handleConfirmMove = async () => {
    if (!moveFile || moveTopicId === null) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionId = localStorage.getItem('tgcd_session_id');
      if (sessionId) headers['X-Session-Id'] = sessionId;
      else {
        const token = localStorage.getItem('tgcd_auth_token');
        if (token) headers['Authorization'] = 'Bearer ' + token;
      }
      const res = await fetch('/api/files/' + moveFile.id + '/move', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ topicId: moveTopicId, folderId: moveTargetFolder }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Move failed');
      setMoveFile(null);
      if (currentTopic) await loadFiles(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) {
      notify('Move failed: ' + err.message, 'error');
    }
  };

  const handleBatchMoveOpen = async () => {
    if (selectedFileIds.size === 0) return;
    setMoveFileCount(selectedFileIds.size);
    setMoveTopicId(currentTopic?.topicId ?? null);
    setMoveTargetFolder(currentFolder);
    setMoveTargetFolders([]);
    setMoveTopics([]);
    try {
      const t = await fetchTopics();
      setMoveTopics(t.topics || []);
      if (currentTopic) {
        const r = await fetchFolders(currentTopic.topicId);
        setMoveTargetFolders(r.folders || []);
      }
    } catch {}
  };

  const handleBatchMoveConfirm = async () => {
    if (moveTopicId === null || selectedFileIds.size === 0) return;
    const ids = Array.from(selectedFileIds);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionId = localStorage.getItem('tgcd_session_id');
    if (sessionId) headers['X-Session-Id'] = sessionId;
    else {
      const token = localStorage.getItem('tgcd_auth_token');
      if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    setMoveFileCount(0);
    setBatchProgress({ active: true, current: 0, total: ids.length, label: 'Moving...' });
    let moved = 0, failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/files/' + id + '/move', {
          method: 'PUT', headers,
          body: JSON.stringify({ topicId: moveTopicId, folderId: moveTargetFolder }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Move failed');
        moved++;
      } catch (e: any) {
        failed++;
        console.error('Move file ' + id + ' failed:', e.message);
      }
      setBatchProgress({ active: true, current: moved + failed, total: ids.length, label: 'Moving...' });
    }
    setBatchProgress({ active: false, current: 0, total: 0, label: '' });
    setSelectedFileIds(new Set());
    if (currentTopic) await loadFiles(currentTopic.topicId, currentFolder);
    await loadTopics();
    if (failed > 0) notify('Moved ' + moved + ' files, ' + failed + ' failed', 'error');
  };

  // ─── Gallery state ───
  const [galleryFiles, setGalleryFiles] = useState<DriveFile[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // ─── Batch progress ───
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({ active: false, current: 0, total: 0, label: '' });
  const batchBusy = batchProgress.active || downloadProgress.active;

  const handleBatchDownload = useCallback(() => {
    const selected = files.filter(f => selectedFileIds.has(f.id));
    if (selected.length === 0 || batchBusy) return;
    setBatchProgress({ active: true, current: 0, total: selected.length, label: 'Downloading...' });
    downloadFiles(selected, (idx, total, name, pct) => {
      setDownloadProgress({ active: true, fileName: name, pct, batch: { current: idx, total } });
      setBatchProgress({ active: true, current: idx, total, label: 'Downloading...' });
    }).finally(() => {
      setDownloadProgress({ active: false, pct: 0 });
      setBatchProgress({ active: false, current: 0, total: 0, label: '' });
    });
  }, [files, selectedFileIds, batchBusy]);

  const handleBatchDelete = async () => {
    const selected = files.filter(f => selectedFileIds.has(f.id));
    if (selected.length === 0 || batchBusy) return;
    if (!await confirmAsync(`Delete ${selected.length} file(s)? This cannot be undone.`, { confirmLabel: 'Delete', danger: true })) return;
    setBatchProgress({ active: true, current: 0, total: selected.length, label: 'Deleting...' });
    let deleted = 0, failed = 0;
    for (const f of selected) {
      try {
        await deleteFile(f.id);
        deleted++;
      } catch { failed++; }
      setBatchProgress({ active: true, current: deleted + failed, total: selected.length, label: 'Deleting...' });
    }
    setBatchProgress({ active: false, current: 0, total: 0, label: '' });
    setSelectedFileIds(new Set());
    if (currentTopic) await loadFiles(currentTopic.topicId, currentFolder);
    await loadTopics();
    if (failed > 0) notify('Deleted ' + deleted + ' files, ' + failed + ' failed', 'error');
  };

  const handleBatchGallery = () => {
    const selected = files.filter(f => selectedFileIds.has(f.id) && isImageFile(f));
    if (selected.length === 0) return;
    setGalleryFiles(selected);
    setGalleryIndex(0);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const r = await searchFiles(searchQuery);
    setFiles(r.files);
  };

  const handleFolderClick = async (folder: Folder) => {
    setCurrentFolder(folder.id);
    if (folder.parentId === null) setFolderPath([{ id: folder.id, name: folder.name }]);
    else { try { const r = await fetchFolderPath(folder.id); setFolderPath(r.path); } catch { setFolderPath([{ id: folder.id, name: folder.name }]); } }
    setPage(1);
    await Promise.all([loadFiles(folder.topicId, folder.id, 1), loadFolders(folder.topicId, folder.id)]);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentTopic) return;
    await createFolderApi(currentTopic.topicId, newFolderName.trim(), currentFolder);
    setNewFolderName('');
    await loadFolders(currentTopic.topicId, currentFolder);
  };

  const handleDeleteFolder = async (folderId: number) => {
    if (!currentTopic) return;
    await deleteFolderApi(folderId, currentTopic.topicId);
    if (currentFolder === folderId) { setCurrentFolder(null); setFolderPath([]); await loadFiles(currentTopic.topicId, null); }
    await loadFolders(currentTopic.topicId, currentFolder);
  };

  const handleBreadcrumb = async (folderId: number | null, idx: number) => {
    if (!currentTopic) return;
    if (folderId === null) { setCurrentFolder(null); setFolderPath([]); }
    else { setCurrentFolder(folderId); setFolderPath(folderPath.slice(0, idx + 1)); }
    setPage(1);
    await Promise.all([loadFiles(currentTopic.topicId, folderId, 1), loadFolders(currentTopic.topicId, folderId)]);
  };

  const handleTransfer = async () => {
    if (!transferUrl.trim() || !currentTopic) return;
    setTransferring(true); setTransferError('');
    try {
      await transferFromUrl({ url: transferUrl.trim(), topicId: currentTopic.topicId, name: transferName.trim() || undefined, folderId: currentFolder });
      setTransferUrl(''); setTransferName('');
      await loadFiles(currentTopic.topicId, currentFolder); await loadStats();
    } catch (e: any) { setTransferError(e.message || 'Transfer failed'); }
    setTransferring(false);
  };

  const handleDownloadSingle = async (f: DriveFile) => {
    setDownloadProgress({ active: true, fileName: f.name, pct: 0 });
    try { await downloadFile(f.id, f.name, (pct) => setDownloadProgress(prev => ({ ...prev, pct }))); }
    catch (err: any) { notify('Download failed: ' + err.message, 'error'); }
    setDownloadProgress({ active: false, pct: 0 });
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer.items && e.dataTransfer.items.length > 0) { setDragging(true); e.dataTransfer.effectAllowed = 'copy'; } };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); } };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; };
  const handleDropFiles = async (fileList: FileList) => {
    if (!fileList.length || !currentTopic) return;
    const hasFolderStructure = Array.from(fileList).some(f => f.webkitRelativePath && f.webkitRelativePath.includes('/'));
    if (hasFolderStructure) {
      handleFolderDropFiles(fileList);
      return;
    }
    setUploading(true); setUploadProgress(0);
    try {
      for (let i = 0; i < fileList.length; i++) {
        await uploadFile(currentTopic.topicId, fileList[i], (pct) => setUploadProgress(Math.round(((i * 100 + pct) / fileList.length))), currentFolder);
      }
      await loadFiles(currentTopic.topicId, currentFolder); await loadTopics();
    } catch (err: any) { notify('Upload failed: ' + err.message, 'error'); }
    setUploading(false); setUploadProgress(0);
  };

  const handleFolderDropFiles = async (fileList: FileList) => {
    if (!currentTopic) return;
    const files = Array.from(fileList);
    const folderName = files[0].webkitRelativePath?.split('/')[0] || 'folder';
    setUploading(true); setUploadProgress(0);
    setUploadingFolderName(folderName);
    try {
      const dirMap = new Map<string, File[]>();
      for (const file of files) {
        const parts = file.webkitRelativePath?.split('/') || [file.name];
        const dirPath = parts.slice(0, -1).join('/');
        if (!dirMap.has(dirPath)) dirMap.set(dirPath, []);
        dirMap.get(dirPath)!.push(file);
      }
      const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
      let folderCache: Folder[] = [];
      try { const r = await fetchFolders(currentTopic.topicId); folderCache = r.folders || []; } catch {}
      const resolveFolderId = (leafName: string, parentId: number | null): number | null => {
        const existing = folderCache.find((f: Folder) => f.name === leafName && f.parentId === parentId);
        return existing?.id ?? null;
      };
      const pathFolderMap = new Map<string, number | null>();
      pathFolderMap.set('', currentFolder);
      let total = 0, done = 0;
      for (const [, f] of sortedDirs) total += f.length;
      for (const [dirPath, f] of sortedDirs) {
        const parts = dirPath ? dirPath.split('/') : [];
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = pathFolderMap.get(parentPath) ?? currentFolder;
        let folderId: number | null = parentId;
        if (parts.length > 0) {
          const leafName = parts[parts.length - 1];
          const existingId = resolveFolderId(leafName, parentId);
          if (existingId !== null) {
            folderId = existingId;
          } else {
            const cr = await createFolderApi(currentTopic.topicId, leafName, parentId);
            folderId = cr.folder?.id ?? null;
          }
        }
        pathFolderMap.set(dirPath, folderId);
        for (const file of f) {
          await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((done * 100 + pct) / total))), folderId);
          done++;
        }
      }
      await loadFiles(currentTopic.topicId, currentFolder);
      await loadFolders(currentTopic.topicId, currentFolder);
      await loadTopics();
    } catch (err: any) { notify('Folder drop failed: ' + err.message, 'error'); }
    setUploading(false); setUploadProgress(0);
    setUploadingFolderName('');
  };

  const traverseEntry = async (entry: any, basePath: string): Promise<Array<{ file: File; relPath: string }>> => {
    const results: Array<{ file: File; relPath: string }> = [];
    if (entry.isFile) {
      const f = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      results.push({ file: f, relPath: basePath });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let entries: FileSystemEntry[] = [];
      do {
        entries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of entries) {
          const childPath = basePath ? `${basePath}/${child.name}` : child.name;
          const childResults = await traverseEntry(child, childPath);
          results.push(...childResults);
        }
      } while (entries.length > 0);
    }
    return results;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(false); dragCounter.current = 0;

    // ★ 同步提取文件列表 — 必须在任何 await 之前完成，否则 dataTransfer 会被浏览器清空
    const dt = e.dataTransfer;
    if (!dt) return;
    const fileList = dt.files;
    const items = dt.items;

    if (!items || items.length === 0 || !Array.from(items).some(i => (i as any).webkitGetAsEntry?.()?.isDirectory)) {
      if (fileList && fileList.length > 0 && currentTopic) {
        await handleDropFiles(fileList);
      }
      return;
    }

    let hasDir = false;
    const allItems: Array<{ file: File; relPath: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as any).webkitGetAsEntry?.();
      if (!entry) {
        if (fileList[i]) allItems.push({ file: fileList[i], relPath: '' });
        continue;
      }
      if (entry.isDirectory) {
        const results = await traverseEntry(entry, entry.name);
        for (const r of results) {
          hasDir = true;
          allItems.push(r);
        }
      } else {
        const f = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
        allItems.push({ file: f, relPath: '' });
      }
    }

    if (hasDir && allItems.length > 0 && currentTopic) {
      setUploading(true); setUploadProgress(0);
      const rootName = allItems[0].relPath.split('/')[0] || 'folder';
      setUploadingFolderName(rootName);
      try {
        const dirMap = new Map<string, typeof allItems>();
        for (const { file, relPath } of allItems) {
          const parts = relPath.split('/');
          const dirPath = parts.slice(0, -1).join('/');
          if (!dirMap.has(dirPath)) dirMap.set(dirPath, []);
          dirMap.get(dirPath)!.push({ file, relPath });
        }
        const sortedDirs = Array.from(dirMap.entries()).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
        let folderCache: Folder[] = [];
        try { const r = await fetchFolders(currentTopic.topicId); folderCache = r.folders || []; } catch {}
        const resolveFolderId = (leafName: string, parentId: number | null): number | null => {
          const existing = folderCache.find((f: Folder) => f.name === leafName && f.parentId === parentId);
          return existing?.id ?? null;
        };
        const pathFolderMap = new Map<string, number | null>();
        pathFolderMap.set('', currentFolder);
        let total = 0, done = 0;
        for (const [, f] of sortedDirs) total += f.length;
        for (const [dirPath, f] of sortedDirs) {
          const parts = dirPath ? dirPath.split('/') : [];
          const parentPath = parts.slice(0, -1).join('/');
          const parentId = pathFolderMap.get(parentPath) ?? currentFolder;
          let folderId: number | null = parentId;
          if (parts.length > 0) {
            const leafName = parts[parts.length - 1];
            const existingId = resolveFolderId(leafName, parentId);
            if (existingId !== null) { folderId = existingId; }
            else {
              const cr = await createFolderApi(currentTopic.topicId, leafName, parentId);
              folderId = cr.folder?.id ?? null;
            }
          }
          pathFolderMap.set(dirPath, folderId);
          for (const { file } of f) {
            await uploadFile(currentTopic.topicId, file, (pct) => setUploadProgress(Math.round(((done * 100 + pct) / total))), folderId);
            done++;
          }
        }
        await loadFiles(currentTopic.topicId, currentFolder);
        await loadFolders(currentTopic.topicId, currentFolder);
        await loadTopics();
      } catch (err: any) { notify('Folder drop failed: ' + (err.message || 'Network error'), 'error'); }
      setUploading(false); setUploadProgress(0); setUploadingFolderName('');
    }
  };

  // ─── Audio Player ───
  useEffect(() => {
    const audioFiles = files.filter(f => isAudioFile(f));
    if (audioFiles.length > 0 && audioQueue.length === 0) {
      setAudioQueue(audioFiles);
    }
  }, [files, audioQueue.length]);

  useEffect(() => {
    if (audioIndex >= 0 && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [audioIndex]);

  const audioHandlers: AudioHandlers = {
    play(idx: number) {
      if (idx < 0 || idx >= files.length) return;
      const audioFiles = files.filter(f => isAudioFile(f));
      const audioIdx = audioFiles.findIndex(af => af.id === files[idx]?.id);
      if (audioIdx < 0) return;
      setAudioQueue(audioFiles);
      setAudioIndex(audioIdx);
    },
    togglePlay() {
      if (!audioRef.current) return;
      if (audioRef.current.paused) { audioRef.current.play(); setIsPlaying(true); }
      else { audioRef.current.pause(); setIsPlaying(false); }
    },
    next() {
      const nextIdx = audioIndex + 1 < audioQueue.length ? audioIndex + 1 : 0;
      audioHandlers.play(nextIdx);
    },
    prev() {
      const prevIdx = audioIndex - 1 >= 0 ? audioIndex - 1 : audioQueue.length - 1;
      audioHandlers.play(prevIdx);
    },
    seek(e: React.MouseEvent<HTMLDivElement>) {
      if (!audioRef.current || !audioDuration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audioRef.current.currentTime = pct * audioDuration;
    },
    onTimeUpdate() {
      if (audioRef.current) setAudioProgress(audioRef.current.currentTime);
    },
    onLoadedMetadata() {
      if (audioRef.current) setAudioDuration(audioRef.current.duration);
    },
    onEnded() { audioHandlers.next(); },
    onPlay() { setIsPlaying(true); },
    onPause() { setIsPlaying(false); },
  };

  // ─── Share handlers ───
  const getShareUrl = (share: any) => {
    return window.location.origin + (share._type === 'folder' ? '/dl/f/' : '/dl/') + share.code;
  };

  const handleCopy = async (code: string) => {
    const share = shares.find(s => s.code === code);
    const url = getShareUrl(share || { code, _type: 'file' });
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch { notify('Copy failed. Link: ' + url, 'error'); }
  };

  const handleRevoke = async (code: string) => {
    const share = shares.find(s => s.code === code);
    try {
      if (share?._type === 'folder') {
        await deleteFolderShare(code);
      } else {
        await deleteShare(code);
      }
      setShares(shares.filter(s => s.code !== code));
    } catch (e: any) { notify('Revoke failed: ' + e.message, 'error'); }
  };

  const handleEditOpen = (share: ShareLink) => {
    setEditShare(share);
    setEditPassword('');
    setEditRemovePassword(false);
    setEditExpiresIn(share.expiresAt ? Math.round((share.expiresAt - Date.now()) / 1000) : 0);
  };

  const handleSaveEdit = async () => {
    if (!editShare) return;
    setSavingEdit(true);
    try {
      const body: any = {};
      if (editPassword) body.password = editPassword;
      else if (editRemovePassword) body.password = '';
      body.expiresIn = editExpiresIn;
      await updateShare(editShare.code, body);
      setEditShare(null);
      loadShares();
    } catch (e: any) { notify('Update failed: ' + e.message, 'error'); }
    finally { setSavingEdit(false); }
  };

  const filteredShares = !activeCategory || activeCategory === 'all'
    ? shares : shares.filter(s => getCategory(s) === activeCategory);

  const handleCategoryClick = (cat: ShareCategory | 'all') => {
    setActiveCategory(cat);
    setActiveView('topics');
    setCurrentTopic(null);
    setFiles([]);
    setSidebarOpen(false);
  };

  const handleTopicClick = (topic: Topic | null) => {
    setActiveCategory(null);
    setActiveView('topics');
    setCurrentTopic(topic);
    setCurrentFolder(null);
    setFolderPath([]);
    setPage(1);
    if (topic) { loadFiles(topic.topicId, null, 1); loadFolders(topic.topicId, null); }
    else setFiles([]);
    setSidebarOpen(false);
  };

  // ─── Settings handlers ───
  const handleSettingsClick = () => {
    setActiveView('settings');
    setActiveCategory(null);
    setCurrentTopic(null);
    setFiles([]);
    loadSettings();
    setSidebarOpen(false);
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMessage(null);
    try {
      await updateConfig(settings);
      setSettingsMessage({ type: 'success', text: '设置已保存' });
      setTimeout(() => setSettingsMessage(null), 3000);
    } catch (e: any) {
      setSettingsMessage({ type: 'error', text: '保存失败: ' + (e.message || '未知错误') });
    }
    setSettingsSaving(false);
  };

  const handleChangePassword = async () => {
    if (!cpOldPassword || !cpNewPassword || !cpConfirmPassword) {
      setCpMessage({ type: 'error', text: '请填写所有密码字段' });
      return;
    }
    if (cpNewPassword !== cpConfirmPassword) {
      setCpMessage({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }
    if (cpNewPassword.length < 6) {
      setCpMessage({ type: 'error', text: '新密码长度至少6位' });
      return;
    }
    setCpSaving(true);
    setCpMessage(null);
    try {
      const r = await changePassword(cpOldPassword, cpNewPassword);
      setCpMessage({ type: 'success', text: r.message || '密码已更新' });
      setCpOldPassword(''); setCpNewPassword(''); setCpConfirmPassword('');
    } catch (e: any) {
      setCpMessage({ type: 'error', text: e.message || '密码修改失败' });
    }
    setCpSaving(false);
  };

  const handleCleanupOrphans = async () => {
    setCleanupLoading(true);
    setCleanupMessage(null);
    try {
      const r = await cleanupOrphans(2); // default 2 hours
      setCleanupMessage({ type: 'success', text: `清理完成：删除 ${r.totalDeleted} 个孤儿上传，失败 ${r.totalFailed} 个，发现 ${r.totalFound} 个，跳过 ${r.totalSkipped} 个` });
    } catch (e: any) {
      setCleanupMessage({ type: 'error', text: '清理失败: ' + (e.message || '未知错误') });
    }
    setCleanupLoading(false);
  };

  const editShareState: EditShareState | null = editShare ? {
    share: editShare, password: editPassword, removePassword: editRemovePassword, expiresIn: editExpiresIn, saving: savingEdit,
  } : null;

  const cpState: ChangePasswordState = {
    oldPassword: cpOldPassword, newPassword: cpNewPassword, confirmPassword: cpConfirmPassword, saving: cpSaving, message: cpMessage,
  };

  const statsText = `${stats.fileCount} files · ${formatBytes(stats.totalSize)} · ${stats.topicCount} topics`;

  return (
    <div className={`tgcd-shell${dragging && currentTopic ? ' dragging' : ''}`}
      onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      <TopBar
        activeCategory={activeCategory}
        shareCount={activeCategory ? filteredShares.length : shares.length}
        statsText={statsText}
        searchQuery={searchQuery}
        onSearchQuery={setSearchQuery}
        onSearch={handleSearch}
        onReloadShares={loadShares}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
      />

      <div className="tgcd-body">
        <Sidebar
          topics={topics}
          currentTopic={currentTopic}
          activeCategory={activeCategory}
          activeView={activeView}
          shares={shares}
          newTopicName={newTopicName}
          onNewTopicName={setNewTopicName}
          onCreateTopic={handleCreateTopic}
          onTopicClick={handleTopicClick}
          onCategoryClick={handleCategoryClick}
          onSettingsClick={handleSettingsClick}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className={`tgcd-main${showAudioPlayer ? ' with-player' : ''}`}>
          {activeView === 'settings' ? (
            <SettingsView
              settings={settings}
              onSettings={(patch) => setSettings(s => ({ ...s, ...patch }))}
              settingsSaving={settingsSaving}
              settingsMessage={settingsMessage}
              onSave={handleSaveSettings}
              onRevert={() => { setSettingsMessage(null); loadSettings(); }}
              cleanupLoading={cleanupLoading}
              cleanupMessage={cleanupMessage}
              onCleanup={handleCleanupOrphans}
              onOpenChangePassword={() => { setShowChangePassword(true); setCpMessage(null); }}
            />
          ) : activeCategory ? (
            <ShareList
              activeCategory={activeCategory}
              shares={filteredShares}
              loading={sharesLoading}
              copiedCode={copiedCode}
              showPasswords={showPasswords}
              onCopy={handleCopy}
              onRevoke={handleRevoke}
              onEditOpen={handleEditOpen}
              onTogglePassword={(code) => setShowPasswords(prev => ({ ...prev, [code]: !prev[code] }))}
              confirm={confirmAsync}
            />
          ) : (
            <FileList
              currentTopic={currentTopic}
              folders={folders}
              folderPath={folderPath}
              currentFolder={currentFolder}
              files={files}
              page={page}
              totalPages={totalPages}
              totalFiles={totalFiles}
              uploading={uploading}
              uploadProgress={uploadProgress}
              uploadingFolderName={uploadingFolderName}
              folderInputRef={folderInputRef}
              transferUrl={transferUrl}
              transferName={transferName}
              transferring={transferring}
              transferError={transferError}
              newFolderName={newFolderName}
              selectedFileIds={selectedFileIds}
              batchBusy={batchBusy}
              batchLabel={batchProgress.label}
              batchCurrent={batchProgress.current}
              batchTotal={batchProgress.total}
              audioQueue={audioQueue}
              audioIndex={audioIndex}
              isPlaying={isPlaying}
              onUpload={handleUpload}
              onFolderUpload={handleFolderUpload}
              onFolderClick={handleFolderClick}
              onBreadcrumbRoot={() => { if (!currentTopic) return; setCurrentFolder(null); setFolderPath([]); loadFiles(currentTopic.topicId, null); loadFolders(currentTopic.topicId, null); }}
              onBreadcrumb={handleBreadcrumb}
              onTransferUrl={setTransferUrl}
              onTransferName={setTransferName}
              onTransfer={handleTransfer}
              onNewFolderName={setNewFolderName}
              onCreateFolder={handleCreateFolder}
              onToggleSelect={toggleFileSelect}
              onSelectAll={selectAllFiles}
              onClearSelection={() => setSelectedFileIds(new Set())}
              onBatchDownload={handleBatchDownload}
              onBatchMoveOpen={handleBatchMoveOpen}
              onBatchDelete={handleBatchDelete}
              onBatchGallery={handleBatchGallery}
              onPreview={setPreviewFile}
              onPlayAudio={(idx) => audioHandlers.play(idx)}
              onDownloadSingle={handleDownloadSingle}
              onShare={setShareFile}
              onRename={(f) => setRenaming({ id: f.id, name: f.name, type: 'file' })}
              onMove={handleOpenMove}
              onDeleteFile={handleDeleteFile}
              onDeleteFolder={handleDeleteFolder}
              onShareFolder={(f) => setFolderShareTarget({ topicId: currentTopic!.topicId, folderId: f.id, name: f.name })}
              onRenameFolder={(f) => setRenaming({ id: f.id, name: f.name, type: 'folder' })}
              onPage={(p) => { setPage(p); if (currentTopic) loadFiles(currentTopic.topicId, currentFolder, p); }}
              confirm={confirmAsync}
            />
          )}
        </main>
      </div>

      {shareFile && <ShareManager file={shareFile} onClose={() => { setShareFile(null); loadShares(); }} onShareCreated={loadShares} notify={notify} />}
      {folderShareTarget && (
        <FolderShareModal target={folderShareTarget} onClose={() => { setFolderShareTarget(null); loadShares(); }} onShareCreated={loadShares} notify={notify} />
      )}
      {previewFile && <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
      {galleryFiles.length > 0 && (
        <GalleryModal files={galleryFiles} initialIndex={galleryIndex} onClose={() => setGalleryFiles([])} />
      )}

      <ProgressToasts download={downloadProgress} batch={batchProgress} />

      {renaming && (
        <RenameModal
          name={renaming.name}
          onChange={(name) => setRenaming({ ...renaming, name })}
          onClose={() => setRenaming(null)}
          onSave={handleRename}
        />
      )}

      {showAudioPlayer && (
        <AudioPlayerBar
          queue={audioQueue}
          index={audioIndex}
          isPlaying={isPlaying}
          progress={audioProgress}
          duration={audioDuration}
          audioRef={audioRef}
          handlers={audioHandlers}
          onClose={() => { setAudioIndex(-1); setAudioQueue([]); setIsPlaying(false); if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; } }}
        />
      )}

      {(moveFile || moveFileCount > 0) && (
        <MoveModal
          state={{ moveFile, moveFileCount, moveTopicId, moveTopics, moveTargetFolder, moveTargetFolders }}
          onClose={() => { setMoveFile(null); setMoveFileCount(0); }}
          onChangeTopic={handleChangeMoveTopic}
          onSelectFolder={setMoveTargetFolder}
          onConfirm={moveFileCount > 0 ? handleBatchMoveConfirm : handleConfirmMove}
        />
      )}

      {editShareState && (
        <EditShareModal
          state={editShareState}
          onChange={(patch) => {
            if (patch.password !== undefined) setEditPassword(patch.password);
            if (patch.removePassword !== undefined) setEditRemovePassword(patch.removePassword);
            if (patch.expiresIn !== undefined) setEditExpiresIn(patch.expiresIn);
          }}
          onClose={() => setEditShare(null)}
          onSave={handleSaveEdit}
        />
      )}

      {showChangePassword && (
        <ChangePasswordModal
          state={cpState}
          onChange={(patch) => {
            if (patch.oldPassword !== undefined) setCpOldPassword(patch.oldPassword);
            if (patch.newPassword !== undefined) setCpNewPassword(patch.newPassword);
            if (patch.confirmPassword !== undefined) setCpConfirmPassword(patch.confirmPassword);
          }}
          onClose={() => setShowChangePassword(false)}
          onSave={handleChangePassword}
        />
      )}

      {confirmReq && (
        <ConfirmModal
          message={confirmReq.message}
          confirmLabel={confirmReq.confirmLabel}
          danger={confirmReq.danger}
          onConfirm={() => { confirmReq.resolve(true); setConfirmReq(null); }}
          onCancel={() => { confirmReq.resolve(false); setConfirmReq(null); }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
