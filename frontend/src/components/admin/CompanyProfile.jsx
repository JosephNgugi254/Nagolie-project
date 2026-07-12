import React, { useState, useEffect } from 'react';
import { showToast } from '../common/Toast';
import Modal from '../common/Modal';
import api from '../../services/api';

const CompanyProfile = () => {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [newDoc, setNewDoc] = useState({
    name: '',
    category: '',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState(null);

  // API base URL (same as used elsewhere)
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 
    (window.location.hostname === 'localhost' 
      ? 'http://localhost:5000/api' 
      : 'https://nagolie-backend.onrender.com/api');

  // Fetch documents
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/company-profile/documents');
      const docs = res.data;
      setDocuments(docs);
      const catSet = new Set(docs.map(d => d.category));
      setCategories(['all', ...Array.from(catSet)]);
    } catch (err) {
      showToast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      showToast.error('Please select a file');
      return;
    }
    if (!newDoc.name || !newDoc.category) {
      showToast.error('Name and category are required');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('name', newDoc.name);
    formData.append('category', newDoc.category);
    formData.append('description', newDoc.description || '');

    setUploading(true);
    try {
      const res = await api.post('/company-profile/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        showToast.success('Document uploaded');
        setShowUploadModal(false);
        setNewDoc({ name: '', category: '', description: '' });
        setSelectedFile(null);
        fetchDocuments();
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await api.delete(`/company-profile/documents/${docId}`);
      showToast.success('Deleted');
      fetchDocuments();
    } catch (err) {
      showToast.error('Delete failed');
    }
  };

  // Helper to get full URL (adds base if relative)
  const getFullUrl = (url) => {
    if (!url) return url;
    if (url.startsWith('http')) return url;
    const base = API_BASE.replace(/\/api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  // Download: fetch with auth and trigger download
  const handleDownload = async (url, name) => {
    try {
      const fullUrl = getFullUrl(url);
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(fullUrl, { headers });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = name || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download error:', error);
      showToast.error('Failed to download document');
    }
  };

  // View: fetch with auth and open in new tab (Cloudinary URLs are public)
  const handleView = async (url) => {
    try {
      // Only Cloudinary URLs are public – open directly
      if (url.includes('cloudinary.com')) {
        window.open(url, '_blank');
        return;
      }

      // For all other URLs, fetch with auth token
      const fullUrl = getFullUrl(url);
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(fullUrl, { headers });
      if (!response.ok) throw new Error('Failed to fetch document');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      // Revoke the URL after a delay to allow the new tab to load
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error('View error:', error);
      showToast.error('Failed to open document');
    }
  };

  const filteredDocs = activeCategory === 'all'
    ? documents
    : documents.filter(d => d.category === activeCategory);

  return (
    <div className="company-profile">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2>Company Profile – Documents</h2>
        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
          <i className="fas fa-upload me-2"></i>Upload Document
        </button>
      </div>

      {/* Category Filter */}
      <div className="d-flex flex-wrap gap-2 mb-4">
        {categories.map(cat => (
          <button
            key={cat}
            className={`btn ${activeCategory === cat ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border" /></div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-folder-open fa-3x mb-3"></i>
          <p>No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="row g-3">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="col-md-4 col-sm-6">
              <div className="card h-100">
                {doc.file_type === 'image' ? (
                  <img
                    src={doc.file_url}
                    alt={doc.name}
                    className="card-img-top"
                    style={{ height: '180px', objectFit: 'cover' }}
                    onError={(e) => e.target.src = '/placeholder-image.png'}
                  />
                ) : (
                  <div className="card-img-top d-flex align-items-center justify-content-center bg-light" style={{ height: '180px' }}>
                    <i className="fas fa-file-pdf fa-4x text-danger"></i>
                  </div>
                )}
                <div className="card-body d-flex flex-column">
                  <h6 className="card-title">{doc.name}</h6>
                  <span className="badge bg-secondary mb-2">{doc.category}</span>
                  {doc.description && <p className="card-text small text-muted">{doc.description}</p>}
                  <div className="mt-auto d-flex flex-wrap gap-2">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleDownload(doc.file_url, doc.name)}
                    >
                      <i className="fas fa-download"></i> Download
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => handleView(doc.file_url)}
                    >
                      <i className="fas fa-eye"></i> View
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title="Upload Document" size="md">
        <form onSubmit={handleUpload}>
          <div className="mb-3">
            <label className="form-label">Document Name *</label>
            <input
              type="text"
              className="form-control"
              value={newDoc.name}
              onChange={e => setNewDoc({ ...newDoc, name: e.target.value })}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Category *</label>
            <input
              type="text"
              className="form-control"
              value={newDoc.category}
              onChange={e => setNewDoc({ ...newDoc, category: e.target.value })}
              placeholder="e.g. policy, financial, certificate"
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              rows="2"
              value={newDoc.description}
              onChange={e => setNewDoc({ ...newDoc, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Select File *</label>
            <input
              type="file"
              className="form-control"
              onChange={e => setSelectedFile(e.target.files[0])}
              required
            />
            <small className="text-muted">Images will be stored on Cloudinary; other files in the database.</small>
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CompanyProfile;