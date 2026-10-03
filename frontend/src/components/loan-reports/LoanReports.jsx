// components/loan-reports/LoanReports.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import { generateOfficerReportPDF } from '../admin/ReceiptPDF';

// ── EAT "today" — Africa/Nairobi is UTC+3, no DST ──
const todayEAT = () => {
  const nowMs = Date.now();
  const eatMs = nowMs + 3 * 60 * 60 * 1000;      // shift into EAT wall-clock
  const d = new Date(eatMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const DAY_MAP = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatAmount = (val) =>
  Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

const rowTotal = (c) =>
  Number(
    c.total_balance !== undefined
      ? c.total_balance
      : (Number(c.current_principal || 0) + Number(c.unpaid_interest || 0))
  );

const LoanReports = () => {
  const { user } = useAuth();

  const [officers, setOfficers] = useState([]);
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [reportDate, setReportDate] = useState(todayEAT());
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  const [approval, setApproval] = useState({
    status: 'pending',
    general_remarks: '',
    approved_by: null,
    approved_at: null,
  });
  const [generalRemarks, setGeneralRemarks] = useState('');
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingLoanId, setSavingLoanId] = useState(null);
  const [approving, setApproving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [dayAssignments, setDayAssignments] = useState([]);
  const searchTimeoutRef = useRef(null);

  const remarkDebounceRef = useRef({});

  // ── Load officers + day assignments ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [officersRes, assignmentsRes] = await Promise.all([
          adminAPI.getOfficers(),
          adminAPI.getDayAssignments(),
        ]);
        const officersData = officersRes.data || [];
        setOfficers(officersData);
        setDayAssignments(assignmentsRes.data || []);
        const firstOfficer = officersData.find(o => o.role !== 'valuer');
        if (firstOfficer) setSelectedOfficerId(firstOfficer.id);
      } catch (e) {
        showToast.error('Failed to load officers or assignments');
      }
    })();
  }, [user]);

  // ── Fetch full director view ──
  const fetchReport = useCallback(async () => {
    if (!selectedOfficerId || !reportDate) return;
    setLoading(true);
    try {
      const res = await adminAPI.getDirectorReportView(selectedOfficerId, reportDate);
      setClients(Array.isArray(res.data.clients) ? res.data.clients : []);
      setApproval(res.data.approval || { status: 'pending', general_remarks: '' });
      setGeneralRemarks(res.data.approval?.general_remarks || '');
    } catch (error) {
      console.error('Report fetch failed:', error);
      showToast.error(error.response?.data?.error || 'Failed to load report');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOfficerId, reportDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // ── Per-client remark change handler (optimistic + debounced save) ──
  const handleClientRemarkChange = (loanId, value) => {
    setClients(prev =>
      prev.map(c => (c.loan_id === loanId ? { ...c, director_remark: value } : c))
    );

    if (remarkDebounceRef.current[loanId]) clearTimeout(remarkDebounceRef.current[loanId]);
    setSavingLoanId(loanId);
    remarkDebounceRef.current[loanId] = setTimeout(async () => {
      try {
        await adminAPI.setDirectorClientRemark(selectedOfficerId, reportDate, loanId, value);
      } catch (e) {
        showToast.error('Failed to save remark');
      } finally {
        setSavingLoanId(prev => (prev === loanId ? null : prev));
      }
    }, 700);
  };

  // ── Save general remarks ──
  const handleSaveGeneralRemarks = async () => {
    setSavingGeneral(true);
    try {
      await adminAPI.setDirectorGeneralRemark(selectedOfficerId, reportDate, generalRemarks);
      showToast.success('General remarks saved');
    } catch (e) {
      showToast.error('Failed to save general remarks');
    } finally {
      setSavingGeneral(false);
    }
  };

  // ── Approve / unapprove ──
  const handleApprove = async () => {
    if (approval.status === 'approved') {
      setApproving(true);
      try {
        await adminAPI.unapproveReport(selectedOfficerId, reportDate);
        setApproval(prev => ({ ...prev, status: 'pending', approved_by: null, approved_at: null }));
        showToast.info('Report reverted to pending');
      } catch (e) { showToast.error('Failed to revert'); }
      finally { setApproving(false); }
      return;
    }

    setApproving(true);
    try {
      // Save general remarks first so nothing is lost
      await adminAPI.setDirectorGeneralRemark(selectedOfficerId, reportDate, generalRemarks);
      const res = await adminAPI.approveReport(selectedOfficerId, reportDate);
      setApproval(prev => ({
        ...prev,
        status: 'approved',
        approved_by: res.data.approved_by,
        approved_at: res.data.approved_at,
      }));
      showToast.success('Report approved');
    } catch (e) {
      showToast.error(e.response?.data?.error || 'Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  // ── Client lookup ──
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const res = await adminAPI.clientAssignmentSearch(searchTerm);
      setSearchResults(res.data || []);
    } catch (e) { showToast.error('Search failed'); }
    finally { setSearching(false); }
  };

  // ── PDF generation (remarks + approval included) ──
  const generatePDF = async (download = true) => {
    const selectedOfficer = officers.find(o => o.id === parseInt(selectedOfficerId));
    if (!selectedOfficer) { showToast.error('No officer selected'); return; }

    const officerAssignments = dayAssignments.find(d => d.id === selectedOfficer.id);
    const assignedDays = officerAssignments?.days || [];
    const assignedDaysString = assignedDays.map(d => DAY_MAP[d]).join(', ');

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
      selectedOfficer,
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

  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-GB'); } catch { return '—'; }
  };

  const totals = clients.reduce(
    (acc, c) => ({
      principal: acc.principal + Number(c.current_principal || 0),
      interest:  acc.interest  + Number(c.unpaid_interest   || 0),
      total:     acc.total     + rowTotal(c),
    }),
    { principal: 0, interest: 0, total: 0 }
  );

  const isApproved = approval.status === 'approved';

  return (
    <div className="content-section">
      <h2>📋 Loan Reports — Director Review</h2>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label">Officer</label>
              <select
                className="form-select"
                value={selectedOfficerId}
                onChange={(e) => setSelectedOfficerId(e.target.value)}
              >
                {officers.filter((o) => o.role !== 'valuer').map((o) => (
                  <option key={o.id} value={o.id}>{o.username} ({o.role})</option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label">Report Date</label>
              <input
                type="date"
                className="form-control"
                value={reportDate}
                max={todayEAT()}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>

            <div className="col-md-3 d-flex gap-2">
              <button className="btn btn-info" onClick={() => generatePDF(false)}>
                <i className="fas fa-eye me-2"></i>Preview
              </button>
              <button className="btn btn-success" onClick={() => generatePDF(true)}>
                <i className="fas fa-download me-2"></i>Download
              </button>
            </div>

            <div className="col-md-2 text-end">
              <button
                className={`btn ${isApproved ? 'btn-warning' : 'btn-primary'} w-100`}
                onClick={handleApprove}
                disabled={approving || clients.length === 0}
              >
                {approving ? (
                  <><span className="spinner-border spinner-border-sm me-2"></span>…</>
                ) : isApproved ? (
                  <><i className="fas fa-undo me-1"></i>Revert</>
                ) : (
                  <><i className="fas fa-check me-1"></i>Approve</>
                )}
              </button>
            </div>
          </div>

          {/* Approval status banner */}
          {!loading && clients.length > 0 && (
            <div className={`mt-3 alert ${isApproved ? 'alert-success' : 'alert-warning'} d-flex justify-content-between align-items-center`}>
              <div>
                {isApproved ? (
                  <>
                    <i className="fas fa-check-circle me-2"></i>
                    <strong>Approved</strong>
                    {approval.approved_by && <> by <strong>{approval.approved_by}</strong></>}
                    {approval.approved_at && <> on {new Date(approval.approved_at).toLocaleString('en-GB')}</>}
                  </>
                ) : (
                  <>
                    <i className="fas fa-hourglass-half me-2"></i>
                    <strong>Pending approval</strong> — add remarks and click Approve.
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Client lookup */}
      {showSearch && (
        <div className="card mt-4">
          <div className="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
            <h5 className="mb-0">🔍 Client Assignment Lookup</h5>
            <button className="btn-close btn-close-white" onClick={() => setShowSearch(false)} />
          </div>
          <div className="card-body">
            <div className="input-group mb-3">
              <input
                type="text"
                className="form-control"
                placeholder="Search by client name or ID number..."
                value={searchTerm}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchTerm(v);
                  if (!v.trim()) { setSearchResults([]); return; }
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                  setSearching(true);
                  searchTimeoutRef.current = setTimeout(handleSearch, 400);
                }}
              />
              <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
                {searching ? <span className="spinner-border spinner-border-sm"></span> : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="table-responsive">
                <table className="table table-sm table-striped">
                  <thead>
                    <tr>
                      <th>Client</th><th>ID Number</th><th>Phone</th>
                      <th>Loan ID</th><th>Assigned Officer</th><th>Role</th><th>Flagged?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={`${r.client_id}-${r.loan_id}`}>
                        <td>{r.client_name}</td>
                        <td>{r.id_number}</td>
                        <td>{r.phone}</td>
                        <td>{r.loan_id}</td>
                        <td><strong>{r.assigned_officer}</strong></td>
                        <td>{r.officer_role || '—'}</td>
                        <td>{r.is_flagged ? <span className="badge bg-danger">Flagged</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {searchTerm && !searching && searchResults.length === 0 && (
              <p className="text-muted">No clients found matching your search.</p>
            )}
          </div>
        </div>
      )}

      {/* KPI strip */}
      {!loading && clients.length > 0 && (
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

      {/* Table */}
      {loading ? (
        <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
      ) : clients.length === 0 ? (
        <div className="text-center py-5">
          <i className="fas fa-file-alt fa-3x text-muted mb-3"></i>
          <h5 className="text-muted">No data for this officer on this date.</h5>
        </div>
      ) : (
        <div className="card mb-4">
          <div className="card-header bg-primary text-white d-flex justify-content-between">
            <span>Report Date: <strong>{fmtDate(reportDate)}</strong></span>
            <span>
              {isApproved
                ? <span className="badge bg-success">APPROVED</span>
                : <span className="badge bg-warning text-dark">PENDING</span>}
            </span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '45px' }}>#</th>
                    <th>Client Name</th>
                    <th className="text-end">Principal (KES)</th>
                    <th className="text-end">Interest (KES)</th>
                    <th style={{ minWidth: '220px' }}>Officer Comment</th>
                    <th style={{ minWidth: '260px' }}>
                      Director's Remarks {savingLoanId && <span className="spinner-border spinner-border-sm ms-2" />}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, idx) => {
                    const isWaiver = c.interest_rate === 0 || c.is_waiver;
                    const planText = isWaiver ? null
                      : c.repayment_plan === 'daily' ? 'Daily' : 'Weekly';
                    const total = rowTotal(c);
                    return (
                      <tr key={c.loan_id}>
                        <td>{idx + 1}</td>
                        <td>
                          <div className="fw-semibold">{c.client_name}</div>
                          {planText && (
                            <div className="small fw-semibold" style={{ color: '#1e40af' }}>{planText}</div>
                          )}
                          <div className="small text-muted"><i className="fas fa-phone me-1"></i>{c.phone || '—'}</div>
                        </td>
                        <td className="text-end fw-semibold">{formatAmount(c.current_principal)}</td>
                        <td className="text-end">
                          {isWaiver ? <span className="text-muted fst-italic">waived</span> : (
                            <>
                              <div className="fw-semibold">{formatAmount(c.unpaid_interest)}</div>
                              <div className="small fw-bold" style={{ color: '#1e40af' }}>Total: {formatAmount(total)}</div>
                            </>
                          )}
                        </td>
                        <td className="small text-muted" style={{ whiteSpace: 'pre-wrap' }}>
                          {c.comment || <span className="fst-italic">—</span>}
                        </td>
                        <td>
                          <textarea
                            className="form-control form-control-sm"
                            rows="2"
                            placeholder="Director's remark for this client..."
                            value={c.director_remark || ''}
                            onChange={(e) => handleClientRemarkChange(c.loan_id, e.target.value)}
                          />
                          {c.director_remark_at && (
                            <div className="small text-muted mt-1">
                              <i className="fas fa-clock me-1"></i>
                              {new Date(c.director_remark_at).toLocaleString('en-GB')}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="table-secondary fw-bold">
                  <tr>
                    <td colSpan="2" className="text-end">Totals</td>
                    <td className="text-end">{formatAmount(totals.principal)}</td>
                    <td className="text-end text-primary">{formatAmount(totals.total)}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* General remarks */}
      {!loading && clients.length > 0 && (
        <div className="card mb-4">
          <div className="card-header bg-dark text-white">
            <i className="fas fa-comment-dots me-2"></i>
            <strong>General Remarks (applies to the whole report)</strong>
          </div>
          <div className="card-body">
            <textarea
              className="form-control"
              rows="3"
              placeholder="Any overall remarks, notes, or instructions for this report..."
              value={generalRemarks}
              onChange={(e) => setGeneralRemarks(e.target.value)}
            />
            <div className="d-flex justify-content-end mt-2">
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={handleSaveGeneralRemarks}
                disabled={savingGeneral}
              >
                {savingGeneral
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving…</>
                  : <><i className="fas fa-save me-1"></i>Save General Remarks</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanReports;