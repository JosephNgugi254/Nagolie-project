// components/admin/TakeActionModal.jsx
import { useState } from 'react';

function TakeActionModal({ client, onClose, onSendReminder, onClaimOwnership }) {
  const [selectedAction, setSelectedAction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  // Calculate due date (14 days after disbursement)
  const disbursementDate = client?.borrowedDate ? new Date(client.borrowedDate) : null;
  const dueDate = disbursementDate ? new Date(disbursementDate.getTime() + 14 * 24 * 60 * 60 * 1000) : null;
  const today = new Date();
  const isPastDue = dueDate ? today > dueDate : false;

  // Overdue status (for claim ownership and overdue reminder)
  const isOverdue =
    (client?.days_overdue > 0) ||
    (client?.weeks_overdue > 0) ||
    (client?.days_left < 0) ||
    (client?.daysLeft < 0);

  // Only show deadline/overdue reminders for active loans (not claimed/completed)
  const isActive = true; // all loans in admin panel are active unless status is different

  // ----- Default messages -----
  const defaultReminderMessage = `Hello ${client?.client_name || client?.name}, this is a reminder from Nagolie Enterprises Ltd that your loan of KES ${client?.balance?.toLocaleString()} is due. Please make your payment to avoid additional charges. Thank you.`;

  const defaultDeadlineMessage = (() => {
    const name = client?.client_name || client?.name;
    const totalBalance = client?.balance || 0;
    const dueDateStr = dueDate ? dueDate.toLocaleDateString('en-KE') : 'the due date';
    return `Hello ${name}, your loan is approaching the 14‑day deadline (${dueDateStr}). You are expected to clear the total outstanding balance of KES ${totalBalance.toLocaleString()} by that date. Please visit our office to sign a compulsory loan renewal agreement if you will not have completed the balance, failure to which recovery will take place. Make your payment via Paybill: 247247, Account: 651259. Thank you.`;
  })();

  const defaultOverdueMessage = (() => {
    const name = client?.client_name || client?.name;
    const totalBalance = client?.balance || 0;
    const dueDateStr = dueDate ? dueDate.toLocaleDateString('en-KE') : 'the due date';
    return `Hello ${name}, your loan has passed the 14‑day deadline (${dueDateStr}). As per the agreement, you must either clear the balance of KES ${totalBalance.toLocaleString()} in full OR visit our office immediately to sign a compulsory loan renewal agreement. Failure to do so will lead to recovery of the collateral. Make your payment via Paybill: 247247, Account: 651259. Thank you.`;
  })();

  const handleSend = async () => {
    if (!selectedAction) {
      alert('Please select an action first');
      return;
    }

    setIsLoading(true);
    try {
      let message = '';
      if (selectedAction === 'reminder') {
        message = customMessage || defaultReminderMessage;
        await onSendReminder(client, message);
      } else if (selectedAction === 'deadline') {
        message = customMessage || defaultDeadlineMessage;
        await onSendReminder(client, message);
      } else if (selectedAction === 'overdue') {
        message = customMessage || defaultOverdueMessage;
        await onSendReminder(client, message);
      } else if (selectedAction === 'claim') {
        await onClaimOwnership(client);
      }
    } catch (error) {
      console.error('Error performing action:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getOverdueText = () => {
    if (client?.days_overdue > 0) return `${client.days_overdue} day${client.days_overdue !== 1 ? 's' : ''} overdue`;
    if (client?.weeks_overdue > 0) return `${client.weeks_overdue} week${client.weeks_overdue !== 1 ? 's' : ''} overdue`;
    if (client?.daysLeft < 0) return `${Math.abs(client.daysLeft)} day${Math.abs(client.daysLeft) !== 1 ? 's' : ''} overdue`;
    return 'Overdue';
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header bg-primary text-white">
            <i className="fas fa-bolt text-danger me-2"></i>
            <h5 className="modal-title text-white">Take Action – {client?.client_name || client?.name}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {/* Loan Summary */}
            <div className="alert alert-info">
              <h6 className="alert-heading">Loan Summary</h6>
              <div className="row small">
                <div className="col-6"><strong>Client:</strong> {client?.client_name || client?.name}</div>
                <div className="col-6"><strong>Phone:</strong> {client?.phone}</div>
                <div className="col-6"><strong>Balance:</strong> KES {client?.balance?.toLocaleString()}</div>
                <div className="col-6">
                  <strong>Status:</strong>
                  <span className={`badge ${isOverdue ? 'bg-danger' : 'bg-warning'} ms-1`}>
                    {isOverdue ? getOverdueText() : 'Active'}
                  </span>
                </div>
                {dueDate && (
                  <div className="col-12 mt-2">
                    <small><strong>14‑day deadline:</strong> {dueDate.toLocaleDateString('en-KE')}</small>
                    {isPastDue && <span className="badge bg-danger ms-2">Passed</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Action Selection */}
            <div className="mb-4">
              <label className="form-label fw-bold">Select Action:</label>

              {/* 1. Regular Reminder (always available) */}
              <div className="form-check mb-2">
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
                  <strong>Send Regular Reminder</strong>
                  <small className="d-block text-muted">Polite reminder about the due loan</small>
                </label>
              </div>

              {/* 2. Deadline Reminder (only if active and NOT overdue) */}
              {isActive && !isOverdue && (
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="actionType"
                    id="sendDeadline"
                    value="deadline"
                    checked={selectedAction === 'deadline'}
                    onChange={(e) => setSelectedAction(e.target.value)}
                  />
                  <label className="form-check-label" htmlFor="sendDeadline">
                    <i className="fas fa-hourglass-half text-warning me-2"></i>
                    <strong>Send Deadline Reminder</strong>
                    <small className="d-block text-muted">Warn about 14‑day deadline & compulsory renewal</small>
                  </label>
                </div>
              )}

              {/* 3. Overdue Reminder (only if overdue) */}
              {isOverdue && (
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="actionType"
                    id="sendOverdue"
                    value="overdue"
                    checked={selectedAction === 'overdue'}
                    onChange={(e) => setSelectedAction(e.target.value)}
                  />
                  <label className="form-check-label" htmlFor="sendOverdue">
                    <i className="fas fa-exclamation-triangle text-danger me-2"></i>
                    <strong>Send Overdue Reminder</strong>
                    <small className="d-block text-muted">Inform client to clear balance OR sign renewal, else recovery</small>
                  </label>
                </div>
              )}

              {/* 4. Claim Ownership (only if overdue) */}
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
                    <small className="d-block text-muted">Take ownership of collateral (irreversible)</small>
                  </label>
                </div>
              )}
            </div>

            {/* Custom Message Textarea */}
            {(selectedAction === 'reminder' || selectedAction === 'deadline' || selectedAction === 'overdue') && (
              <div className="mb-3">
                <label className="form-label fw-bold">Customize Message:</label>
                <textarea
                  className="form-control"
                  rows="5"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={
                    selectedAction === 'reminder'
                      ? defaultReminderMessage
                      : selectedAction === 'deadline'
                      ? defaultDeadlineMessage
                      : defaultOverdueMessage
                  }
                />
                <small className="text-muted">
                  You can edit the message above. It will be pre‑filled in your SMS app.
                </small>
              </div>
            )}

            {/* Claim Ownership Warning */}
            {selectedAction === 'claim' && (
              <div className="alert alert-warning">
                <i className="fas fa-exclamation-triangle me-2"></i>
                <strong>Warning:</strong> This action will initiate the process to take ownership of the client's livestock. This will:
                <ul className="mt-2 mb-0">
                  <li>Mark the livestock as "Available Now" in the gallery</li>
                  <li>Remove the client from the client list</li>
                  <li>Close the loan permanently</li>
                </ul>
                This process cannot be undone.
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${selectedAction === 'claim' ? 'btn-warning' : 'btn-primary'}`}
              onClick={handleSend}
              disabled={!selectedAction || isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  Processing...
                </>
              ) : (
                <>
                  {selectedAction === 'reminder' && <i className="fas fa-paper-plane me-2"></i>}
                  {selectedAction === 'deadline' && <i className="fas fa-hourglass-half me-2"></i>}
                  {selectedAction === 'overdue' && <i className="fas fa-exclamation-triangle me-2"></i>}
                  {selectedAction === 'claim' && <i className="fas fa-gavel me-2"></i>}
                  {selectedAction === 'reminder' && 'Send Reminder'}
                  {selectedAction === 'deadline' && 'Send Deadline Reminder'}
                  {selectedAction === 'overdue' && 'Send Overdue Reminder'}
                  {selectedAction === 'claim' && 'Claim Ownership'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TakeActionModal;