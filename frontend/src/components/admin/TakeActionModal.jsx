import { useState } from 'react';

function TakeActionModal({ client, onClose, onSendReminder, onClaimOwnership }) {
  const [selectedAction, setSelectedAction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  // Determine if client is overdue (for showing claim option)
  const isOverdue = client?.days_overdue > 0 || client?.daysLeft < 0;

  // Default reminder message
  const defaultReminderMessage = `Hello ${client?.client_name || client?.name}, this is a reminder from Nagolie Enterprises that your loan of KES ${client?.balance?.toLocaleString()} is due. Please make your payment to avoid additional charges. Thank you.`;

  const handleSendReminder = async () => {
    if (!selectedAction) {
      alert('Please select an action first');
      return;
    }

    setIsLoading(true);
    try {
      if (selectedAction === 'reminder') {
        const message = customMessage || defaultReminderMessage;
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

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">Take Action - {client?.client_name || client?.name}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          
          <div className="modal-body">
            {/* Loan Summary */}
            <div className="alert alert-info">
              <h6 className="alert-heading">Loan Summary</h6>
              <div className="row small">
                <div className="col-6">
                  <strong>Client:</strong> {client?.client_name || client?.name}
                </div>
                <div className="col-6">
                  <strong>Phone:</strong> {client?.phone}
                </div>
                <div className="col-6">
                  <strong>Balance:</strong> KES {client?.balance?.toLocaleString()}
                </div>
                <div className="col-6">
                  <strong>Status:</strong> 
                  <span className={`badge ${isOverdue ? 'bg-danger' : 'bg-warning'} ms-1`}>
                    {isOverdue ? `${client.days_overdue || Math.abs(client.daysLeft)} days overdue` : 'Due today'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Selection */}
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
                  <small className="d-block text-muted">
                    Send a polite reminder about the due loan with balance details
                  </small>
                </label>
              </div>

              {/* Only show claim option for overdue clients */}
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
                    <small className="d-block text-muted">
                      Initiate process to take ownership of the collateral livestock
                    </small>
                  </label>
                </div>
              )}
            </div>

            {/* Custom Message for Reminder */}
            {selectedAction === 'reminder' && (
              <div className="mb-3">
                <label className="form-label fw-bold">Customize Message:</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={defaultReminderMessage}
                />
                <small className="text-muted">
                  Character count: {customMessage.length || defaultReminderMessage.length}
                </small>
              </div>
            )}

            {/* Claim Ownership Warning */}
            {selectedAction === 'claim' && (
              <div className="alert alert-warning">
                <i className="fas fa-exclamation-triangle me-2"></i>
                <strong>Warning:</strong> This action will initiate the process to take ownership 
                of the client's livestock. This will:
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
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className={`btn ${
                selectedAction === 'claim' ? 'btn-warning' : 'btn-primary'
              }`}
              onClick={handleSendReminder}
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
                  {selectedAction === 'claim' && <i className="fas fa-gavel me-2"></i>}
                  {selectedAction === 'reminder' ? 'Send Reminder' : 'Claim Ownership'}
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