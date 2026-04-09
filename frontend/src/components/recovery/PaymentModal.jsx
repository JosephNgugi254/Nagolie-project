// components/recovery/PaymentModal.jsx
// Synced with admin panel via recoveryAPI.processPayment → same backend logic.

import { useState } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';

function PaymentModal({ loan, onClose, onSuccess }) {
  const [paymentType,   setPaymentType]   = useState('principal');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amount,        setAmount]        = useState('');
  const [mpesaRef,      setMpesaRef]      = useState('');
  const [notes,         setNotes]         = useState('');
  const [processing,    setProcessing]    = useState(false);

  const fmt = (v) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(Number(v) || 0);

  const currentPrincipal = Number(loan.current_principal ?? loan.principal_amount ?? 0);
  const accruedInterest  = Number(loan.accrued_interest ?? 0);
  const interestPaid     = Number(loan.interest_paid    ?? 0);
  const unpaidInterest   = Math.max(0, accruedInterest - interestPaid);
  const isWeekly         = loan.repayment_plan === 'weekly';

  // Max amount depends on payment type + plan
  const maxAmount = paymentType === 'principal'
    ? currentPrincipal
    : isWeekly
      ? currentPrincipal   // weekly: interest payment reduces principal
      : unpaidInterest;    // daily : interest payment clears accrued balance

  const balance = isWeekly
    ? currentPrincipal                   // weekly: balance IS current_principal
    : currentPrincipal + unpaidInterest; // daily : principal + unpaid interest

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payAmt = parseFloat(amount);
    if (!amount || isNaN(payAmt) || payAmt <= 0) {
      showToast.error('Please enter a valid amount'); return;
    }
    if (payAmt > maxAmount + 0.01) {
      showToast.error(`Amount cannot exceed ${fmt(maxAmount)}`); return;
    }
    if (paymentMethod === 'mpesa' && !mpesaRef.trim()) {
      showToast.error('Please enter M-Pesa reference'); return;
    }

    setProcessing(true);
    try {
      const res = await recoveryAPI.processPayment(loan.id, {
        amount:           payAmt,
        payment_type:     paymentType,
        payment_method:   paymentMethod,
        mpesa_reference:  paymentMethod === 'mpesa' ? mpesaRef.toUpperCase().trim() : '',
        notes:            notes || undefined,
      });

      if (res.data.success) {
        const ld = res.data.loan;
        showToast.success(
          `${paymentType === 'principal' ? 'Principal' : 'Interest'} payment of ${fmt(payAmt)} processed!\n` +
          `Principal remaining: ${fmt(ld.current_principal)}` +
          (isWeekly ? '' : ` | Interest remaining: ${fmt(ld.unpaid_interest)}`) +
          ` | Balance: ${fmt(ld.balance)}`
        );
        onSuccess();
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1"
         style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">

          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="fas fa-money-bill-wave me-2"></i>
              Process Payment – {loan.name}
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">

              {/* ── Loan summary ── */}
              <div className="alert alert-info py-2 mb-3">
                <div className="row text-center">
                  <div className="col-4">
                    <small className="text-muted d-block">Current Principal</small>
                    <strong>{fmt(currentPrincipal)}</strong>
                  </div>
                  {!isWeekly && (
                    <div className="col-4">
                      <small className="text-muted d-block">Unpaid Interest</small>
                      <strong className="text-danger">{fmt(unpaidInterest)}</strong>
                    </div>
                  )}
                  <div className={isWeekly ? 'col-8' : 'col-4'}>
                    <small className="text-muted d-block">Total Balance</small>
                    <strong className="text-danger">{fmt(balance)}</strong>
                  </div>
                </div>
                {isWeekly && (
                  <div className="text-center mt-1">
                    <small className="text-muted">
                      Weekly plan – interest is compounded into the principal each week
                    </small>
                  </div>
                )}
              </div>

              {/* ── Payment type ── */}
              <div className="mb-3">
                <label className="form-label fw-bold">Payment Type</label>
                <div className="d-flex gap-4">
                  <div className="form-check">
                    <input className="form-check-input" type="radio" id="ptPrincipal"
                           checked={paymentType === 'principal'}
                           onChange={() => { setPaymentType('principal'); setAmount(''); }} />
                    <label className="form-check-label" htmlFor="ptPrincipal">
                      Principal <small className="text-muted">(max {fmt(currentPrincipal)})</small>
                    </label>
                  </div>
                  <div className="form-check">
                    <input className="form-check-input" type="radio" id="ptInterest"
                           checked={paymentType === 'interest'}
                           onChange={() => { setPaymentType('interest'); setAmount(''); }} />
                    <label className="form-check-label" htmlFor="ptInterest">
                      Interest&nbsp;
                      <small className="text-muted">
                        (max {fmt(isWeekly ? currentPrincipal : unpaidInterest)})
                      </small>
                    </label>
                  </div>
                </div>
                {paymentType === 'interest' && isWeekly && (
                  <div className="alert alert-warning py-1 mt-2 mb-0">
                    <small>
                      <i className="fas fa-info-circle me-1"></i>
                      Weekly compound plan: interest has been folded into the principal.
                      An "interest payment" here directly reduces the principal balance.
                    </small>
                  </div>
                )}
                {paymentType === 'interest' && !isWeekly && (
                  <div className="alert alert-info py-1 mt-2 mb-0">
                    <small>
                      <i className="fas fa-info-circle me-1"></i>
                      Daily plan: pays down the accrued interest balance.
                      Max: {fmt(unpaidInterest)}
                    </small>
                  </div>
                )}
              </div>

              {/* ── Payment method ── */}
              <div className="mb-3">
                <label className="form-label fw-bold">Payment Method</label>
                <select className="form-select" value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa (Manual Reference)</option>
                </select>
              </div>

              {paymentMethod === 'mpesa' && (
                <div className="mb-3">
                  <label className="form-label">M-Pesa Reference *</label>
                  <input type="text" className="form-control"
                         value={mpesaRef} onChange={(e) => setMpesaRef(e.target.value)}
                         placeholder="e.g. RB64AX25B1"
                         style={{ textTransform: 'uppercase' }} required />
                </div>
              )}

              {/* ── Amount ── */}
              <div className="mb-3">
                <label className="form-label fw-bold">
                  Amount (KSh) <span className="text-danger">*</span>
                </label>
                <input type="number" className="form-control"
                       value={amount} onChange={(e) => setAmount(e.target.value)}
                       min="1" max={maxAmount} step="0.01"
                       placeholder={`Max: ${fmt(maxAmount)}`} required />
                <small className="text-muted">Maximum: {fmt(maxAmount)}</small>
              </div>

              {/* ── Notes ── */}
              <div className="mb-3">
                <label className="form-label">Notes (optional)</label>
                <textarea className="form-control" rows="2"
                          value={notes} onChange={(e) => setNotes(e.target.value)}
                          placeholder="Additional notes..." />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary"
                      onClick={onClose} disabled={processing}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={processing}>
                {processing
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
                  : <><i className="fas fa-check me-2"></i>Process Payment</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PaymentModal;