import React, { useState, useEffect } from 'react';
import { showToast } from '../common/Toast';
import { salaryAPI } from '../../services/api';

// Helper: format month from "YYYY-MM" to "Month/YYYY"
const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleString('default', { month: 'long' }) + '/' + year;
};

const SalaryAdvanceStaff = ({ user }) => {
  const [stats, setStats] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [month] = useState(new Date().toISOString().slice(0, 7));

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await salaryAPI.getMySalaryStats(month);
      setStats(res.data);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to load salary stats';
      showToast.error(errorMsg);
      console.error('Salary stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [month]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const rawAmount = amount.replace(/,/g, '').trim();
    const numericAmount = parseFloat(rawAmount);

    if (isNaN(numericAmount) || numericAmount <= 0 || numericAmount > 5000) {
      showToast.error('Amount must be between 1 and 5000 KES');
      return;
    }

    if (!note.trim()) {
      showToast.error('Please provide a note');
      return;
    }

    setSubmitting(true);
    try {
      await salaryAPI.createAdvanceRequest(numericAmount, note, month);
      showToast.success('Request submitted successfully');
      setAmount('');
      setNote('');
      fetchStats();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border text-primary"></div></div>;

  return (
    <div>
      <h5 className="mb-3">Salary Advance Request</h5>
      <div className="row mb-4">
        <div className="col-md-6">
          <div className="card shadow-sm">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Current Month: {formatMonthDisplay(month)}</h6>
              {stats ? (
                <>
                  <p><strong>Total Salary:</strong> KES {stats.total_salary.toFixed(2)}</p>
                  <p><strong>Payments Made:</strong> KES {stats.total_paid.toFixed(2)}</p>
                  <p><strong>Remaining Balance:</strong> KES {stats.balance.toFixed(2)}</p>
                  <p><strong>Total Advance received:</strong> KES {stats.total_advances.toFixed(2)}</p>
                  {stats.pending_requests.length > 0 && (
                    <div className="alert alert-warning">
                      <strong>Pending Requests:</strong> {stats.pending_requests.map(r => `KES ${r.amount}`).join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted">No salary data for this month yet.</p>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card shadow-sm">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Request Advance</h6>
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Amount (KES) <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Max 5000"
                    required
                  />
                  <small className="text-muted">Maximum KES 5,000</small>
                </div>
                <div className="mb-3">
                  <label className="form-label">Reason/Note <span className="text-danger">*</span></label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Brief explanation for the advance"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History – all transactions with formatted month */}
      {stats && stats.transactions && stats.transactions.length > 0 && (
        <div className="card shadow-sm">
          <div className="card-header bg-light">
            <h6 className="mb-0">Transaction History</h6>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Month</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Reference</th>
                    <th>Method</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.transactions.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.created_at).toLocaleDateString()}</td>
                      <td>{formatMonthDisplay(t.month)}</td>
                      <td><span className={`badge ${t.transaction_type === 'advance' ? 'bg-info' : 'bg-primary'}`}>
                        {t.transaction_type === 'advance' ? 'Advance' : 'Salary Payment'}
                      </span></td>
                      <td>KES {t.amount.toFixed(2)}</td>
                      <td>{t.reference || 'N/A'}</td>
                      <td>{t.payment_method || 'N/A'}</td>
                      <td>{t.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryAdvanceStaff;