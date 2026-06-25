import React, { useState, useEffect, useCallback } from 'react';
import { financialAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import Modal from '../common/Modal';
import { formatCurrency } from '../admin/ReceiptPDF';

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
      // Upload each file to Cloudinary (or server)
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        // Assuming a generic upload endpoint
        const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Upload failed');
        }
        const data = await res.json();
        return data.url;
      });
      const urls = await Promise.all(uploadPromises);
      setExpenseData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...urls]
      }));
      showToast.success('Files uploaded');
    } catch (error) {
      showToast.error('Failed to upload files');
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

  return (
    <div className="petty-cash-management">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Petty Cash Management</h2>
        <div>
          <button className="btn btn-success me-2" onClick={() => setShowExpenseModal(true)}>
            <i className="fas fa-plus me-2"></i>Add Expense
          </button>
          <button className="btn btn-primary" onClick={() => setShowFundModal(true)}>
            <i className="fas fa-hand-holding-usd me-2"></i>Fund
          </button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card bg-success text-white">
            <div className="card-body">
              <h5>Total Funded</h5>
              <h3>{formatCurrency(balance.total_funded)}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card bg-danger text-white">
            <div className="card-body">
              <h5>Total Expenses</h5>
              <h3>{formatCurrency(balance.total_expenses)}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-4">
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
                          <button className="btn btn-sm btn-outline-info" onClick={() => {
                            // Show attachments in a modal or open links
                          }}>
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
                {expenseData.attachments.map((url, idx) => (
                  <span key={idx} className="badge bg-secondary me-1">
                    {url.split('/').pop()}
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
    </div>
  );
};

export default PettyCashManagement;