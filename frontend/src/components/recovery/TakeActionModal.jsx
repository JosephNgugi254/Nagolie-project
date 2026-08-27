// components/recovery/TakeActionModal.jsx
import { useState, useEffect } from 'react';
import { showToast } from '../common/Toast';

function TakeActionModal({ loan, onClose, onSendReminder, onClaimOwnership }) {
  const [selectedAction, setSelectedAction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  const client = loan;

  const disbursementDate = client?.disbursement_date ? new Date(client.disbursement_date) : null;
  const dueDate = disbursementDate ? new Date(disbursementDate.getTime() + 14 * 24 * 60 * 60 * 1000) : null;
  const today = new Date();
  const isPastDue = dueDate ? today > dueDate : false;

  const isOverdue =
    (client?.overdue_days > 0) ||
    (client?.overdue_weeks > 0) ||
    (client?.days_left < 0);

  const isActive = true;

  const defaultReminderMessage = `Hello ${client?.name}, this is a reminder from Nagolie Enterprises Ltd that your loan is due.
• Principal owed: KES ${client?.current_principal?.toLocaleString()}
• Interest owed: KES ${client?.accrued_interest?.toLocaleString()}
• Total balance: KES ${(client?.current_principal + client?.accrued_interest)?.toLocaleString()}
Please make your payment to avoid additional charges.

Paybill: 247247, Account: 262636
Thank you.`;

  const defaultDeadlineMessage = (() => {
    const name = client?.name;
    const totalBalance = (client?.current_principal || 0) + (client?.accrued_interest || 0);
    const dueDateStr = dueDate ? dueDate.toLocaleDateString('en-KE') : 'the due date';
    return `Hello ${name}, your loan is approaching the 14‑day deadline (${dueDateStr}). You are expected to clear the total outstanding balance of KES ${totalBalance.toLocaleString()} by that date. Please visit our office to sign a compulsory loan renewal agreement if you will not have completed the balance, failure to which recovery will take place.

Make your payment via Paybill: 247247, Account: 262636. Thank you.`;
  })();

  // NEW: Compounding Notice – replaces overdue reminder
  const defaultCompoundingMessage = (() => {
    const name = client?.name;
    const principal = client?.current_principal || 0;
    const periodInterest = client?.interest || 0; // periodic interest for the new week
    const unpaid = client?.accrued_interest || 0;
    const total = principal + unpaid;
    const plan = client?.repayment_plan === 'daily' ? '7‑day period' : 'week';
    return `Dear ${name},

Your loan has entered a new ${plan}. As per the agreement, any unpaid interest from the previous period has been added to your principal.

New current principal: KES ${principal.toLocaleString()}
New period interest: KES ${periodInterest.toLocaleString()}
Total balance: KES ${total.toLocaleString()}

Please ensure you make timely payments to avoid additional charges.

Paybill: 247247, Account: 262636
Thank you.`;
  })();

  const defaultWarningMessage = (() => {
    const name = client?.name;
    const principal = client?.current_principal || 0;
    const interest = client?.accrued_interest || 0;
    const total = principal + interest;
    const dueDateStr = dueDate ? dueDate.toLocaleDateString('en-KE') : 'the due date';
    const dayOfWeek = dueDate ? dueDate.toLocaleDateString('en-KE', { weekday: 'long' }) : '';
    return `Dear ${name},

This is to remind you that your loan of KES ${total.toLocaleString()} is due on ${dueDateStr} (${dayOfWeek}).

Outstanding amounts:
• Principal: KES ${principal.toLocaleString()}
• Accrued Interest: KES ${interest.toLocaleString()}
• Total: KES ${total.toLocaleString()}

Please clear the balance before the due date to avoid your account being forwarded to the recovery department as per the loan agreement terms.

Paybill: 247247, Account: 262636
Thank you.`;
  })();

  const defaultForwardMessage = (() => {
    const name = client?.name;
    const principal = client?.current_principal || 0;
    const interest = client?.accrued_interest || 0;
    const total = principal + interest;
    return `Dear ${name},

This is to inform you that your loan has been forwarded to the recovery department due to non‑payment.

Outstanding amounts:
• Principal: KES ${principal.toLocaleString()}
• Accrued Interest: KES ${interest.toLocaleString()}
• Total: KES ${total.toLocaleString()}

The recovery department will contact you shortly. Please make arrangements to settle the debt to avoid further action.

Paybill: 247247, Account: 262636
Thank you.`;
  })();

  // Auto‑fill message when action changes
  useEffect(() => {
    if (selectedAction === 'reminder') {
      setCustomMessage(defaultReminderMessage);
    } else if (selectedAction === 'deadline') {
      setCustomMessage(defaultDeadlineMessage);
    } else if (selectedAction === 'compounding') {
      setCustomMessage(defaultCompoundingMessage);
    } else if (selectedAction === 'warning') {
      setCustomMessage(defaultWarningMessage);
    } else if (selectedAction === 'forward') {
      setCustomMessage(defaultForwardMessage);
    }
  }, [selectedAction]);

  const handleSend = async () => {
    if (!selectedAction) {
      showToast.warning('Please select an action first');
      return;
    }

    setIsLoading(true);
    try {
      const message = customMessage;
      if (selectedAction === 'reminder' || selectedAction === 'deadline' || selectedAction === 'compounding' || selectedAction === 'warning' || selectedAction === 'forward') {
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
    if (client?.overdue_days > 0) return `${client.overdue_days} day${client.overdue_days !== 1 ? 's' : ''} overdue`;
    if (client?.overdue_weeks > 0) return `${client.overdue_weeks} week${client.overdue_weeks !== 1 ? 's' : ''} overdue`;
    if (client?.days_left < 0) return `${Math.abs(client.days_left)} day${Math.abs(client.days_left) !== 1 ? 's' : ''} overdue`;
    return 'Overdue';
  };

  const copyMessage = () => {
    if (!selectedAction) {
      showToast.warning('Please select an action first');
      return;
    }
    navigator.clipboard.writeText(customMessage).then(() => {
      showToast.success('Message copied to clipboard!');
    }).catch(() => {
      showToast.error('Failed to copy message');
    });
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header bg-primary text-white">
            <i className="fas fa-bolt text-danger me-2"></i>
            <h5 className="modal-title text-white">Take Action – {client?.name}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {/* Loan Summary */}
            <div className="alert alert-info">
              <h6 className="alert-heading">Loan Summary</h6>
              <div className="row small">
                <div className="col-6"><strong>Client:</strong> {client?.name}</div>
                <div className="col-6"><strong>Phone:</strong> {client?.contacts}</div>
                <div className="col-6"><strong>Principal owed:</strong> KES {client?.current_principal?.toLocaleString()}</div>
                <div className="col-6"><strong>Interest owed:</strong> KES {client?.accrued_interest?.toLocaleString()}</div>
                <div className="col-6"><strong>Total balance:</strong> KES {(client?.current_principal + client?.accrued_interest)?.toLocaleString()}</div>
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

              {/* NEW Compounding Notice – always available */}
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="radio"
                  name="actionType"
                  id="sendCompounding"
                  value="compounding"
                  checked={selectedAction === 'compounding'}
                  onChange={(e) => setSelectedAction(e.target.value)}
                />
                <label className="form-check-label" htmlFor="sendCompounding">
                  <i className="fas fa-sync-alt text-info me-2"></i>
                  <strong>Send Compounding Notice</strong>
                  <small className="d-block text-muted">Inform client of new week compounding and updated balances</small>
                </label>
              </div>

              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="radio"
                  name="actionType"
                  id="sendWarning"
                  value="warning"
                  checked={selectedAction === 'warning'}
                  onChange={(e) => setSelectedAction(e.target.value)}
                />
                <label className="form-check-label" htmlFor="sendWarning">
                  <i className="fas fa-clock text-warning me-2"></i>
                  <strong>Send Flagging Warning</strong>
                  <small className="d-block text-muted">Inform client of exact due date and consequences of non‑payment</small>
                </label>
              </div>

              {isOverdue && (
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="actionType"
                    id="sendForward"
                    value="forward"
                    checked={selectedAction === 'forward'}
                    onChange={(e) => setSelectedAction(e.target.value)}
                  />
                  <label className="form-check-label" htmlFor="sendForward">
                    <i className="fas fa-arrow-right text-danger me-2"></i>
                    <strong>Send Forwarded to Recovery</strong>
                    <small className="d-block text-muted">Formal notice that the loan has been escalated to recovery dept.</small>
                  </label>
                </div>
              )}

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

            {/* Message Textarea with Copy Button */}
            {(selectedAction === 'reminder' || selectedAction === 'deadline' || selectedAction === 'compounding' || selectedAction === 'warning' || selectedAction === 'forward') && (
              <div className="mb-3">
                <label className="form-label fw-bold">Message:</label>
                <div className="input-group">
                  <textarea
                    className="form-control"
                    rows="6"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Select an action above to see the default message"
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={copyMessage}
                    title="Copy message to clipboard"
                  >
                    <i className="fas fa-copy"></i>
                  </button>
                </div>
                <small className="text-muted">You can edit the message above. Click the copy button to copy the current text.</small>
              </div>
            )}

            {selectedAction === 'claim' && (
              <div className="alert alert-warning">
                <i className="fas fa-exclamation-triangle me-2"></i>
                <strong>Warning:</strong> This action will permanently close the loan and move the livestock to the gallery. This cannot be undone.
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
            <button
              className={`btn ${selectedAction === 'claim' ? 'btn-warning' : 'btn-primary'}`}
              onClick={handleSend}
              disabled={!selectedAction || isLoading}
            >
              {isLoading ? (
                <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
              ) : (
                <>
                  {selectedAction === 'reminder' && <i className="fas fa-paper-plane me-2"></i>}
                  {selectedAction === 'deadline' && <i className="fas fa-hourglass-half me-2"></i>}
                  {selectedAction === 'compounding' && <i className="fas fa-sync-alt me-2"></i>}
                  {selectedAction === 'warning' && <i className="fas fa-clock me-2"></i>}
                  {selectedAction === 'forward' && <i className="fas fa-arrow-right me-2"></i>}
                  {selectedAction === 'claim' && <i className="fas fa-gavel me-2"></i>}
                  {selectedAction === 'reminder' && 'Send Reminder'}
                  {selectedAction === 'deadline' && 'Send Deadline Reminder'}
                  {selectedAction === 'compounding' && 'Send Compounding Notice'}
                  {selectedAction === 'warning' && 'Send Flagging Warning'}
                  {selectedAction === 'forward' && 'Send Forwarded to Recovery'}
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