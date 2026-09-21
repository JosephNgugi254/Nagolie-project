// frontend/src/components/salary/SalaryAdvanceStaff.jsx
import React, { useState, useEffect } from 'react';
import { showToast } from '../common/Toast';
import { salaryAPI } from '../../services/api';

const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleString('default', { month: 'long' }) + '/' + year;
};

const fmtKES = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  // Arrears = months before the current month that still have a positive balance
  const previousMonths = (stats?.previous_months || []).filter(
    (m) => Math.abs(m.balance) > 0.001
  );

  return (
    <div>
      <h5 className="mb-3">Salary Advance Request</h5>
      <div className="row mb-4">
        {/* ---------- Summary card ---------- */}
        <div className="col-md-6 mb-3 mb-md-0">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h6 className="card-subtitle mb-3 text-muted">
                Current Month: {formatMonthDisplay(month)}
              </h6>
              {stats ? (
                <>
                  <p className="mb-1"><strong>This Month's Salary:</strong> {fmtKES(stats.total_salary)}</p>
                  <p className="mb-1"><strong>Paid This Month:</strong> {fmtKES(stats.total_paid)}</p>
                  <p className="mb-1"><strong>Advance Taken This Month:</strong> {fmtKES(stats.total_advances)}</p>
                  <p className="mb-3">
                    <strong>This Month's Balance:</strong>{' '}
                    <span className={stats.balance > 0 ? 'text-danger fw-bold' : 'text-success'}>
                      {fmtKES(stats.balance)}
                    </span>
                  </p>

                  <hr />

                  <p className="mb-1 text-muted small text-uppercase fw-bold">Previous Months (Arrears)</p>
                  {previousMonths.length === 0 ? (
                    <p className="text-success small mb-2">
                      <i className="fas fa-check-circle me-1"></i>
                      No arrears — you're fully settled for all past months.
                    </p>
                  ) : (
                    <ul className="list-unstyled mb-3">
                      {previousMonths.map((m) => (
                        <li
                          key={m.month}
                          className="d-flex justify-content-between align-items-center border-bottom py-1"
                        >
                          <span>{formatMonthDisplay(m.month)}</span>
                          <span className={m.balance > 0 ? 'text-danger fw-bold' : 'text-success'}>
                            {fmtKES(m.balance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="alert alert-info mb-0 mt-2">
                    <div className="d-flex justify-content-between align-items-center">
                      <span><strong>Total Arrears Owed to you:</strong></span>
                      <span
                        className={
                          stats.total_due > 0
                            ? 'text-danger fw-bold fs-5'
                            : 'text-success fw-bold fs-5'
                        }
                      >
                        {fmtKES(stats.total_due)}
                      </span>
                    </div>
                  </div>

                  {stats.pending_requests.length > 0 && (
                    <div className="alert alert-warning mt-3 mb-0">
                      <strong>Pending Requests:</strong>{' '}
                      {stats.pending_requests.map((r) => `KES ${r.amount}`).join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted">No salary data for this month yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* ---------- Advance request form ---------- */}
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Request Advance</h6>
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">
                    Amount (KES) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Max 5000"
                    required
                    disabled={submitting}
                  />
                  <small className="text-muted">Maximum KES 5,000</small>
                </div>
                <div className="mb-3">
                  <label className="form-label">
                    Reason/Note <span className="text-danger">*</span>
                  </label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Brief explanation for the advance"
                    required
                    disabled={submitting}
                  />
                </div>
                <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Submitting...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Monthly breakdown table ---------- */}
      {stats && stats.monthly_breakdown && stats.monthly_breakdown.length > 0 && (
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-light">
            <h6 className="mb-0">Month-by-Month Breakdown</h6>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Month</th>
                    <th className="text-end">Salary</th>
                    <th className="text-end">Advance</th>
                    <th className="text-end">Paid</th>
                    <th className="text-end">Month Balance</th>
                    <th className="text-end">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.monthly_breakdown.map((m) => {
                    const isCurrent = m.month === month;
                    return (
                      <tr key={m.month} className={isCurrent ? 'table-primary' : ''}>
                        <td>
                          {formatMonthDisplay(m.month)}
                          {isCurrent && <span className="badge bg-primary ms-2">Current</span>}
                        </td>
                        <td className="text-end">{fmtKES(m.salary)}</td>
                        <td className="text-end">{fmtKES(m.advances)}</td>
                        <td className="text-end">{fmtKES(m.paid)}</td>
                        <td className={`text-end ${m.balance > 0 ? 'text-danger' : 'text-success'}`}>
                          {fmtKES(m.balance)}
                        </td>
                        <td className={`text-end fw-bold ${m.running_balance > 0 ? 'text-danger' : 'text-success'}`}>
                          {fmtKES(m.running_balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="table-secondary fw-bold">
                  <tr>
                    <td colSpan="4">Total Owed to You</td>
                    <td className="text-end">{fmtKES(stats.total_due)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Transaction history ---------- */}
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
                  {stats.transactions.map((t) => (
                    <tr key={t.id}>
                      <td>{new Date(t.created_at).toLocaleDateString()}</td>
                      <td>{formatMonthDisplay(t.month)}</td>
                      <td>
                        <span className={`badge ${t.transaction_type === 'advance' ? 'bg-info' : 'bg-primary'}`}>
                          {t.transaction_type === 'advance' ? 'Advance' : 'Salary Payment'}
                        </span>
                      </td>
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