import { useState } from 'react';

function TakeActionModal({ loan, onClose, onSendReminder, onClaimOwnership }) {
  const [selectedAction, setSelectedAction] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isOverdue = loan.days_left < 0;
  const isWeekly = loan.repayment_plan === 'weekly';

  const currentPrincipal = Number(loan.current_principal) || 0;
  const currentPeriodInterest = Number(loan.current_period_interest) || 0;
  const periodPrepaid = Number(loan.period_interest_prepaid) || 0;
  const periodFullyPaid = loan.period_interest_fully_paid === true;

  // Calculate total outstanding interest
  let totalOutstandingInterest;
  if (isWeekly) {
    const owedInterest = periodFullyPaid ? 0 : Math.max(0, currentPeriodInterest - periodPrepaid);
    totalOutstandingInterest = owedInterest;
  } else {
    totalOutstandingInterest = Number(loan.accrued_interest) || 0;
  }

  const totalBalance = currentPrincipal + totalOutstandingInterest;

  // Helper to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Default reminder message – pre‑filled in the textarea
  const defaultReminderMessage = `Hello ${loan.name}, this is a reminder from NAGOLIE ENTERPRISES LTD that your loan is due.
• Principal amount owed: ${formatCurrency(currentPrincipal)}
• Outstanding interest: ${formatCurrency(totalOutstandingInterest)}
• Total balance due: ${formatCurrency(totalBalance)}
Please make your payment to avoid additional charges.

Make your payment via:
Paybill: 247247
Account: 651259

Thank you for choosing us.`;

  const [customMessage, setCustomMessage] = useState(defaultReminderMessage);

  const handleAction = async () => {
    if (!selectedAction) {
      alert('Please select an action first');
      return;
    }
    setIsLoading(true);
    try {
      if (selectedAction === 'reminder') {
        const message = customMessage.trim() || defaultReminderMessage;
        await onSendReminder(loan, message);
      } else if (selectedAction === 'claim') {
        await onClaimOwnership(loan);
      }
    } catch (error) {
      console.error('Error performing action:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">Take Action – {loan.name}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="alert alert-info">
              <h6 className="alert-heading">Loan Summary</h6>
              <div className="row small">
                <div className="col-6"><strong>Client:</strong> {loan.name}</div>
                <div className="col-6"><strong>Phone:</strong> {loan.contacts}</div>
                <div className="col-6"><strong>Principal owed:</strong> {formatCurrency(currentPrincipal)}</div>
                <div className="col-6"><strong>Interest owed:</strong> {formatCurrency(totalOutstandingInterest)}</div>
                <div className="col-6"><strong>Total balance:</strong> {formatCurrency(totalBalance)}</div>
                <div className="col-6">
                  <strong>Status:</strong>
                  <span className={`badge ${isOverdue ? 'bg-danger' : 'bg-warning'} ms-1`}>
                    {isOverdue ? `${Math.abs(loan.days_left)} days overdue` : 'Due tomorrow'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label fw-bold">Select Action:</label>
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="radio"
                  name="actionType"
                  id="sendReminder"
                  value="reminder"
                  checked={selectedAction === 'reminder'}
                  onChange={(e) => setSelectedAction(e.target.value)}
                />
                <label className="form-check-label" htmlFor="sendReminder">
                  <i className="fas fa-sms text-primary me-2"></i>
                  <strong>Send Reminder SMS</strong>
                  <small className="d-block text-muted">Send a polite reminder about the due loan</small>
                </label>
              </div>
              {isOverdue && (
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="actionType"
                    id="claimOwnership"
                    value="claim"
                    checked={selectedAction === 'claim'}
                    onChange={(e) => setSelectedAction(e.target.value)}
                  />
                  <label className="form-check-label" htmlFor="claimOwnership">
                    <i className="fas fa-gavel text-warning me-2"></i>
                    <strong>Claim Livestock Ownership</strong>
                    <small className="d-block text-muted">Take ownership of the collateral (loan is overdue)</small>
                  </label>
                </div>
              )}
            </div>

            {selectedAction === 'reminder' && (
              <div className="mb-3">
                <label className="form-label fw-bold">Customize Message:</label>
                <textarea
                  className="form-control"
                  rows="8"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
                <small className="text-muted">
                  You can edit the message above. It will be pre‑filled in your SMS app.
                </small>
              </div>
            )}

            {selectedAction === 'claim' && (
              <div className="alert alert-warning">
                <i className="fas fa-exclamation-triangle me-2"></i>
                <strong>Warning:</strong> This will permanently close the loan and move the livestock to the gallery.
                This action cannot be undone.
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
            <button
              className={`btn ${selectedAction === 'claim' ? 'btn-warning' : 'btn-primary'}`}
              onClick={handleAction}
              disabled={!selectedAction || isLoading}
            >
              {isLoading ? (
                <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
              ) : (
                <>{selectedAction === 'reminder' ? <i className="fas fa-paper-plane me-2"></i> : <i className="fas fa-gavel me-2"></i>}
                {selectedAction === 'reminder' ? 'Send Reminder' : 'Claim Ownership'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TakeActionModal;