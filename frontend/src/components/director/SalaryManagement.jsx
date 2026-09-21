// frontend/src/components/director/SalaryManagement.jsx
import React, { useState, useEffect } from 'react';
import { showToast } from '../common/Toast';
import { salaryAPI } from '../../services/api';
import Modal from '../common/Modal';
import { generateSalaryReportPDF, generateSalaryTransactionReceipt } from '../admin/ReceiptPDF';

const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleString('default', { month: 'long' }) + '/' + year;
};

const SalaryManagement = () => {
  const [activeTab, setActiveTab] = useState('staff');
  const [staffList, setStaffList] = useState([]);
  const [staffTotals, setStaffTotals] = useState({
    current_salary: 0, current_paid: 0, current_balance: 0,
    previous_balance: 0, total_due: 0,
  });
  const [requests, setRequests] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [month] = useState(new Date().toISOString().slice(0, 7));
  const [editingStaff, setEditingStaff] = useState(null);
  const [salaryAmount, setSalaryAmount] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [mpesaRef, setMpesaRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [payNotes, setPayNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const [showDirectPaymentModal, setShowDirectPaymentModal] = useState(false);
  const [directPaymentData, setDirectPaymentData] = useState({
    userId: null,
    amount: '',
    method: 'cash',
    reference: '',
    notes: ''
  });
  const [directPaymentProcessing, setDirectPaymentProcessing] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectProcessing, setRejectProcessing] = useState(false);

  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await salaryAPI.getStaffSettings(month);
      const payload = res.data || {};
      // Backward-compatible: old shape was an array; new shape is { staff, totals }
      if (Array.isArray(payload)) {
        setStaffList(payload);
        setStaffTotals({
          current_salary: 0, current_paid: 0, current_balance: 0,
          previous_balance: 0, total_due: 0,
        });
      } else {
        setStaffList(payload.staff || []);
        setStaffTotals(payload.totals || {
          current_salary: 0, current_paid: 0, current_balance: 0,
          previous_balance: 0, total_due: 0,
        });
      }
    } catch (err) {
      showToast.error('Failed to load staff list');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await salaryAPI.getAdvanceRequests();
      setRequests(res.data);
    } catch (err) {
      showToast.error('Failed to load advance requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = {};
      if (transactionSearch) params.search = transactionSearch;
      if (transactionDate) params.start_date = transactionDate;
      const res = await salaryAPI.getSalaryTransactions(params);
      setTransactions(res.data);
    } catch (err) {
      showToast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') fetchStaff();
    else if (activeTab === 'requests') fetchRequests();
    else if (activeTab === 'transactions') fetchTransactions();
  }, [activeTab, month]);

  useEffect(() => {
    if (activeTab === 'transactions') {
      fetchTransactions();
    }
  }, [transactionSearch, transactionDate]);

  const handleSaveSalary = async () => {
    if (!editingStaff || parseFloat(salaryAmount) < 0) {
      showToast.error('Invalid salary amount');
      return;
    }
    setLoading(true);
    try {
      await salaryAPI.setStaffSalary(editingStaff.user_id, month, parseFloat(salaryAmount));
      showToast.success('Salary updated — it will carry forward to future months');
      setEditingStaff(null);
      fetchStaff();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to update salary');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRequest = async (requestId, action, reason = '') => {
    setProcessing(true);
    try {
      await salaryAPI.processAdvanceRequest(requestId, action, reason);
      showToast.success(`Request ${action}ed`);
      fetchRequests();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const openRejectModal = (requestId) => {
    setRejectRequestId(requestId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      showToast.error('Please provide a reason for rejection');
      return;
    }
    setRejectProcessing(true);
    try {
      await handleProcessRequest(rejectRequestId, 'reject', rejectReason);
      setShowRejectModal(false);
      setRejectRequestId(null);
      setRejectReason('');
    } finally {
      setRejectProcessing(false);
    }
  };

  const handlePayRequest = async () => {
    if (!selectedRequest) return;
    if (paymentMethod === 'mpesa' && !mpesaRef.trim()) {
      showToast.error('M-Pesa reference is required');
      return;
    }
    setProcessing(true);
    try {
      await salaryAPI.payAdvanceRequest(
        selectedRequest.id,
        mpesaRef,
        paymentMethod,
        payNotes
      );
      showToast.success('Payment recorded');
      setShowPayModal(false);
      setSelectedRequest(null);
      setMpesaRef('');
      setPayNotes('');
      fetchRequests();
      if (activeTab === 'transactions') fetchTransactions();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const openDirectPaymentModal = (userId = null) => {
    setDirectPaymentData({
      userId: userId,
      amount: '',
      method: 'cash',
      reference: '',
      notes: ''
    });
    setShowDirectPaymentModal(true);
  };

  const handleRecordDirectPayment = async () => {
    const { userId, amount, method, reference, notes } = directPaymentData;
    if (!userId || !amount || parseFloat(amount) <= 0) {
      showToast.error('Please select staff and enter valid amount');
      return;
    }
    if (method === 'mpesa' && !reference.trim()) {
      showToast.error('M-Pesa reference required');
      return;
    }
    setDirectPaymentProcessing(true);
    try {
      await salaryAPI.recordSalaryPayment(
        userId,
        month,
        parseFloat(amount),
        method,
        reference,
        notes
      );
      showToast.success('Salary payment recorded');
      setShowDirectPaymentModal(false);
      setDirectPaymentData({ userId: null, amount: '', method: 'cash', reference: '', notes: '' });
      fetchStaff();
      if (activeTab === 'transactions') fetchTransactions();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setDirectPaymentProcessing(false);
    }
  };

  const handleGenerateReport = async (user) => {
    setGeneratingReport(true);
    try {
      const res = await salaryAPI.getStaffReportData(user.user_id, month);
      generateSalaryReportPDF(res.data);
    } catch (err) {
      showToast.error('Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleDownloadTransactionReceipt = async (transaction) => {
    setGeneratingReceipt(true);
    try {
      await generateSalaryTransactionReceipt(transaction);
      showToast.success('Receipt downloaded');
    } catch (err) {
      showToast.error('Failed to generate receipt');
    } finally {
      setGeneratingReceipt(false);
    }
  };

  // ---- Money formatter ----
  const fmtKES = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

  const renderStaffTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">Staff Salaries for {formatMonthDisplay(month)}</h6>
        <div>
          <button className="btn btn-sm btn-outline-secondary me-2" onClick={fetchStaff} disabled={loading}>
            <i className={`fas fa-sync ${loading ? 'fa-spin' : ''}`}></i> {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            className="btn btn-sm btn-success"
            onClick={() => openDirectPaymentModal(null)}
            disabled={loading}
          >
            <i className="fas fa-money-bill-wave"></i> Quick Pay
          </button>
        </div>
      </div>

      <div className="alert alert-light border small mb-3">
        <i className="fas fa-info-circle me-1 text-primary"></i>
        A salary stays in effect every month until you change it. Click <i className="fas fa-edit mx-1"></i>
        to set a new amount — it applies from this month onward.
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead className="table-light">
            <tr>
              <th>Staff</th>
              <th>Role</th>
              <th className="text-end">Salary / Month</th>
              <th className="text-end">Paid (This Month)</th>
              <th className="text-end">Month Balance</th>
              <th className="text-end">Previous Balance</th>
              <th className="text-end">Total Due</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && staffList.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                </td>
              </tr>
            ) : staffList.length === 0 ? (
              <tr><td colSpan="8" className="text-center text-muted py-4">No staff found.</td></tr>
            ) : staffList.map(s => (
              <tr key={s.user_id}>
                <td><strong>{s.username}</strong></td>
                <td><span className="badge bg-light text-dark border">{s.role}</span></td>
                <td className="text-end">
                  {editingStaff?.user_id === s.user_id ? (
                    <input
                      type="number"
                      className="form-control form-control-sm d-inline-block"
                      style={{ width: '130px' }}
                      value={salaryAmount}
                      onChange={(e) => setSalaryAmount(e.target.value)}
                      min="0"
                      step="100"
                      disabled={loading}
                    />
                  ) : (
                    <span>
                      {s.salary_amount > 0 ? fmtKES(s.salary_amount) : <span className="text-muted">Not set</span>}
                      {!s.has_month_setting && s.salary_amount > 0 && (
                        <i
                          className="fas fa-info-circle ms-1 text-muted"
                          title="Carried forward from a previous month"
                        />
                      )}
                    </span>
                  )}
                </td>
                <td className="text-end">{fmtKES(s.current_paid)}</td>
                <td className={`text-end ${s.current_balance > 0 ? 'text-danger fw-bold' : 'text-success'}`}>
                  {fmtKES(s.current_balance)}
                </td>
                <td className={`text-end ${s.previous_balance > 0 ? 'text-warning fw-bold' : 'text-muted'}`}>
                  {fmtKES(s.previous_balance)}
                </td>
                <td className={`text-end ${s.total_due > 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}`}>
                  {fmtKES(s.total_due)}
                </td>
                <td className="text-center">
                  {editingStaff?.user_id === s.user_id ? (
                    <>
                      <button className="btn btn-sm btn-success me-1" onClick={handleSaveSalary} disabled={loading}>
                        <i className="fas fa-check"></i>
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditingStaff(null)} disabled={loading}>
                        <i className="fas fa-times"></i>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-sm btn-outline-primary me-1"
                        onClick={() => {
                          setEditingStaff(s);
                          setSalaryAmount(s.salary_amount.toString());
                        }}
                        disabled={loading}
                        title="Change salary (applies from this month onward)"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-outline-info me-1"
                        onClick={() => handleGenerateReport(s)}
                        disabled={loading || generatingReport}
                        title="Download PDF report"
                      >
                        {generatingReport ? (
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                          <i className="fas fa-file-pdf"></i>
                        )}
                      </button>
                      <button
                        className="btn btn-sm btn-outline-success"
                        onClick={() => openDirectPaymentModal(s.user_id)}
                        disabled={loading}
                        title="Record salary payment"
                      >
                        <i className="fas fa-money-bill-wave"></i> Pay
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {staffList.length > 0 && (
            <tfoot className="table-secondary fw-bold">
              <tr>
                <td colSpan="2">Totals ({staffList.length} staff)</td>
                <td className="text-end">{fmtKES(staffTotals.current_salary)}</td>
                <td className="text-end">{fmtKES(staffTotals.current_paid)}</td>
                <td className="text-end">{fmtKES(staffTotals.current_balance)}</td>
                <td className="text-end">{fmtKES(staffTotals.previous_balance)}</td>
                <td className="text-end text-danger">{fmtKES(staffTotals.total_due)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );

  const renderRequestsTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6>Advance Requests</h6>
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchRequests} disabled={loading}>
          <i className={`fas fa-sync ${loading ? 'fa-spin' : ''}`}></i> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="table-responsive">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Amount</th>
              <th>Month</th>
              <th>Status</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id}>
                <td>{req.username}</td>
                <td>KES {req.amount.toFixed(2)}</td>
                <td>{formatMonthDisplay(req.month)}</td>
                <td>
                  <span className={`badge bg-${req.status === 'pending' ? 'warning' : req.status === 'approved' ? 'info' : req.status === 'paid' ? 'success' : 'danger'}`}>
                    {req.status}
                  </span>
                </td>
                <td>{req.note}</td>
                <td>
                  {req.status === 'pending' && (
                    <>
                      <button
                        className="btn btn-sm btn-success me-1"
                        onClick={() => handleProcessRequest(req.id, 'approve')}
                        disabled={processing}
                      >
                        {processing ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> : 'Approve'}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => openRejectModal(req.id)}
                        disabled={processing}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {req.status === 'approved' && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        setSelectedRequest(req);
                        setShowPayModal(true);
                        setMpesaRef('');
                        setPaymentMethod('mpesa');
                        setPayNotes('');
                      }}
                      disabled={processing}
                    >
                      <i className="fas fa-money-bill-wave"></i> Pay
                    </button>
                  )}
                  {req.status === 'paid' && (
                    <span className="text-muted">Paid</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTransactionsTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h6>All Salary Transactions</h6>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search by staff name..."
            value={transactionSearch}
            onChange={(e) => setTransactionSearch(e.target.value)}
            style={{ width: '200px' }}
            disabled={loading}
          />
          <input
            type="date"
            className="form-control form-control-sm"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            style={{ width: '160px' }}
            disabled={loading}
          />
          <button className="btn btn-sm btn-outline-secondary" onClick={fetchTransactions} disabled={loading}>
            <i className={`fas fa-sync ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Date</th>
              <th>Staff</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="text-center"><div className="spinner-border spinner-border-sm" role="status"></div></td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan="8" className="text-center text-muted">No transactions found</td></tr>
            ) : (
              transactions.map(t => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td>{t.username || 'N/A'}</td>
                  <td>
                    <span className={`badge ${t.transaction_type === 'advance' ? 'bg-info' : 'bg-primary'}`}>
                      {t.transaction_type === 'advance' ? 'Advance' : 'Salary Payment'}
                    </span>
                  </td>
                  <td>KES {t.amount.toFixed(2)}</td>
                  <td>{t.payment_method || 'N/A'}</td>
                  <td>{t.reference || 'N/A'}</td>
                  <td>{t.notes || ''}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-info"
                      onClick={() => handleDownloadTransactionReceipt(t)}
                      disabled={generatingReceipt}
                    >
                      {generatingReceipt ? (
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      ) : (
                        <i className="fas fa-file-pdf"></i>
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="salary-management">
      <h4 className="mb-3">Salary Management</h4>
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')}>
            Staff Salaries
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
            Advance Requests
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>
            Transactions
          </button>
        </li>
      </ul>

      {activeTab === 'staff' && renderStaffTab()}
      {activeTab === 'requests' && renderRequestsTab()}
      {activeTab === 'transactions' && renderTransactionsTab()}

      {/* Payment Modal for Advance Request */}
      {showPayModal && selectedRequest && (
        <Modal isOpen={showPayModal} onClose={() => { if (!processing) setShowPayModal(false); }} title="Record Advance Payment">
          <div className="mb-3">
            <label className="form-label">Staff: {selectedRequest.username}</label>
            <input type="text" className="form-control" value={`KES ${selectedRequest.amount.toFixed(2)}`} readOnly />
          </div>
          <div className="mb-3">
            <label className="form-label">Payment Method</label>
            <select className="form-control" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={processing}>
              <option value="mpesa">M-Pesa</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          {paymentMethod === 'mpesa' && (
            <div className="mb-3">
              <label className="form-label">M-Pesa Reference</label>
              <input
                type="text"
                className="form-control"
                value={mpesaRef}
                onChange={(e) => setMpesaRef(e.target.value.toUpperCase())}
                placeholder="e.g. RB64AX25B1"
                required
                disabled={processing}
              />
            </div>
          )}
          <div className="mb-3">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows="2" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} disabled={processing} />
          </div>
          <button className="btn btn-primary" onClick={handlePayRequest} disabled={processing}>
            {processing ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...</> : 'Confirm Payment'}
          </button>
        </Modal>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <Modal isOpen={showRejectModal} onClose={() => { if (!rejectProcessing) setShowRejectModal(false); }} title="Reject Advance Request">
          <div className="mb-3">
            <label className="form-label">Reason for Rejection <span className="text-danger">*</span></label>
            <textarea
              className="form-control"
              rows="4"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Please provide a reason for rejecting this request..."
              required
              disabled={rejectProcessing}
            />
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-danger" onClick={confirmReject} disabled={rejectProcessing}>
              {rejectProcessing ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Rejecting...</> : 'Confirm Rejection'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)} disabled={rejectProcessing}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Direct Salary Payment Modal */}
      {showDirectPaymentModal && (
        <Modal
          isOpen={showDirectPaymentModal}
          onClose={() => {
            if (directPaymentProcessing) return;
            setShowDirectPaymentModal(false);
            setDirectPaymentData({ userId: null, amount: '', method: 'cash', reference: '', notes: '' });
          }}
          title="Record Direct Salary Payment"
          size="md"
        >
          <div className="mb-3">
            <label className="form-label">
              {directPaymentData.userId ? 'Staff Name (pre-selected)' : 'Select Staff'}
              <span className="text-danger">*</span>
            </label>
            {directPaymentData.userId ? (
              <input
                type="text"
                className="form-control"
                value={staffList.find(s => s.user_id === directPaymentData.userId)?.username || 'Unknown'}
                readOnly
                disabled
              />
            ) : (
              <select
                className="form-control"
                value={directPaymentData.userId || ''}
                onChange={(e) => setDirectPaymentData({ ...directPaymentData, userId: parseInt(e.target.value) })}
                required
                disabled={directPaymentProcessing}
              >
                <option value="">-- Choose Staff --</option>
                {staffList.map(s => (
                  <option key={s.user_id} value={s.user_id}>{s.username} ({s.role})</option>
                ))}
              </select>
            )}
          </div>

          {/* Show the selected staff member's outstanding figures */}
          {directPaymentData.userId && (() => {
            const s = staffList.find(x => x.user_id === directPaymentData.userId);
            if (!s) return null;
            return (
              <div className="alert alert-light border small mb-3">
                <div className="d-flex justify-content-between"><span>Salary / Month:</span><strong>{fmtKES(s.salary_amount)}</strong></div>
                <div className="d-flex justify-content-between"><span>Paid (This Month):</span><strong>{fmtKES(s.current_paid)}</strong></div>
                <div className="d-flex justify-content-between"><span>Month Balance:</span><strong className={s.current_balance > 0 ? 'text-danger' : 'text-success'}>{fmtKES(s.current_balance)}</strong></div>
                <div className="d-flex justify-content-between"><span>Previous Balance:</span><strong className={s.previous_balance > 0 ? 'text-warning' : 'text-muted'}>{fmtKES(s.previous_balance)}</strong></div>
                <hr className="my-1" />
                <div className="d-flex justify-content-between"><span><strong>Total Due:</strong></span><strong className={s.total_due > 0 ? 'text-danger' : 'text-success'}>{fmtKES(s.total_due)}</strong></div>
              </div>
            );
          })()}

          <div className="mb-3">
            <label className="form-label">Amount (KES) <span className="text-danger">*</span></label>
            <input
              type="number"
              className="form-control"
              placeholder="Enter amount"
              value={directPaymentData.amount}
              onChange={(e) => setDirectPaymentData({ ...directPaymentData, amount: e.target.value })}
              min="1"
              step="100"
              required
              disabled={directPaymentProcessing}
            />
            {directPaymentData.userId && (() => {
              const s = staffList.find(x => x.user_id === directPaymentData.userId);
              if (!s) return null;
              const max = Math.max(s.total_due, 0);
              return (
                <small className="text-muted">
                  Maximum outstanding: {fmtKES(max)}
                  {max > 0 && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 ms-2"
                      onClick={() => setDirectPaymentData({ ...directPaymentData, amount: max.toString() })}
                    >
                      Pay full balance
                    </button>
                  )}
                </small>
              );
            })()}
          </div>
          <div className="mb-3">
            <label className="form-label">Payment Method <span className="text-danger">*</span></label>
            <select
              className="form-control"
              value={directPaymentData.method}
              onChange={(e) => setDirectPaymentData({ ...directPaymentData, method: e.target.value })}
              disabled={directPaymentProcessing}
            >
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
            </select>
          </div>
          {directPaymentData.method === 'mpesa' && (
            <div className="mb-3">
              <label className="form-label">M-Pesa Reference <span className="text-danger">*</span></label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. RB64AX25B1"
                value={directPaymentData.reference}
                onChange={(e) => setDirectPaymentData({ ...directPaymentData, reference: e.target.value.toUpperCase() })}
                required
                disabled={directPaymentProcessing}
              />
            </div>
          )}
          <div className="mb-3">
            <label className="form-label">Notes</label>
            <textarea
              className="form-control"
              rows="2"
              placeholder="Optional notes"
              value={directPaymentData.notes}
              onChange={(e) => setDirectPaymentData({ ...directPaymentData, notes: e.target.value })}
              disabled={directPaymentProcessing}
            />
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-primary"
              onClick={handleRecordDirectPayment}
              disabled={directPaymentProcessing}
            >
              {directPaymentProcessing ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...</> : 'Record Payment'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (directPaymentProcessing) return;
                setShowDirectPaymentModal(false);
                setDirectPaymentData({ userId: null, amount: '', method: 'cash', reference: '', notes: '' });
              }}
              disabled={directPaymentProcessing}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SalaryManagement;