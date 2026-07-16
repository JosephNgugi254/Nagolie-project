import React, { useState, useEffect } from 'react';
import { showToast } from '../common/Toast';
import { salaryAPI } from '../../services/api';
import Modal from '../common/Modal';
import { generateSalaryReportPDF, generateSalaryTransactionReceipt } from '../admin/ReceiptPDF';

// Helper to format month to "Month/YYYY"
const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleString('default', { month: 'long' }) + '/' + year;
};

const SalaryManagement = () => {
  const [activeTab, setActiveTab] = useState('staff');
  const [staffList, setStaffList] = useState([]);
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

  // State for Direct Payment Modal
  const [showDirectPaymentModal, setShowDirectPaymentModal] = useState(false);
  const [directPaymentData, setDirectPaymentData] = useState({
    userId: null,
    amount: '',
    method: 'cash',
    reference: '',
    notes: ''
  });
  const [directPaymentProcessing, setDirectPaymentProcessing] = useState(false);

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Transactions tab filters
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionDate, setTransactionDate] = useState('');

  // Fetch staff and requests
  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await salaryAPI.getStaffSettings(month);
      setStaffList(res.data);
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
    try {
      await salaryAPI.setStaffSalary(editingStaff.user_id, month, parseFloat(salaryAmount));
      showToast.success('Salary updated');
      setEditingStaff(null);
      fetchStaff();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to update salary');
    }
  };

  const handleProcessRequest = async (requestId, action, reason = '') => {
    try {
      await salaryAPI.processAdvanceRequest(requestId, action, reason);
      showToast.success(`Request ${action}ed`);
      fetchRequests();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Processing failed');
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
    await handleProcessRequest(rejectRequestId, 'reject', rejectReason);
    setShowRejectModal(false);
    setRejectRequestId(null);
    setRejectReason('');
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

  // Direct Payment modal handlers
  const openDirectPaymentModal = (userId = null) => {
    // userId = null means Quick Pay (staff selection enabled)
    // userId = number means Pay from row (staff pre‑selected, no dropdown)
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
    try {
      const res = await salaryAPI.getStaffReportData(user.user_id, month);
      generateSalaryReportPDF(res.data);
    } catch (err) {
      showToast.error('Failed to generate report');
    }
  };

  // Download single transaction receipt
  const handleDownloadTransactionReceipt = async (transaction) => {
    try {
      await generateSalaryTransactionReceipt(transaction);
      showToast.success('Receipt downloaded');
    } catch (err) {
      showToast.error('Failed to generate receipt');
    }
  };

  // ---- Render staff tab ----
  const renderStaffTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6>Staff Salaries for {formatMonthDisplay(month)}</h6>
        <div>
          <button className="btn btn-sm btn-outline-secondary me-2" onClick={fetchStaff}>
            <i className="fas fa-sync"></i> Refresh
          </button>
          <button
            className="btn btn-sm btn-success"
            onClick={() => openDirectPaymentModal(null)}   // Quick Pay – no pre‑selected staff
            title="Quick Pay – record salary payment for any staff"
          >
            <i className="fas fa-money-bill-wave"></i> Quick Pay
          </button>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Role</th>
              <th>Salary Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map(s => (
              <tr key={s.user_id}>
                <td>{s.username}</td>
                <td>{s.role}</td>
                <td>
                  {editingStaff?.user_id === s.user_id ? (
                    <input
                      type="number"
                      className="form-control form-control-sm d-inline-block w-auto"
                      value={salaryAmount}
                      onChange={(e) => setSalaryAmount(e.target.value)}
                      min="0"
                      step="100"
                    />
                  ) : (
                    `KES ${s.salary_amount.toFixed(2)}`
                  )}
                </td>
                <td>
                  {editingStaff?.user_id === s.user_id ? (
                    <>
                      <button className="btn btn-sm btn-success me-1" onClick={handleSaveSalary}>
                        <i className="fas fa-check"></i>
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditingStaff(null)}>
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
                        title="Add or Edit salary amount"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-outline-info me-1"
                        onClick={() => handleGenerateReport(s)}
                        title="Generate Salary report"
                      >
                        <i className="fas fa-file-pdf"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-outline-success"
                        onClick={() => openDirectPaymentModal(s.user_id)}   // Pay for this specific staff
                        title="Process Salary Payment"
                      >
                        <i className="fas fa-money-bill-wave"></i> Pay
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ---- Render requests tab ----
  const renderRequestsTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6>Advance Requests</h6>
        {/* Refresh removed – auto‑updates */}
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
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => openRejectModal(req.id)}
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

  // ---- Render transactions tab ----
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
          />
          <input
            type="date"
            className="form-control form-control-sm"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            style={{ width: '160px' }}
          />
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
              <tr><td colSpan="8" className="text-center">Loading...</td></tr>
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
                      title="Download Receipt"
                    >
                      <i className="fas fa-file-pdf"></i>
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
        <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title="Record Advance Payment">
          <div className="mb-3">
            <label className="form-label">Staff: {selectedRequest.username}</label>
            <input type="text" className="form-control" value={`KES ${selectedRequest.amount.toFixed(2)}`} readOnly />
          </div>
          <div className="mb-3">
            <label className="form-label">Payment Method</label>
            <select className="form-control" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
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
              />
            </div>
          )}
          <div className="mb-3">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows="2" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handlePayRequest} disabled={processing}>
            {processing ? 'Processing...' : 'Confirm Payment'}
          </button>
        </Modal>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Advance Request">
          <div className="mb-3">
            <label className="form-label">Reason for Rejection <span className="text-danger">*</span></label>
            <textarea
              className="form-control"
              rows="4"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Please provide a reason for rejecting this request..."
              required
            />
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-danger" onClick={confirmReject} title="Reject request">
              Confirm Rejection
            </button>
            <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Direct Salary Payment Modal – conditional staff selection */}
      {showDirectPaymentModal && (
        <Modal
          isOpen={showDirectPaymentModal}
          onClose={() => {
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
              // Staff is pre‑selected – show name as read‑only
              <input
                type="text"
                className="form-control"
                value={staffList.find(s => s.user_id === directPaymentData.userId)?.username || 'Unknown'}
                readOnly
                disabled
              />
            ) : (
              // Quick Pay – show dropdown
              <select
                className="form-control"
                value={directPaymentData.userId || ''}
                onChange={(e) => setDirectPaymentData({ ...directPaymentData, userId: parseInt(e.target.value) })}
                required
              >
                <option value="">-- Choose Staff --</option>
                {staffList.map(s => (
                  <option key={s.user_id} value={s.user_id}>{s.username} ({s.role})</option>
                ))}
              </select>
            )}
          </div>
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
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Payment Method <span className="text-danger">*</span></label>
            <select
              className="form-control"
              value={directPaymentData.method}
              onChange={(e) => setDirectPaymentData({ ...directPaymentData, method: e.target.value })}
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
            />
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-primary"
              onClick={handleRecordDirectPayment}
              disabled={directPaymentProcessing}
            >
              {directPaymentProcessing ? 'Processing...' : 'Record Payment'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowDirectPaymentModal(false);
                setDirectPaymentData({ userId: null, amount: '', method: 'cash', reference: '', notes: '' });
              }}
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