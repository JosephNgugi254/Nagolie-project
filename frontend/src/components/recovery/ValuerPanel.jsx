// components/recovery/ValuerPanel.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recoveryAPI, adminAPI } from '../../services/api';  // <-- added adminAPI
import { showToast } from '../common/Toast';
import Modal from '../common/Modal';
import ConfirmationDialog from '../common/ConfirmationDialog';
import { generateValuerReportFromData, generateLoanInvoicePDF } from '../admin/ReceiptPDF';  // <-- added generateLoanInvoicePDF

const ValuerPanel = ({ editable = true }) => {
  const { user } = useAuth();

  const [flaggedClients, setFlaggedClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [reportComments, setReportComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveLoanId, setResolveLoanId] = useState(null);

  const [showLoanDetailsModal, setShowLoanDetailsModal] = useState(false);
  const [selectedLoanDetails, setSelectedLoanDetails] = useState(null);

  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const noteTimeout = useRef({});

  // Helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB');
    } catch {
      return 'N/A';
    }
  };

  // Fetch flagged clients
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

  // Auto‑set branch filter based on logged-in valuer's default_branch
  useEffect(() => {
    if (user && user.role === 'valuer' && user.default_branch) {
      setBranchFilter(user.default_branch);
    }
  }, [user]);

  // Fetch report comments for a loan
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

  // Auto‑save valuer notes – only when editable
  const autoSaveNotes = (loanId, value) => {
    if (!editable) return;

    if (noteTimeout.current[loanId]) clearTimeout(noteTimeout.current[loanId]);
    noteTimeout.current[loanId] = setTimeout(async () => {
      try {
        await recoveryAPI.updateValuerNotes(loanId, value);
        setFlaggedClients(prev =>
          prev.map(c =>
            c.loan_id === loanId ? { ...c, valuer_notes: value } : c
          )
        );
      } catch (err) {
        console.error('Auto-save failed', err);
      }
    }, 600);
  };

  const handleResolveClick = (loanId) => {
    if (!editable) return;
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

  // Generate report – preview or download (always available)
  const generateReport = async (download = true) => {
    const reportDate = new Date().toLocaleDateString('en-GB');
    await generateValuerReportFromData(filteredClients, reportDate, user?.username || 'Valuer', download);
  };

  // ---------- NEW: Download Invoice (exactly as in RecoveryModule) ----------
  const handleDownloadInvoice = async (client) => {
    try {
      // 1. Fetch the most current loan data (including period_interest_prepaid)
      const loanResponse = await adminAPI.getLoan(client.loan_id);
      const freshLoan = loanResponse.data;

      // 2. Get transactions for the invoice
      const txnResponse = await recoveryAPI.getLoanTransactions(client.loan_id);

      // 3. Generate invoice with fresh data
      await generateLoanInvoicePDF(freshLoan, txnResponse.data || []);
      showToast.success('Invoice downloaded');
    } catch (error) {
      console.error('Invoice error:', error);
      showToast.error('Failed to generate invoice');
    }
  };
  // -----------------------------------------------------------------

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
        <div className="d-flex gap-2">
          <button className="btn btn-info" onClick={() => generateReport(false)}>
            <i className="fas fa-eye me-2"></i>Preview Report
          </button>
          <button className="btn btn-success" onClick={() => generateReport(true)}>
            <i className="fas fa-download me-2"></i>Download Report
          </button>
        </div>
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
                <td>
                  {client.client_name}
                  <span className={`badge ms-2 ${client.repayment_plan === 'daily' ? 'bg-primary' : 'bg-secondary'}`}>
                    {client.repayment_plan === 'daily' ? 'Daily' : 'Weekly'}
                  </span>
                </td>
                <td>{client.phone}</td>
                <td>{client.current_principal.toLocaleString()}</td>
                <td>{client.unpaid_interest.toLocaleString()}</td>
                <td className="fw-bold text-danger">{client.total_outstanding.toLocaleString()}</td>
                <td>{client.collateral_value.toLocaleString()}</td>
                <td>{client.flagged_by_username}</td>
                <td>{client.location || '—'}</td>
                <td>
                  <div className="btn-group btn-group-sm">
                    <button
                      className="btn btn-sm btn-primary me-1"
                      onClick={async () => {
                        setSelectedClient(client);
                        await fetchReportComments(client.loan_id);
                        setShowCommentsModal(true);
                      }}
                      title="View Comments & Valuer Notes"
                    >
                      <i className="fas fa-comment"></i> Comments
                    </button>
                    <button
                      className="btn btn-sm btn-secondary me-1"
                      onClick={() => {
                        setSelectedLoanDetails(client);
                        setShowLoanDetailsModal(true);
                      }}
                      title="View Full Loan Details"
                    >
                      <i className="fas fa-eye"></i> View Details
                    </button>
                    {/* NEW: Download Invoice button */}
                    <button
                      className="btn btn-sm btn-info me-1"
                      onClick={() => handleDownloadInvoice(client)}
                      title="Download Invoice"
                    >
                      <i className="fas fa-file-invoice"></i>
                    </button>
                    {editable && (
                      <button
                        className="btn btn-sm btn-warning"
                        onClick={() => handleResolveClick(client.loan_id)}
                        title="Resolve and return to officer"
                      >
                        <i className="fas fa-check"></i> Resolve
                      </button>
                    )}
                  </div>
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

      {/* Comments Modal (unchanged) */}
      <Modal
        isOpen={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        title={`Recovery Comments – ${selectedClient?.client_name}`}
        size="lg"
      >
        {selectedClient && (
          <>
            <div className="mb-3">
              <p><strong>Client:</strong> {selectedClient.client_name}</p>
              <p><strong>Phone:</strong> {selectedClient.phone}</p>
              <p><strong>Loan ID:</strong> {selectedClient.loan_id}</p>
            </div>

            {editable && (
              <div className="mb-3">
                <label className="form-label fw-bold">Valuer Recovery Notes (auto‑saved)</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={selectedClient.valuer_notes || ''}
                  onChange={(e) => {
                    const newNotes = e.target.value;
                    setSelectedClient({ ...selectedClient, valuer_notes: newNotes });
                    autoSaveNotes(selectedClient.loan_id, newNotes);
                  }}
                  placeholder="Enter your valuer notes here..."
                />
              </div>
            )}

            {!editable && selectedClient.valuer_notes && (
              <div className="mb-3">
                <label className="form-label fw-bold">Valuer Notes (read‑only)</label>
                <div className="p-2 bg-light rounded">
                  {selectedClient.valuer_notes}
                </div>
              </div>
            )}

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
                      <small className="text-muted">
                        {new Date(comment.created_at).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </small>
                    </div>
                    <p className="mt-1 mb-0">{comment.comment}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 d-flex justify-content-end">
              <button className="btn btn-secondary" onClick={() => setShowCommentsModal(false)}>Close</button>
            </div>
          </>
        )}
      </Modal>

      {/* Loan Details Modal (unchanged) */}
      {showLoanDetailsModal && selectedLoanDetails && (
        <Modal
          isOpen={showLoanDetailsModal}
          onClose={() => {
            setShowLoanDetailsModal(false);
            setSelectedLoanDetails(null);
          }}
          title="Loan Details"
          size="lg"
        >
          <div className="row">
            <div className="col-md-6">
              <p><strong>Client Name:</strong> {selectedLoanDetails.client_name}</p>
              <p><strong>Phone:</strong> {selectedLoanDetails.phone}</p>
              <p><strong>ID Number:</strong> {selectedLoanDetails.id_number || 'N/A'}</p>
              <p><strong>Location:</strong> {selectedLoanDetails.location || 'N/A'}</p>
              <p><strong>Disbursement Date:</strong> {formatDate(selectedLoanDetails.disbursement_date)}</p>
              <p><strong>Due Date:</strong> {formatDate(selectedLoanDetails.due_date)}</p>
              <p><strong>Repayment Plan:</strong> {selectedLoanDetails.repayment_plan === 'daily' ? 'Daily (4.5%)' : 'Weekly (30%)'}</p>
              <p><strong>Current Principal:</strong> {formatCurrency(selectedLoanDetails.current_principal)}</p>
              <p><strong>Unpaid Interest:</strong> {formatCurrency(selectedLoanDetails.unpaid_interest)}</p>
              <p><strong>Total Outstanding:</strong> <span className="text-danger fw-bold">{formatCurrency(selectedLoanDetails.total_outstanding)}</span></p>
            </div>
            <div className="col-md-6">
              <p><strong>Livestock Type:</strong> {selectedLoanDetails.livestock_type}</p>
              <p><strong>Count:</strong> {selectedLoanDetails.livestock_count}</p>
              <p><strong>Collateral Value:</strong> {formatCurrency(selectedLoanDetails.collateral_value)}</p>
              <p><strong>Flagged By:</strong> {selectedLoanDetails.flagged_by_username}</p>
              <p><strong>Flagged At:</strong> {formatDate(selectedLoanDetails.flagged_at)}</p>
              <p><strong>Interest Rate:</strong> {selectedLoanDetails.interest_rate}%</p>
            </div>
          </div>

          {selectedLoanDetails.photos && selectedLoanDetails.photos.length > 0 && (
            <div className="mt-3">
              <h6>Livestock Photos</h6>
              <div className="row">
                {selectedLoanDetails.photos.map((photo, index) => (
                  <div key={index} className="col-4 mb-2">
                    <img
                      src={photo}
                      alt={`Livestock ${index + 1}`}
                      className="img-fluid rounded"
                      style={{ height: '150px', width: '100%', objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedImage(photo);
                        setShowImageModal(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 d-flex justify-content-end">
            <button className="btn btn-secondary" onClick={() => setShowLoanDetailsModal(false)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Image Zoom Modal (unchanged) */}
      {showImageModal && selectedImage && (
        <Modal
          isOpen={showImageModal}
          onClose={() => {
            setShowImageModal(false);
            setSelectedImage(null);
          }}
          title="Livestock Photo"
          size="lg"
        >
          <div className="text-center">
            <img src={selectedImage} alt="Livestock" className="img-fluid rounded" style={{ maxHeight: '70vh' }} />
          </div>
          <div className="mt-3 text-center">
            <button className="btn btn-secondary" onClick={() => setShowImageModal(false)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Resolve Confirmation Modal (unchanged) */}
      {editable && (
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
      )}
    </div>
  );
};

export default ValuerPanel;