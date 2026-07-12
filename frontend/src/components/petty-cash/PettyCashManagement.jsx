import React, { useState, useEffect, useCallback } from 'react';
import { financialAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import Modal from '../common/Modal';
import { formatCurrency } from '../admin/ReceiptPDF';
import api from '../../services/api';
import imageCompression from 'browser-image-compression';

const PettyCashManagement = () => {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState({ total_funded: 0, total_expenses: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [expenseData, setExpenseData] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    attachments: []
  });
  const [fundData, setFundData] = useState({ amount: '', notes: '' });
  const [fileUploading, setFileUploading] = useState(false);

  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [viewingAttachments, setViewingAttachments] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [transRes, balRes] = await Promise.all([
        financialAPI.getPettyCashTransactions(),
        financialAPI.getPettyCashBalance()
      ]);
      setTransactions(transRes.data);
      setBalance(balRes.data);
    } catch (error) {
      showToast.error('Failed to load petty cash data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expenseData.description || !expenseData.amount || parseFloat(expenseData.amount) <= 0) {
      showToast.error('Please fill in description and positive amount');
      return;
    }
    try {
      await financialAPI.addPettyCashExpense({
        description: expenseData.description,
        amount: parseFloat(expenseData.amount),
        date: expenseData.date,
        notes: expenseData.notes,
        attachments: expenseData.attachments
      });
      showToast.success('Expense recorded');
      setShowExpenseModal(false);
      setExpenseData({ description: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '', attachments: [] });
      fetchData();
    } catch (error) {
      showToast.error(error.response?.data?.error || 'Failed to record expense');
    }
  };

  const handleFundSubmit = async (e) => {
    e.preventDefault();
    if (!fundData.amount || parseFloat(fundData.amount) <= 0) {
      showToast.error('Please enter a positive amount');
      return;
    }
    try {
      await financialAPI.fundPettyCash({
        amount: parseFloat(fundData.amount),
        notes: fundData.notes
      });
      showToast.success('Petty cash funded');
      setShowFundModal(false);
      setFundData({ amount: '', notes: '' });
      fetchData();
    } catch (error) {
      showToast.error(error.response?.data?.error || 'Failed to fund');
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setFileUploading(true);
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };

      const uploadPromises = files.map(async (file) => {
        let fileToUpload = file;
        if (file.type.startsWith('image/')) {
          try {
            fileToUpload = await imageCompression(file, options);
          } catch (compressionError) {
            console.warn('Compression failed, using original file:', compressionError);
          }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('originalName', file.name);

        const res = await api.post('/admin/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return { url: res.data.url, name: res.data.name };
      });

      const attachments = await Promise.all(uploadPromises);
      setExpenseData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...attachments]
      }));
      showToast.success('Files uploaded');
    } catch (error) {
      console.error('Upload error:', error);
      showToast.error(error.response?.data?.error || 'Failed to upload files');
    } finally {
      setFileUploading(false);
    }
  };

  const removeAttachment = (index) => {
    setExpenseData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const isImageUrl = (url) => {
    if (!url) return false;
    if (url.includes('cloudinary.com')) {
      const ext = url.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
    }
    return false;
  };

  const getDisplayName = (attachment) => {
    if (typeof attachment === 'string') return attachment.split('/').pop();
    return attachment.name || attachment.url.split('/').pop();
  };

  const handleDownload = async (url, filename) => {
    try {
      let fullUrl = url;
      if (!url.startsWith('http')) {
        const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        fullUrl = base.replace(/\/api\/?$/, '') + url;
      }

      const headers = {};
      if (!url.includes('cloudinary.com')) {
        headers['Authorization'] = `Bearer ${localStorage.getItem('token')}`;
      }

      const response = await fetch(fullUrl, { headers });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download error:', error);
      showToast.error('Failed to download file');
    }
  };

  const handleView = async (url, filename) => {
    if (url.includes('cloudinary.com')) {
      window.open(url, '_blank');
      return;
    }

    try {
      let fullUrl = url;
      if (!url.startsWith('http')) {
        const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        fullUrl = base.replace(/\/api\/?$/, '') + url;
      }

      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const response = await fetch(fullUrl, { headers });
      if (!response.ok) throw new Error('Failed to fetch file');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error('View error:', error);
      showToast.error('Failed to open file');
    }
  };

  return (
    <div className="petty-cash-management">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2>Petty Cash Management</h2>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-success" onClick={() => setShowExpenseModal(true)}>
            <i className="fas fa-plus me-2"></i>Add Expense
          </button>
          <button className="btn btn-primary" onClick={() => setShowFundModal(true)}>
            <i className="fas fa-hand-holding-usd me-2"></i>Fund
          </button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="row mb-4">
        <div className="col-md-4 col-sm-6 mb-3">
          <div className="card bg-success text-white">
            <div className="card-body">
              <h5>Total Funded</h5>
              <h3>{formatCurrency(balance.total_funded)}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-4 col-sm-6 mb-3">
          <div className="card bg-danger text-white">
            <div className="card-body">
              <h5>Total Expenses</h5>
              <h3>{formatCurrency(balance.total_expenses)}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-4 col-sm-6 mb-3">
          <div className="card bg-info text-white">
            <div className="card-body">
              <h5>Current Balance</h5>
              <h3>{formatCurrency(balance.balance)}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="card-header">
          <h5>Transaction History</h5>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="text-center"><div className="spinner-border"></div></div>
          ) : transactions.length === 0 ? (
            <p className="text-muted">No transactions yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Recorded By</th>
                    <th>Attachments</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(t => (
                    <tr key={`${t.type}-${t.id}`}>
                      <td>{formatDate(t.date || t.funded_at)}</td>
                      <td>
                        <span className={`badge ${t.type === 'funding' ? 'bg-success' : 'bg-warning'}`}>
                          {t.type === 'funding' ? 'Funding' : 'Expense'}
                        </span>
                      </td>
                      <td>{t.description || t.notes || '—'}</td>
                      <td>{formatCurrency(t.amount)}</td>
                      <td>{t.recorded_by_name || t.funded_by_name}</td>
                      <td>
                        {t.attachments && t.attachments.length > 0 && (
                          <button
                            className="btn btn-sm btn-outline-info"
                            onClick={() => {
                              setViewingAttachments(t.attachments);
                              setShowAttachmentModal(true);
                            }}
                          >
                            <i className="fas fa-paperclip"></i> {t.attachments.length}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Expense Modal */}
      <Modal isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="Record Petty Cash Expense" size="lg">
        <form onSubmit={handleExpenseSubmit}>
          <div className="mb-3">
            <label className="form-label">Description *</label>
            <input type="text" className="form-control" value={expenseData.description}
              onChange={e => setExpenseData({ ...expenseData, description: e.target.value })} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Amount (KES) *</label>
            <input type="number" className="form-control" value={expenseData.amount}
              onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })} min="0.01" step="0.01" required />
          </div>
          <div className="mb-3">
            <label className="form-label">Date</label>
            <input type="date" className="form-control" value={expenseData.date}
              onChange={e => setExpenseData({ ...expenseData, date: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows="2" value={expenseData.notes}
              onChange={e => setExpenseData({ ...expenseData, notes: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label">Attachments</label>
            <input type="file" className="form-control" multiple onChange={handleFileUpload} disabled={fileUploading} />
            {fileUploading && <span className="text-muted">Uploading...</span>}
            {expenseData.attachments.length > 0 && (
              <div className="mt-2">
                {expenseData.attachments.map((att, idx) => (
                  <span key={idx} className="badge bg-secondary me-1">
                    {getDisplayName(att)}
                    <button type="button" className="btn-close btn-close-white ms-1" onClick={() => removeAttachment(idx)} />
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowExpenseModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success">Record Expense</button>
          </div>
        </form>
      </Modal>

      {/* Fund Modal */}
      <Modal isOpen={showFundModal} onClose={() => setShowFundModal(false)} title="Fund Petty Cash">
        <form onSubmit={handleFundSubmit}>
          <div className="mb-3">
            <label className="form-label">Amount (KES) *</label>
            <input type="number" className="form-control" value={fundData.amount}
              onChange={e => setFundData({ ...fundData, amount: e.target.value })} min="0.01" step="0.01" required />
          </div>
          <div className="mb-3">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows="2" value={fundData.notes}
              onChange={e => setFundData({ ...fundData, notes: e.target.value })} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowFundModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Fund</button>
          </div>
        </form>
      </Modal>

      {/* Attachment Viewer Modal – Responsive & Button Alignment Fixed */}
      <Modal
        isOpen={showAttachmentModal}
        onClose={() => {
          setShowAttachmentModal(false);
          setViewingAttachments([]);
        }}
        title="Attachments"
        size="lg"
      >
        {viewingAttachments.length === 0 ? (
          <p className="text-muted">No attachments to display.</p>
        ) : (
          <div className="row g-3">
            {viewingAttachments.map((att, idx) => {
              const url = typeof att === 'string' ? att : att.url;
              const name = typeof att === 'string' ? att.split('/').pop() : att.name || url.split('/').pop();
              const isImage = isImageUrl(url);

              const handleCardClick = () => {
                handleView(url, name);
              };

              return (
                <div key={idx} className="col-12 col-sm-6 col-md-6 col-lg-6">
                  <div
                    className="card h-100 cursor-pointer"
                    onClick={handleCardClick}
                    style={{ cursor: 'pointer' }}
                  >
                    {isImage ? (
                      <img
                        src={url}
                        alt={name}
                        className="card-img-top"
                        style={{ height: '150px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="card-img-top d-flex align-items-center justify-content-center bg-light" style={{ height: '150px' }}>
                        <i className="fas fa-file fa-4x text-secondary"></i>
                      </div>
                    )}
                    <div className="card-body d-flex flex-column">
                      <p className="card-text small text-truncate" title={name}>
                        {name}
                      </p>
                      <div className="mt-auto d-flex flex-wrap gap-2 justify-content-center">
                        <button
                          className="btn btn-sm btn-primary flex-grow-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(url, name);
                          }}
                        >
                          <i className="fas fa-download"></i> Download
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary flex-grow-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleView(url, name);
                          }}
                        >
                          <i className="fas fa-eye"></i> View
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PettyCashManagement;