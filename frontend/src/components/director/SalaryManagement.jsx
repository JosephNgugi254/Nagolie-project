import React, { useState, useEffect } from 'react';
import { showToast } from '../common/Toast';
import { salaryAPI } from '../../services/api';
import Modal from '../common/Modal';
import { generateSalaryReportPDF } from '../admin/ReceiptPDF';

const SalaryManagement = () => {
  const [activeTab, setActiveTab] = useState('staff');
  const [staffList, setStaffList] = useState([]);
  const [requests, setRequests] = useState([]);
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
  const [directPayment, setDirectPayment] = useState({ userId: null, amount: '', reference: '', notes: '', method: 'cash' });

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

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

  useEffect(() => {
    if (activeTab === 'staff') fetchStaff();
    else if (activeTab === 'requests') fetchRequests();
  }, [activeTab, month]);

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
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleRecordDirectPayment = async () => {
    const { userId, amount, reference, notes, method } = directPayment;
    if (!userId || !amount || parseFloat(amount) <= 0) {
      showToast.error('Please fill all fields');
      return;
    }
    if (method === 'mpesa' && !reference.trim()) {
      showToast.error('M-Pesa reference required');
      return;
    }
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
      setDirectPayment({ userId: null, amount: '', reference: '', notes: '', method: 'cash' });
      fetchStaff();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to record payment');
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

  // ---- Render staff tab ----
  const renderStaffTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6>Staff Salaries for {month}</h6>
        <div>
          <button className="btn btn-sm btn-outline-secondary me-2" onClick={fetchStaff}>
            <i className="fas fa-sync"></i> Refresh
          </button>
          <button className="btn btn-sm btn-success" onClick={() => setDirectPayment({ ...directPayment, userId: staffList[0]?.user_id || null, amount: '' })} title='Process payment'>
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
                        title='Add or Edit salary amount'
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-outline-info me-1"
                        onClick={() => handleGenerateReport(s)}
                        title='Generate Salary report'
                      >
                        <i className="fas fa-file-pdf"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-outline-success"
                        onClick={() => {
                          setDirectPayment({ ...directPayment, userId: s.user_id, amount: '' });
                        }}
                        title='Process Salary Payment'
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
      {/* Direct Payment Form */}
      {directPayment.userId && (
        <div className="card mt-3">
          <div className="card-body">
            <h6>Record Direct Salary Payment</h6>
            <div className="row g-2">
              <div className="col-md-3">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Amount"
                  value={directPayment.amount}
                  onChange={(e) => setDirectPayment({ ...directPayment, amount: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <select
                  className="form-control"
                  value={directPayment.method}
                  onChange={(e) => setDirectPayment({ ...directPayment, method: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                </select>
              </div>
              <div className="col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Reference (if M-Pesa)"
                  value={directPayment.reference}
                  onChange={(e) => setDirectPayment({ ...directPayment, reference: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Notes"
                  value={directPayment.notes}
                  onChange={(e) => setDirectPayment({ ...directPayment, notes: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <button className="btn btn-primary w-100" onClick={handleRecordDirectPayment}>
                  Record
                </button>
              </div>
            </div>
            <small className="text-muted">Payment will be deducted from this month's salary.</small>
          </div>
        </div>
      )}
    </div>
  );

  // ---- Render requests tab ----
  const renderRequestsTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6>Advance Requests</h6>
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchRequests}>
          <i className="fas fa-sync"></i> Refresh
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
                <td>{req.month}</td>
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
      </ul>

      {activeTab === 'staff' && renderStaffTab()}
      {activeTab === 'requests' && renderRequestsTab()}

      {/* Payment Modal */}
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
            <button className="btn btn-danger" onClick={confirmReject} title='Reject request'> 
              Confirm Rejection
            </button>
            <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SalaryManagement;