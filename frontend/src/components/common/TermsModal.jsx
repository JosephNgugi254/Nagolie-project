"use client"

import { useEffect } from "react"

function TermsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }

    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h2 className="popup-title">Terms and Conditions</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="terms-content">
          <div className="terms-section">
            <h3>1. Agreement Overview</h3>
            <p>
              This Livestock Financing Agreement ("Agreement") is entered into between the applicant ("Recipient") and
              Nagolie Enterprises Ltd ("Company").
            </p>
            <p>
              The Recipient acknowledges receipt of a loan from Nagolie Enterprises Ltd, secured by the specified
              livestock, which shall become the property of Nagolie Enterprises Ltd until the loan is fully repaid.
            </p>
          </div>

          <div className="terms-section">
            <h3>2. Ownership Transfer and Custody</h3>
            <p>
              Upon disbursement of the loan, legal ownership of the specified livestock transfers to Nagolie Enterprises
              Ltd, with the Recipient maintaining physical custody.
            </p>
            <p>The Recipient agrees to:</p>
            <ul>
              <li>Provide proper care and maintenance for the livestock</li>
              <li>Ensure the livestock are kept in good health</li>
              <li>Not sell, transfer, or dispose of the livestock without prior written consent from the Company</li>
              <li>Allow Company representatives access to inspect the livestock at reasonable times</li>
            </ul>
          </div>

          <div className="terms-section">
            <h3>3. Repayment Terms</h3>
            <p>The loan is typically repayable within seven (7) days from the date of disbursement.</p>
            <p>
              However, recognizing the circumstances of local communities, the CEO of Nagolie Enterprises Ltd may, at
              their discretion, grant an extension of the repayment period after consultation with the Recipient.
            </p>
            <p>Any extension must be agreed upon in writing by both parties, specifying the new repayment date.</p>
          </div>

          <div className="terms-section">
            <h3>4. Loan Settlement and Ownership Return</h3>
            <p>Upon full repayment of the loan principal plus agreed interest:</p>
            <ul>
              <li>Legal ownership of the livestock reverts to the Recipient</li>
              <li>All rights and responsibilities regarding the livestock return to the Recipient</li>
            </ul>
          </div>

          <div className="terms-section">
            <h3>5. Livestock Valuation</h3>
            <p>All livestock shall be valued by an authorized Livestock Valuer appointed by Nagolie Enterprises Ltd.</p>
            <p>The valuation shall be final and binding for determining the maximum loan amount.</p>
          </div>

          <div className="terms-section">
            <h3>6. Default and Remedies</h3>
            <p>
              Failure to repay the loan by the due date (including any agreed extension) shall constitute default,
              entitling Nagolie Enterprises Ltd to:
            </p>
            <ul>
              <li>Take immediate possession of the livestock</li>
              <li>Sell the livestock to recover the outstanding loan amount</li>
              <li>Initiate legal proceedings for recovery of any remaining balance</li>
              <li>Charge interest on overdue amounts at the prevailing market rate</li>
            </ul>
          </div>

          <div className="terms-section">
            <h3>7. Governing Law</h3>
            <p>This agreement shall be governed by and construed in accordance with the laws of Kenya.</p>
            <p>
              Any disputes arising from this agreement shall be subject to the exclusive jurisdiction of the courts of
              Kajiado County.
            </p>
          </div>

          <div className="terms-section">
            <h3>8. Entire Agreement</h3>
            <p>
              This document constitutes the entire agreement between the parties and supersedes all prior discussions,
              negotiations, and agreements.
            </p>
            <p>No modification of this agreement shall be effective unless in writing and signed by both parties.</p>
          </div>
        </div>
        <div className="popup-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default TermsModal
