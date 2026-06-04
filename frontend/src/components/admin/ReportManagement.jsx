import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import ConfirmationDialog from '../common/ConfirmationDialog';
import Modal from '../common/Modal';   // your existing Modal component

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ReportManagement = () => {
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [draggedClient, setDraggedClient] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingReassign, setPendingReassign] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [showOfficerSelectModal, setShowOfficerSelectModal] = useState(false);
  const [selectedLoanForReassign, setSelectedLoanForReassign] = useState(null);
  const [selectedOfficerId, setSelectedOfficerId] = useState(null);

  useEffect(() => {
    fetchDayAssignments();
    fetchClientAssignments();
  }, []);

  const fetchDayAssignments = async () => {
    try {
      const res = await adminAPI.getDayAssignments();
      setUsers(res.data);
    } catch (error) {
      showToast.error('Failed to load day assignments');
    }
  };

  const fetchClientAssignments = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getClientAssignments();
      setAssignments(res.data);
    } catch (error) {
      showToast.error('Failed to load client assignments');
    } finally {
      setLoading(false);
    }
  };

  const updateDayAssignment = async (userId, days) => {
    try {
      await adminAPI.updateDayAssignment(userId, days);
      showToast.success('Day assignments updated');
      fetchDayAssignments();
      fetchClientAssignments();
    } catch (error) {
      showToast.error('Failed to update assignments');
    }
  };

  const handleDayToggle = (user, dayIdx) => {
    // Check if the day is already assigned to another officer
    const alreadyTaken = users.some(u => u.id !== user.id && (u.days || []).includes(dayIdx));
    if (alreadyTaken) {
      showToast.warning(`Day ${DAYS[dayIdx]} is already assigned to another officer. You cannot assign it to multiple officers.`);
      return;
    }
  
    const currentDays = user.days || [];
    let newDays;
    if (currentDays.includes(dayIdx)) {
      newDays = currentDays.filter(d => d !== dayIdx);
    } else {
      newDays = [...currentDays, dayIdx];
    }
    updateDayAssignment(user.id, newDays);
  };

  const handleReassign = async (loanId, newOfficerId, reason = 'Manual drag & drop') => {
    try {
      await adminAPI.reassignClient(loanId, newOfficerId, reason);
      showToast.success('Client reassigned');
      fetchClientAssignments();
    } catch (error) {
      showToast.error('Reassignment failed');
    }
  };

  // Drag & drop handlers
  const onDragStart = (e, client, fromOfficerId) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ client, fromOfficerId }));
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.cursor = 'grabbing';
  };

  const onDragEnd = (e) => {
    e.currentTarget.style.cursor = '';
  };

  const onDrop = (e, targetOfficerId) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const { client, fromOfficerId } = JSON.parse(raw);
    if (fromOfficerId === targetOfficerId) return;
    setPendingReassign({
      loanId: client.loan_id,
      newOfficerId: targetOfficerId,
      clientName: client.client_name,
      targetOfficerName: assignments.find(a => a.id === targetOfficerId)?.username
    });
    setShowConfirm(true);
    setDraggedClient(null);
  };

  const confirmReassign = async () => {
    if (pendingReassign) {
      await handleReassign(pendingReassign.loanId, pendingReassign.newOfficerId);
      setShowConfirm(false);
      setPendingReassign(null);
    }
  };

  const onDragOver = (e) => e.preventDefault();

  // Button‑based reassign: show officer selection modal
  const openOfficerSelectModal = (loanId, clientName) => {
    setSelectedLoanForReassign({ loanId, clientName });
    setSelectedOfficerId(null);
    setShowOfficerSelectModal(true);
  };

  const confirmOfficerReassign = async () => {
    if (!selectedLoanForReassign || !selectedOfficerId) {
      showToast.error('Please select an officer');
      return;
    }
    await handleReassign(selectedLoanForReassign.loanId, selectedOfficerId, 'Manual button reassign');
    setShowOfficerSelectModal(false);
    setSelectedLoanForReassign(null);
    setSelectedOfficerId(null);
  };

  const getBalancedSuggestions = async () => {
    try {
      const res = await adminAPI.getBalanceSuggestions();
      setSuggestions(res.data.suggestions);
      setShowSuggestionModal(true);
    } catch (error) {
      showToast.error('Failed to generate suggestions');
    }
  };

  const applySuggestions = async () => {
    try {
      await adminAPI.applySuggestions(suggestions);
      showToast.success('Balanced distribution applied');
      setShowSuggestionModal(false);
      fetchClientAssignments();
    } catch (error) {
      showToast.error('Failed to apply suggestions');
    }
  };

  const resetToDayBased = async () => {
    try {
      await adminAPI.resetDayAssignments();
      showToast.success('Reset to day-based assignments');
      fetchClientAssignments();
    } catch (error) {
      showToast.error('Failed to reset assignments');
    }
  };

  

  const totals = assignments.reduce((acc, off) => ({
    principal: acc.principal + off.total_principal,
    interest: acc.interest + off.total_interest,
    balance: acc.balance + off.total_balance
  }), { principal: 0, interest: 0, balance: 0 });

  const formatCurrency = (val) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(val);

  return (
    <div className="content-section">
      <style>{`
        .draggable-client {
          cursor: grab;
        }
        .draggable-client:active {
          cursor: grabbing;
        }
      `}</style>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Report Management</h2>
        <div>
          <button className="btn btn-secondary me-2" onClick={resetToDayBased}>
            <i className="fas fa-undo me-2"></i>Reset to Day-Based
          </button>
          <button className="btn btn-primary" onClick={getBalancedSuggestions}>
            <i className="fas fa-balance-scale me-2"></i>Balance Workload
          </button>
        </div>
      </div>

      {/* Day assignment panel */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">Officer Day Assignments</h5>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered">
              <thead>
                <tr>
                  <th>Officer</th>
                  {DAYS.map((day, idx) => <th key={idx}>{day}</th>)}
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td><strong>{user.username}</strong> <span className="badge bg-secondary ms-2">{user.role}</span></td>
                    {DAYS.map((_, idx) => (
                      <td key={idx} className="text-center">
                        <input
                          type="checkbox"
                          checked={user.days?.includes(idx) || false}
                          onChange={() => handleDayToggle(user, idx)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="text-muted">Each day can be assigned to only one officer. Checking a day for one officer will remove it from others.</small>
        </div>
      </div>

      {/* Client assignments per officer (draggable rows) */}
      <div className="row">
        {assignments.map(officer => (
          <div
            key={officer.id}
            className="col-md-6 col-lg-4 mb-4"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, officer.id)}
          >
            <div className="card h-100">
              <div className="card-header bg-secondary text-white">
                <h6 className="mb-0">
                  {officer.username} ({officer.role})
                  <span className="float-end badge bg-light text-dark">{officer.clients.length} clients</span>
                </h6>
              </div>
              <div className="card-body p-0">
                <div className="list-group list-group-flush">
                  {officer.clients.map(client => (
                    <div
                      key={client.loan_id}
                      className="list-group-item draggable-client"
                      draggable
                      onDragStart={(e) => onDragStart(e, client, officer.id)}
                      onDragEnd={onDragEnd}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <strong>{client.client_name}</strong><br />
                          <small>Principal: {formatCurrency(client.current_principal)}</small><br />
                          <small>  Interest: {client.interest_rate === 0 ? 'waived' : formatCurrency(client.unpaid_interest)}</small><br />                          <small>Balance: {formatCurrency(client.total_balance)}</small>
                        </div>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title='Reassign Client'
                          onClick={() => openOfficerSelectModal(client.loan_id, client.client_name)}
                        >
                        
                          <i className="fas fa-exchange-alt"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card-footer bg-light">
                <small>Total Principal: {formatCurrency(officer.total_principal)}</small><br />
                <small>Total Interest: {formatCurrency(officer.total_interest)}</small><br />
                <strong>Total Balance: {formatCurrency(officer.total_balance)}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3 bg-info text-white">
        <div className="card-body">
          <h6>Overal Totals</h6>
          <div className="row">
            <div className="col">Principal: {formatCurrency(totals.principal)}</div>
            <div className="col">Interest: {formatCurrency(totals.interest)}</div>
            <div className="col">Balance: {formatCurrency(totals.balance)}</div>
          </div>
        </div>
      </div>

      {/* Drag‑and‑drop confirmation dialog */}
      <ConfirmationDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmReassign}
        title="Confirm Reassignment"
        message={pendingReassign?.newOfficerId
          ? `Move "${pendingReassign.clientName}" to ${pendingReassign.targetOfficerName}?`
          : `Select new officer for ${pendingReassign?.clientName}`}
        confirmText="Reassign"
      />

      {/* Officer selection modal (for button reassign) */}
      <Modal
        isOpen={showOfficerSelectModal}
        onClose={() => setShowOfficerSelectModal(false)}
        title="Reassign Client"
        size="md"
      >
        <div className="mb-3">
          <label className="form-label">Select new officer for <strong>{selectedLoanForReassign?.clientName}</strong></label>
          <select
            className="form-select"
            value={selectedOfficerId || ''}
            onChange={(e) => setSelectedOfficerId(parseInt(e.target.value))}
          >
            <option value="">-- Choose officer --</option>
            {assignments.map(off => (
              <option key={off.id} value={off.id}>
                {off.username} ({off.role}) – currently {off.clients.length} clients
              </option>
            ))}
          </select>
        </div>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-secondary" onClick={() => setShowOfficerSelectModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={confirmOfficerReassign} disabled={!selectedOfficerId}>
            Reassign
          </button>
        </div>
      </Modal>

      {/* Suggestion Modal */}
      {showSuggestionModal && suggestions && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title">Suggested Balanced Distribution</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowSuggestionModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr><th>Officer</th><th>Suggested Total Interest</th><th># Clients</th></tr>
                    </thead>
                    <tbody>
                      {suggestions.map(s => (
                        <tr key={s.officer_id}>
                          <td>{s.officer_name}</td>
                          <td>{formatCurrency(s.suggested_total_interest)}</td>
                          <td>{s.suggested_loans.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="alert alert-info mt-3">
                  <i className="fas fa-info-circle me-2"></i>
                  Approving will permanently reassign all clients according to this suggestion.
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowSuggestionModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={applySuggestions}>Apply Suggestion</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportManagement;