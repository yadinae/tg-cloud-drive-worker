// ───── Preview Modal ─────
// Images, video, audio, PDF, Markdown, code/text + download fallback.
// Markdown renderer is unchanged logic, restyled to the graphite ramp.
import { useState, useEffect } from 'react';
import { getDlUrl } from '../api/client';
import type { DriveFile } from '../dashboard/types';
import { formatBytes, isAudioFile, isCodeFile, isImageFile, isMarkdownFile, isPdfFile, isTextFile, isVideoFile } from '../dashboard/types';
import { IconButton } from './ui';
import { I, FileIcon } from './icons';

export default function PreviewModal({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dlUrl = getDlUrl(file.id);

  const isVideo = isVideoFile(file);
  const isAudio = isAudioFile(file);
  const isImage = isImageFile(file);
  const isPdf = isPdfFile(file);
  const isMarkdown = isMarkdownFile(file);
  const isCode = isCodeFile(file);
  const isText = isTextFile(file);
  const isRenderableText = isMarkdown || isCode || isText;

  useEffect(() => {
    if (!isRenderableText) return;
    setLoading(true);
    fetch(dlUrl)
      .then(res => res.text())
      .then(text => { setTextContent(text); setLoading(false); })
      .catch(() => { setTextContent('Failed to load file content'); setLoading(false); });
  }, [file.id, dlUrl, isRenderableText]);

  // Simple Markdown renderer (block-aware, no extra deps)
  const renderMarkdown = (md: string): string => {
    const codeBlocks: string[] = [];
    let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre style="background:#121212;padding:.75rem;border-radius:6px;overflow:auto;font-size:.8rem;line-height:1.4;margin:.75rem 0"><code>${code.trim()}</code></pre>`);
      return `\n\n\`\`\`BLOCK${idx}\n\n`;
    });

    const blocks = processed.split(/\n\n+/);
    const out: string[] = [];

    for (let block of blocks) {
      block = block.trim();
      if (!block) continue;

      const codeBlockMatch = block.match(/^```BLOCK(\d+)$/);
      if (codeBlockMatch) {
        out.push(codeBlocks[parseInt(codeBlockMatch[1])]);
        continue;
      }

      if (/^### /.test(block)) {
        out.push(`<h3 style="color:#faff69;margin:1rem 0 .5rem;font-size:1.05rem">${inlineMd(block.slice(4))}</h3>`);
        continue;
      }
      if (/^## /.test(block)) {
        out.push(`<h2 style="color:#faff69;margin:1.2rem 0 .6rem;font-size:1.15rem">${inlineMd(block.slice(3))}</h2>`);
        continue;
      }
      if (/^# /.test(block)) {
        out.push(`<h1 style="color:#faff69;margin:1.5rem 0 .75rem;font-size:1.3rem">${inlineMd(block.slice(2))}</h1>`);
        continue;
      }

      if (/^> /.test(block)) {
        const quoteLines = block.split('\n').map(l => l.replace(/^> /, '')).join('<br />');
        out.push(`<blockquote style="border-left:3px solid #faff69;padding:.5rem .75rem;margin:.75rem 0;color:#cccccc;background:#1a1a1a;border-radius:0 6px 6px 0">${inlineMd(quoteLines)}</blockquote>`);
        continue;
      }

      if (/^-{3,}$/.test(block)) {
        out.push('<hr style="border:none;border-top:1px solid #334155;margin:1rem 0" />');
        continue;
      }

      if (/^[-*] /.test(block)) {
        const items = block.split('\n').map(l => l.replace(/^[-*] /, '').trim()).filter(Boolean);
        const lis = items.map(item => `<li style="margin:.25rem 0;color:#cccccc">${inlineMd(item)}</li>`).join('\n');
        out.push(`<ul style="padding-left:1.5rem;margin:.5rem 0">${lis}</ul>`);
        continue;
      }

      if (/^\d+\. /.test(block)) {
        const items = block.split('\n').map(l => l.replace(/^\d+\. /, '').trim()).filter(Boolean);
        const lis = items.map(item => `<li style="margin:.25rem 0;color:#cccccc">${inlineMd(item)}</li>`).join('\n');
        out.push(`<ol style="padding-left:1.5rem;margin:.5rem 0">${lis}</ol>`);
        continue;
      }

      const lines = block.split('\n').map(l => inlineMd(l)).join('<br />');
      out.push(`<p style="margin:.5rem 0;line-height:1.6">${lines}</p>`);
    }

    return out.join('\n');
  };

  function inlineMd(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:#242424;padding:.15em .4em;border-radius:3px;font-size:.85em">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#faff69">$1</a>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:6px;margin:.5rem 0" />');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ maxWidth: '95%', maxHeight: '92%', minWidth: 320, position: 'relative' }} onClick={e => e.stopPropagation()}>
        <IconButton label="关闭" onClick={onClose} style={{ position: 'absolute', top: -36, right: 0, background: 'rgba(0,0,0,.5)' }}><I.x size={20} /></IconButton>

        {isVideo && (
          <video controls autoPlay style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} src={dlUrl}>
            <p style={{ color: 'var(--text-muted)' }}>Your browser doesn't support video playback. <a href={dlUrl} style={{ color: 'var(--accent)' }}>Download instead</a></p>
          </video>
        )}

        {isAudio && (
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 32, textAlign: 'center', minWidth: 320, border: '1px solid var(--hairline)' }}>
            <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}><I.music size={48} /></p>
            <p style={{ color: 'var(--text)', margin: '0 0 24px', fontSize: 16, wordBreak: 'break-all' }}>{file.name}</p>
            <audio controls autoPlay style={{ width: '100%' }} src={dlUrl} />
          </div>
        )}

        {isImage && (
          <img style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} src={dlUrl} alt={file.name} />
        )}

        {isPdf && (
          <iframe src={dlUrl} style={{ width: '85vw', height: '85vh', border: 'none', borderRadius: 8, background: '#ffffff' }} title={file.name} />
        )}

        {isMarkdown && (
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: '24px 32px', maxWidth: 720, maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--hairline)', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            <h2 style={{ margin: '0 0 16px', color: 'var(--accent)', fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}><FileIcon name={file.name} size={20} /> {file.name}</h2>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : textContent ? (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }} />
            ) : (
              <p style={{ color: 'var(--danger)' }}>Failed to load content</p>
            )}
          </div>
        )}

        {isCode && (
          <div style={{ background: 'var(--soft)', borderRadius: 12, padding: 20, maxWidth: 800, maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><FileIcon name={file.name} size={14} /> {file.name}</span>
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{formatBytes(file.size)}</span>
            </div>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : (
              <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#e2e8f0', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace" }}>{textContent}</pre>
            )}
          </div>
        )}

        {isText && (
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 20, maxWidth: 700, maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><FileIcon name={file.name} size={14} /> {file.name}</span>
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{formatBytes(file.size)}</span>
            </div>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : (
              <pre style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>{textContent}</pre>
            )}
          </div>
        )}

        {!isVideo && !isAudio && !isImage && !isPdf && !isRenderableText && (
          <div style={{ background: 'var(--card)', borderRadius: 8, padding: 32, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <I.alert size={16} /> This file type cannot be previewed inline
            </p>
            <a href={dlUrl} download={file.name}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
              <I.download size={14} /> Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
