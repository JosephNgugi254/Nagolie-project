import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import Modal from '../common/Modal';
import ConfirmationDialog from '../common/ConfirmationDialog';
import { generateValuerReportFromData } from '../admin/ReceiptPDF';

const ValuerPanel = () => {
  const { user } = useAuth();
  const [flaggedClients, setFlaggedClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [reportComments, setReportComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all'); // 'all', 'isinya', 'emarti'

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveLoanId, setResolveLoanId] = useState(null);

  const noteTimeout = useRef({});

  const fetchFlagged = useCallback(async () => {
    try {
      const res = await recoveryAPI.getFlaggedClients();
      setFlaggedClients(res.data);
    } catch (err) {
      showToast.error('Failed to load flagged clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlagged();
  }, [fetchFlagged]);

  const fetchReportComments = async (loanId) => {
    setLoadingComments(true);
    try {
      const res = await recoveryAPI.getLoanReportComments(loanId);
      setReportComments(res.data);
    } catch (err) {
      console.error('Failed to load report comments', err);
      setReportComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const autoSaveNotes = (loanId, value) => {
    if (noteTimeout.current[loanId]) clearTimeout(noteTimeout.current[loanId]);
    noteTimeout.current[loanId] = setTimeout(async () => {
      try {
        await recoveryAPI.updateValuerNotes(loanId, value);
        setFlaggedClients(prev => prev.map(c => c.loan_id === loanId ? { ...c, valuer_notes: value } : c));
      } catch (err) {
        console.error('Auto-save failed', err);
      }
    }, 600);
  };

  const handleResolveClick = (loanId) => {
    setResolveLoanId(loanId);
    setShowResolveModal(true);
  };

  const confirmResolve = async () => {
    if (!resolveLoanId) return;
    try {
      await recoveryAPI.resolveFlag(resolveLoanId);
      showToast.success('Flag resolved, client returned to officer');
      fetchFlagged();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to resolve');
    } finally {
      setShowResolveModal(false);
      setResolveLoanId(null);
    }
  };

  const previewReport = async () => {
    const reportDate = new Date().toLocaleDateString('en-GB');
    // Download report for the currently filtered list
    await generateValuerReportFromData(filteredClients, reportDate, user.username);
  };

  // Branch filter logic 
  const filterByBranch = (clients) => {
    if (branchFilter === 'all') return clients;
    return clients.filter(client => {
      const loc = (client.location || '').toLowerCase();
      if (branchFilter === 'emarti') {
        return loc.includes('emarti');
      }
      // 'isinya' – show all clients that are NOT emarti
      return !loc.includes('emarti');
    });
  };

  const filteredClients = filterByBranch(flaggedClients);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="valuers-panel">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2>📋 Flagged Clients for Recovery</h2>
        <button className="btn btn-info" onClick={previewReport}>
          <i className="fas fa-download me-2"></i>Download Report
        </button>
      </div>

      {/* Branch filter buttons */}
      <div className="d-flex flex-wrap gap-3 mb-4">
        <button
          className={`btn ${branchFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setBranchFilter('all')}
        >
          <i className="fas fa-globe me-1"></i> All
        </button>
        <button
          className={`btn ${branchFilter === 'isinya' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setBranchFilter('isinya')}
        >
          <i className="fas fa-building me-1"></i> Isinya (Kap North Ward)
        </button>
        <button
          className={`btn ${branchFilter === 'emarti' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setBranchFilter('emarti')}
        >
          <i className="fas fa-store me-1"></i> Emarti Branch (Imaroro Ward)
        </button>
      </div>

      <div className="table-responsive">
        <table className="table table-bordered table-hover">
          <thead className="table-light">
            <tr>
              <th>Client Name</th>
              <th>Phone</th>
              <th>Principal (KES)</th>
              <th>Interest (KES)</th>
              <th>Total (KES)</th>
              <th>Collateral Value</th>
              <th>Flagged By</th>
              <th>Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => (
              <tr key={client.loan_id}>
                <td>{client.client_name}</td>
                <td>{client.phone}</td>
                <td>{client.current_principal.toLocaleString()}</td>
                <td>{client.unpaid_interest.toLocaleString()}</td>
                <td className="fw-bold">{client.total_outstanding.toLocaleString()}</td>
                <td>{client.collateral_value.toLocaleString()}</td>
                <td>{client.flagged_by_username}</td>
                <td>{client.location || '—'}</td>
                <td>
                  <button
                    className="btn btn-sm btn-primary me-1"
                    onClick={async () => {
                      setSelectedClient(client);
                      await fetchReportComments(client.loan_id);
                      setShowClientModal(true);
                    }}
                  >
                    <i className="fas fa-edit"></i> Details
                  </button>
                  <button
                    className="btn btn-sm btn-warning"
                    onClick={() => handleResolveClick(client.loan_id)}
                  >
                    <i className="fas fa-check"></i> Resolve
                  </button>
                </td>
              </tr>
            ))}
            {filteredClients.length === 0 && (
              <tr>
                <td colSpan="9" className="text-center text-muted py-4">
                  No flagged clients match the selected branch filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Client Detail Modal */}
      <Modal
        isOpen={showClientModal}
        onClose={() => setShowClientModal(false)}
        title={`Recovery Details – ${selectedClient?.client_name}`}
        size="lg"
      >
        {selectedClient && (
          <>
            <div className="row">
              <div className="col-md-6">
                <p><strong>Phone:</strong> {selectedClient.phone}</p>
                <p><strong>Current Principal:</strong> KES {selectedClient.current_principal.toLocaleString()}</p>
                <p><strong>Unpaid Interest:</strong> KES {selectedClient.unpaid_interest.toLocaleString()}</p>
                <p><strong>Total Outstanding:</strong> KES {selectedClient.total_outstanding.toLocaleString()}</p>
                <p><strong>Collateral Value:</strong> KES {selectedClient.collateral_value.toLocaleString()}</p>
                <p><strong>Repayment Plan:</strong> {selectedClient.repayment_plan}</p>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-bold">Valuer Notes (auto‑saved)</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={selectedClient.valuer_notes}
                  onChange={(e) => {
                    const newNotes = e.target.value;
                    setSelectedClient({ ...selectedClient, valuer_notes: newNotes });
                    autoSaveNotes(selectedClient.loan_id, newNotes);
                  }}
                />
              </div>
            </div>

            <hr />
            <h5>Officer's Daily Report Comments</h5>
            {loadingComments ? (
              <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>
            ) : reportComments.length === 0 ? (
              <p className="text-muted">No report comments have been recorded for this client.</p>
            ) : (
              <div className="list-group">
                {reportComments.map(comment => (
                  <div key={comment.id} className="list-group-item">
                    <div className="d-flex justify-content-between">
                      <strong>{comment.officer_name}</strong>
                      <small className="text-muted">{new Date(comment.report_date).toLocaleDateString()}</small>
                    </div>
                    <p className="mt-1 mb-0">{comment.comment}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 d-flex justify-content-end">
              <button className="btn btn-secondary" onClick={() => setShowClientModal(false)}>Close</button>
            </div>
          </>
        )}
      </Modal>

      {/* Resolve Confirmation Modal */}
      <ConfirmationDialog
        isOpen={showResolveModal}
        onClose={() => {
          setShowResolveModal(false);
          setResolveLoanId(null);
        }}
        onConfirm={confirmResolve}
        title="Confirm Recovery"
        message="Are you sure you want to add this client back to the recovery module? The client will be returned to the original officer and will no longer appear in your flagged list."
        confirmText="Yes, Add to Recovery Module"
        confirmColor="success"
      />
    </div>
  );
};

export default ValuerPanel;