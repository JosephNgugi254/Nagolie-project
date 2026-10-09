// components/recovery/ReportsPanel.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import { generateOfficerReportPDF } from '../admin/ReceiptPDF';

// ── EAT "today" — Africa/Nairobi is UTC+3, no DST ──
// Returns a YYYY-MM-DD string in EAT wall-clock.
// Avoids the UTC bug where toISOString() rolls the date over at 03:00 EAT.
const todayEAT = () => {
  const nowMs = Date.now();
  const eatMs = nowMs + 3 * 60 * 60 * 1000;      // shift into EAT wall-clock
  const d = new Date(eatMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatAmount = (val) =>
  Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

const rowTotal = (c) =>
  Number(
    c.total_balance !== undefined
      ? c.total_balance
      : (Number(c.current_principal || 0) + Number(c.unpaid_interest || 0))
  );

const ReportsPanel = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState(todayEAT());
  const [assignedDaysString, setAssignedDaysString] = useState('');
  const [approval, setApproval] = useState({
    status: 'pending', general_remarks: '', approved_by: null, approved_at: null,
  });
  const [generalRemarks, setGeneralRemarks] = useState('');
  const [highlightLoanId, setHighlightLoanId] = useState(null);

  // ── Guards ──
  // fetchSeqRef: monotonically increasing id. Every fetchData() call claims the
  //   next id. When a response returns, if the id is not the latest, we discard
  //   it. This makes "last write wins" and prevents the stale-response race
  //   that a boolean `fetchingRef` guard introduced.
  const fetchSeqRef = useRef(0);
  const saveTimeouts = useRef({});

  const isPastReport = reportDate < todayEAT();

  // ── Fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const res = await recoveryAPI.getReportAssignments(reportDate);

      // A newer fetch has been started — drop this stale response.
      if (seq !== fetchSeqRef.current) return;

      const daysMap = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      setAssignedDaysString((res.data.assigned_days || []).map(d => daysMap[d]).join(', '));

      // Clients already include director_remark / director_remark_at / director_remark_by
      setClients(res.data.clients || []);

      setApproval(res.data.approval || {
        status: 'pending', general_remarks: '', approved_by: null, approved_at: null,
      });
      setGeneralRemarks(res.data.approval?.general_remarks || '');
    } catch (error) {
      if (seq !== fetchSeqRef.current) return;
      console.error('Report fetch failed:', error);
      showToast.error('Failed to load assigned clients');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [reportDate]);

  // Refetch whenever the date changes.
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── A. Read pending jump on mount ─────────────────────────────────────
  useEffect(() => {
    const jumpDate   = sessionStorage.getItem('reportJumpToDate');
    const jumpLoanId = sessionStorage.getItem('reportJumpToLoanId');

    if (jumpDate) {
      setReportDate(jumpDate);
      sessionStorage.removeItem('reportJumpToDate');
    }
    if (jumpLoanId) {
      setHighlightLoanId(parseInt(jumpLoanId, 10));
      sessionStorage.removeItem('reportJumpToLoanId');
    }
  }, []);   // run once

  // ── B. Listen for live jumps (panel already mounted) ─────────────────
  // Two jobs:
  //   1. Update the date / highlight.
  //   2. FORCE a refetch even if the date did not change (e.g. clicking a
  //      notification for a remark on today's report while already viewing
  //      today's report — otherwise React state didn't change and no fetch
  //      would fire).
  useEffect(() => {
    const handler = (e) => {
      const { date, loanId } = e.detail || {};
      if (date) setReportDate(date);
      if (loanId != null) setHighlightLoanId(loanId);
      fetchData();
    };
    window.addEventListener('reportJump', handler);
    return () => window.removeEventListener('reportJump', handler);
  }, [fetchData]);

  // ── C. Scroll + flash once the fresh rows have arrived ───────────────
  // We do NOT clear highlightLoanId on failure — if the row isn't here yet
  // (because the fetch hasn't returned), Effect C will run again when
  // `clients` updates, and then scroll to it.
  useEffect(() => {
    if (!highlightLoanId || !clients?.length) return;

    const t = setTimeout(() => {
      const el = document.querySelector(`[data-loan-id="${highlightLoanId}"]`);
      if (!el) return;                    // retry on next `clients` change
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('loan-row-highlight');
      setTimeout(() => el.classList.remove('loan-row-highlight'), 3000);
      setHighlightLoanId(null);           // consumed
    }, 150);

    return () => clearTimeout(t);
  }, [highlightLoanId, clients]);

  // ── D. Safety net: clear highlight if the row never appears ──────────
  useEffect(() => {
    if (!highlightLoanId) return;
    const t = setTimeout(() => setHighlightLoanId(null), 5000);
    return () => clearTimeout(t);
  }, [highlightLoanId]);

  // ── Comment save (officer's own notes) ────────────────────────────────
  const saveComment = async (loanId, comment) => {
    try {
      await recoveryAPI.saveReportComment(loanId, comment, reportDate);
    } catch (e) {
      showToast.error('Failed to save comment');
    }
  };

  const handleCommentChange = (loanId, value) => {
    setClients(prev => prev.map(c => (c.loan_id === loanId ? { ...c, comment: value } : c)));
    if (saveTimeouts.current[loanId]) clearTimeout(saveTimeouts.current[loanId]);
    saveTimeouts.current[loanId] = setTimeout(() => saveComment(loanId, value), 600);
  };

  const generatePDF = async (download = false) => {
    const payload = clients.map(c => ({
      client_name:       c.client_name,
      phone:             c.phone,
      current_principal: Number(c.current_principal || 0),
      unpaid_interest:   Number(c.unpaid_interest   || 0),
      total_balance:     rowTotal(c),
      interest_rate:     Number(c.interest_rate || 0),
      repayment_plan:    c.repayment_plan,
      comment:           c.comment || '',
      director_remark:   c.director_remark || '',
    }));

    await generateOfficerReportPDF(
      payload,
      user,
      reportDate,
      assignedDaysString,
      download,
      {
        approvalStatus: approval.status,
        approvedBy:     approval.approved_by,
        approvedAt:     approval.approved_at,
        generalRemarks: generalRemarks,
      }
    );
  };

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>;
  }

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const p = dateStr.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dateStr;
  };

  const isApproved = approval.status === 'approved';

  const totals = clients.reduce(
    (acc, c) => ({
      principal: acc.principal + Number(c.current_principal || 0),
      interest:  acc.interest  + Number(c.unpaid_interest   || 0),
      total:     acc.total     + rowTotal(c),
    }),
    { principal: 0, interest: 0, total: 0 }
  );

  return (
    <div className="reports-panel">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h4 className="mb-0">
            📋 Daily Loan Reports
            <span className="ms-3 badge bg-light text-dark fs-6">{formatDisplayDate(reportDate)}</span>
          </h4>
          <input
            type="date"
            className="form-control form-control-sm bg-light"
            style={{ maxWidth: 170 }}
            value={reportDate}
            max={todayEAT()}
            onChange={(e) => setReportDate(e.target.value)}
          />
        </div>

        <div className="card-body">
          {/* Approval banner */}
          {clients.length > 0 && (
            <div className={`alert ${isApproved ? 'alert-success' : 'alert-warning'} mb-3 d-flex justify-content-between align-items-center`}>
              <div>
                {isApproved ? (
                  <>
                    <i className="fas fa-check-circle me-2"></i>
                    <strong>Approved</strong>
                    {approval.approved_by && <> by <strong>{approval.approved_by}</strong></>}
                    {approval.approved_at && <> on {new Date(approval.approved_at).toLocaleString('en-GB')}</>}
                  </>
                ) : (
                  <><i className="fas fa-hourglass-half me-2"></i><strong>Pending approval</strong></>
                )}
              </div>
              <span className={`badge ${isApproved ? 'bg-success' : 'bg-warning text-dark'}`}>
                {isApproved ? 'APPROVED' : 'PENDING'}
              </span>
            </div>
          )}

          {isPastReport && (
            <div className="alert alert-info mb-3">
              <i className="fas fa-info-circle me-2"></i>
              You are viewing a past report. Comments are read‑only.
            </div>
          )}

          {/* KPI strip */}
          {clients.length > 0 && (
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="card border-0 bg-light">
                  <div className="card-body py-2">
                    <div className="text-muted small">Total Principal</div>
                    <div className="h5 mb-0 fw-bold">{formatAmount(totals.principal)}</div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card border-0 bg-light">
                  <div className="card-body py-2">
                    <div className="text-muted small">Total Interest</div>
                    <div className="h5 mb-0 fw-bold text-warning">{formatAmount(totals.interest)}</div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card border-0 bg-light">
                  <div className="card-body py-2">
                    <div className="text-muted small">Grand Total</div>
                    <div className="h5 mb-0 fw-bold text-primary">{formatAmount(totals.total)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-bordered table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>#</th>
                  <th>Client Name</th>
                  <th>Phone</th>
                  <th className="text-end">Principal (KES)</th>
                  <th className="text-end">Interest (KES)</th>
                  <th style={{ minWidth: '220px' }}>Follow-up Notes</th>
                  <th style={{ minWidth: '220px' }}>Director's Remarks</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c, idx) => {
                  const isWaiver = c.interest_rate === 0 || c.is_waiver;
                  const planText = isWaiver ? null : c.repayment_plan === 'daily' ? 'Daily' : 'Weekly';
                  const total = rowTotal(c);
                  return (
                    <tr key={c.loan_id} data-loan-id={c.loan_id}>
                      <td>{idx + 1}</td>
                      <td>
                        <div className="fw-semibold">{c.client_name}</div>
                        {planText && <div className="small fw-semibold" style={{ color: '#1e40af' }}>{planText}</div>}
                      </td>
                      <td>{c.phone}</td>
                      <td className="text-end fw-semibold">{formatAmount(c.current_principal)}</td>
                      <td className="text-end">
                        {isWaiver ? <span className="text-muted fst-italic">waived</span> : (
                          <>
                            <div className="fw-semibold">{formatAmount(c.unpaid_interest)}</div>
                            <div className="small fw-bold" style={{ color: '#1e40af' }}>Total: {formatAmount(total)}</div>
                          </>
                        )}
                      </td>
                      <td>
                        <textarea
                          className={`form-control form-control-sm ${isPastReport || isApproved ? 'bg-light' : ''}`}
                          rows="3"
                          value={c.comment || ''}
                          onChange={(e) => handleCommentChange(c.loan_id, e.target.value)}
                          placeholder="Enter follow-up notes..."
                          disabled={isPastReport || isApproved}
                        />
                      </td>
                      <td className="small" style={{ whiteSpace: 'pre-wrap', background: '#fffbe6' }}>
                        {c.director_remark
                          ? (
                            <>
                              <i className="fas fa-user-tie text-primary me-1"></i>
                              {c.director_remark}
                              {c.director_remark_at && (
                                <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                                  <i className="fas fa-clock me-1"></i>
                                  {new Date(c.director_remark_at).toLocaleString('en-GB')}
                                </div>
                              )}
                            </>
                          )
                          : <span className="fst-italic text-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="table-secondary fw-bold">
                <tr>
                  <td colSpan="3" className="text-end">Totals</td>
                  <td className="text-end">{formatAmount(totals.principal)}</td>
                  <td className="text-end text-primary">{formatAmount(totals.total)}</td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* General remarks (read-only for officer) */}
          {generalRemarks && (
            <div className="card mt-3">
              <div className="card-header bg-dark text-white">
                <i className="fas fa-comment-dots me-2"></i>
                <strong>Director's General Remarks</strong>
              </div>
              <div className="card-body" style={{ whiteSpace: 'pre-wrap' }}>
                {generalRemarks}
              </div>
            </div>
          )}

          <div className="d-flex justify-content-end mt-4">
            <button className="btn btn-info me-2" onClick={() => generatePDF(false)}>
              <i className="fas fa-eye"></i> Preview Report
            </button>
            <button className="btn btn-success" onClick={() => generatePDF(true)}>
              <i className="fas fa-download"></i> Download Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPanel;