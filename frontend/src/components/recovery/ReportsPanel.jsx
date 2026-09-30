// components/recovery/ReportsPanel.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import { generateOfficerReportPDF } from '../admin/ReceiptPDF';

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
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignedDaysString, setAssignedDaysString] = useState('');
  const [approval, setApproval] = useState({
    status: 'pending', general_remarks: '', approved_by: null, approved_at: null,
  });
  const [generalRemarks, setGeneralRemarks] = useState('');

  const fetchingRef = useRef(false);
  const saveTimeouts = useRef({});

  const isPastReport = (() => {
    const today = new Date().toISOString().split('T')[0];
    return reportDate < today;
  })();

    const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const res = await recoveryAPI.getReportAssignments(reportDate);

      const daysMap = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      setAssignedDaysString((res.data.assigned_days || []).map(d => daysMap[d]).join(', '));

      // Clients now already include director_remark / director_remark_at / director_remark_by
      setClients(res.data.clients || []);

      // Approval info comes in the same payload
      setApproval(res.data.approval || {
        status: 'pending', general_remarks: '', approved_by: null, approved_at: null,
      });
      setGeneralRemarks(res.data.approval?.general_remarks || '');
    } catch (error) {
      console.error('Report fetch failed:', error);
      showToast.error('Failed to load assigned clients');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [reportDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch when officer comments are edited
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
                    <tr key={c.loan_id}>
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