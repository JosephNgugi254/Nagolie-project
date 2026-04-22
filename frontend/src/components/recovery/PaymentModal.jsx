// components/recovery/PaymentModal.jsx
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
  const periodicInterest = Number(loan.interest ?? 0);
  const unpaidInterest   = Number(loan.accrued_interest ?? 0);
  const isWeekly         = loan.repayment_plan === 'weekly';

  const currentPeriodInterest = Number(loan.current_period_interest ?? periodicInterest);
  const periodPrepaid         = Number(loan.period_interest_prepaid ?? 0);
  const periodFullyPaid       = loan.period_interest_fully_paid === true;

  const maxPrincipal = currentPrincipal;

  // ✅ FIXED: correct maxInterest for weekly plans
  let maxInterest;
  if (periodFullyPaid) {
    maxInterest = 0;
  } else if (periodPrepaid > 0) {
    maxInterest = Math.max(0, currentPeriodInterest - periodPrepaid);
  } else if (unpaidInterest > 0.01) {
    // For weekly: allow unpaid + current period interest
    // For daily: only unpaid interest
    maxInterest = isWeekly ? unpaidInterest + currentPeriodInterest : unpaidInterest;
  } else {
    maxInterest = currentPeriodInterest;
  }

  let totalBalance;
  if (isWeekly) {
    const owedInterest = periodFullyPaid ? 0 : Math.max(0, currentPeriodInterest - periodPrepaid);
    totalBalance = currentPrincipal + owedInterest;
  } else {
    totalBalance = currentPrincipal + unpaidInterest;
  }

  const currentMax = paymentType === 'principal' ? maxPrincipal : maxInterest;

  const getInterestInfo = () => {
    if (periodFullyPaid) {
      return {
        type: 'warning',
        message: `Interest for this ${isWeekly ? 'week' : 'period'} has already been paid in full.`,
        detail: `Pre‑paid amount: ${fmt(periodPrepaid)}`
      };
    }
    if (periodPrepaid > 0) {
      return {
        type: 'info',
        message: `Partial interest pre‑paid: ${fmt(periodPrepaid)}`,
        detail: `Remaining for this period: ${fmt(maxInterest)}`
      };
    }
    if (paymentType === 'interest' && !periodFullyPaid && unpaidInterest < 0.01) {
      return {
        type: 'info',
        message: `Pre‑period interest payment`,
        detail: `The current ${isWeekly ? 'week' : 'day'} hasn't ended yet. You can pay the interest early – it will be recorded and applied when the period ends. This period's interest: ${fmt(currentPeriodInterest)}`
      };
    }
    return null;
  };

  const interestInfo = getInterestInfo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payAmt = parseFloat(amount);
    if (!amount || isNaN(payAmt) || payAmt <= 0) {
      showToast.error('Please enter a valid amount');
      return;
    }
    if (payAmt > currentMax + 0.01) {
      showToast.error(`Amount cannot exceed ${fmt(currentMax)}`);
      return;
    }
    if (paymentMethod === 'mpesa' && !mpesaRef.trim()) {
      showToast.error('Please enter M-Pesa reference');
      return;
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
            <h5 className="modal-title text-white">
              <i className="fas fa-money-bill-wave me-2 text-white"></i>
              Process Payment
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {/* Loan summary */}
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
                    <strong className="text-danger">{fmt(totalBalance)}</strong>
                  </div>
                </div>
                {isWeekly && (
                  <div className="text-center mt-1">
                    <small className="text-muted">
                      Weekly plan – interest is 30% of principal. You may pay the weekly interest early.
                    </small>
                  </div>
                )}
              </div>

              {interestInfo && (
                <div className={`alert alert-${interestInfo.type} py-2 mb-3`}>
                  <i className={`fas fa-${interestInfo.type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2`}></i>
                  <strong>{interestInfo.message}</strong>
                  {interestInfo.detail && (
                    <>
                      <br />
                      <small>{interestInfo.detail}</small>
                    </>
                  )}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fw-bold">Payment Type</label>
                <div className="d-flex gap-4">
                  <div className="form-check">
                    <input className="form-check-input" type="radio" id="ptPrincipal"
                           checked={paymentType === 'principal'}
                           onChange={() => { setPaymentType('principal'); setAmount(''); }} />
                    <label className="form-check-label" htmlFor="ptPrincipal">
                      Principal <small className="text-muted">(max {fmt(maxPrincipal)})</small>
                    </label>
                  </div>
                  <div className="form-check">
                    <input className="form-check-input" type="radio" id="ptInterest"
                           checked={paymentType === 'interest'}
                           onChange={() => { setPaymentType('interest'); setAmount(''); }} />
                    <label className="form-check-label" htmlFor="ptInterest">
                      Interest&nbsp;
                      <small className="text-muted">
                        (max {fmt(maxInterest)})
                      </small>
                    </label>
                  </div>
                </div>
                {paymentType === 'interest' && isWeekly && (
                  <div className="alert alert-warning py-1 mt-2 mb-0">
                    <small>
                      <i className="fas fa-info-circle me-1"></i>
                      Paying the weekly interest early will be recorded and applied when the week ends.
                      The principal will not be reduced immediately.
                    </small>
                  </div>
                )}
              </div>

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

              <div className="mb-3">
                <label className="form-label fw-bold">
                  Amount (KSh) <span className="text-danger">*</span>
                </label>
                <input type="number" className="form-control"
                       value={amount} onChange={(e) => setAmount(e.target.value)}
                       min="1" max={currentMax} step="0.01"
                       placeholder={`Max: ${fmt(currentMax)}`}
                       disabled={paymentType === 'interest' && maxInterest === 0}
                       required />
                <small className="text-muted">Maximum: {fmt(currentMax)}</small>
              </div>

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