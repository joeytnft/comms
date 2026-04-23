'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/admin/Modal';

interface Document {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
  uploadedBy?: { displayName: string };
  createdAt: string;
}

const CATEGORIES = ['Policy', 'Training', 'Emergency Plan', 'Form', 'Other'];

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string) {
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  if (mime.includes('image')) return '🖼';
  return '📁';
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/proxy/upload/documents');
      const data = res.ok ? await res.json() : {};
      setDocs(Array.isArray(data.documents) ? data.documents : (Array.isArray(data) ? data : []));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', docName || selectedFile.name);
      formData.append('category', docCategory);

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(xhr.statusText));
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', '/api/admin/proxy/upload/document');
        xhr.send(formData);
      });

      setUploadOpen(false);
      setSelectedFile(null); setDocName(''); setDocCategory('');
      showToast('Document uploaded');
      fetchDocs();
    } catch {
      showToast('Upload failed. Please try again.');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/proxy/upload/documents/${confirmDelete.id}`, { method: 'DELETE' });
      setConfirmDelete(null); showToast('Document deleted'); fetchDocs();
    } finally { setSaving(false); }
  };

  const filtered = docs.filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || d.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy-800 border border-white/10 rounded-xl px-5 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-sm text-slate-400 mt-1">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Upload Document
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-navy-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-64" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Documents table */}
      <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3.5 font-medium">Document</th>
                <th className="text-left px-6 py-3.5 font-medium">Category</th>
                <th className="text-left px-6 py-3.5 font-medium">Size</th>
                <th className="text-left px-6 py-3.5 font-medium">Uploaded</th>
                <th className="text-right px-6 py-3.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>{[...Array(5)].map((__, j) => <td key={j} className="px-6 py-4"><div className="h-4 bg-white/5 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">{search ? 'No documents match your search' : 'No documents uploaded yet'}</td></tr>
              ) : filtered.map((doc) => (
                <tr key={doc.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg leading-none">{fileIcon(doc.mimeType)}</span>
                      <div>
                        <p className="font-medium text-white">{doc.name}</p>
                        {doc.uploadedBy && <p className="text-xs text-slate-500">by {doc.uploadedBy.displayName}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {doc.category ? (
                      <span className="text-xs font-medium bg-white/5 text-slate-300 px-2 py-0.5 rounded-full">{doc.category}</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{fileSize(doc.sizeBytes)}</td>
                  <td className="px-6 py-4 text-slate-400">{fmt(doc.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 transition-all">Download</a>
                      <button onClick={() => setConfirmDelete(doc)} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload modal */}
      <Modal open={uploadOpen} onClose={() => { setUploadOpen(false); setSelectedFile(null); }} title="Upload Document">
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500/40 transition-colors"
          >
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); if (!docName) setDocName(f.name); } }} />
            {selectedFile ? (
              <div>
                <p className="text-2xl mb-2">{fileIcon(selectedFile.type)}</p>
                <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                <p className="text-xs text-slate-400">{fileSize(selectedFile.size)}</p>
              </div>
            ) : (
              <div>
                <svg className="w-8 h-8 text-slate-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-slate-400">Click to select a file</p>
                <p className="text-xs text-slate-600 mt-1">PDF, Word, Excel, images up to 8MB</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Display Name</label>
            <input type="text" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Emergency Contact List" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
            <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
              <option value="">Uncategorized</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {uploadProgress > 0 && (
            <div className="w-full bg-white/5 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setUploadOpen(false); setSelectedFile(null); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleUpload} disabled={saving || !selectedFile} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
              {saving ? `Uploading ${uploadProgress}%…` : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Document" size="sm">
        <p className="text-sm text-slate-300 mb-6">Permanently delete <strong className="text-white">{confirmDelete?.name}</strong>?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
