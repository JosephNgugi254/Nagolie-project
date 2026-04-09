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
              Upon disbursement of the loan, legal ownership of the specified livestock transfers to Nagolie Enterprises Ltd,
              with the Recipient maintaining physical custody.
            </p>
            <p>The Recipient agrees to:</p>
            <ul>
              <li>Provide proper care and maintenance for the livestock</li>
              <li>Ensure the livestock are kept in good health</li>
              <li>Not sell, transfer, or dispose of the livestock without prior written consent from the Company</li>
              <li>Allow Company representatives access to inspect the livestock at reasonable times</li>
            </ul>

            <h4>2.1. Absolute Right of Claim Upon Default</h4>
            <p>
              In the event of default, the Company reserves the absolute right to claim, take possession of, and remove the
              collateral livestock without further notice. This right extends to claiming the livestock:
            </p>
            <ul>
              <li>In the presence OR absence of the Recipient</li>
              <li>In the presence OR absence of the Next of Kin or any family members</li>
              <li>Without requirement for additional consent or permission from any party</li>
            </ul>

            <h4>2.2. Immediate Action for Recovery</h4>
            <p>
              The Company shall not be delayed or hindered in its recovery efforts by the unavailability, resistance, or objections
              of the Recipient, Next of Kin, or any related parties. The Company's representatives, including livestock valuers and
              security personnel, are authorized to take immediate action to secure the Company's property and recover losses
              without legal impediment.
            </p>

            <h4>2.3. Consent to Recovery in the Event of Default</h4>
            <p>
              The Recipient acknowledges that they have read and fully understood the terms of this Agreement, particularly
              the rights of Nagolie Enterprises Ltd to recover the collateral livestock upon default. The Recipient voluntarily and
              irrevocably consents that in the event of default, Nagolie Enterprises Ltd and its authorized agents may
              immediately take possession of the collateral livestock without the need for a court order, further notice,
              or additional consent from any party. The Recipient hereby waives all rights to legally obstruct or delay such recovery.
              This consent is freely given, binding on the Recipient's heirs, successors, and assigns, and enforceable to the fullest
              extent permitted under the laws of Kenya.
            </p>
          </div>

          <div className="terms-section">
            <h3>3. Repayment Terms and Interest</h3>
            <p>The loan is repayable under one of the following plans selected by the Recipient at the time of disbursement:</p>

            <h4>Weekly Plan</h4>
            <p>
              The loan is repayable within seven (7) days from the date of disbursement with an interest of 30% (negotiable)
              of the disbursed funds. Interest shall be charged on a weekly basis for a maximum period of two (2) weeks.
              After two (2) weeks, if the loan is not fully repaid, no further interest will accrue. The Recipient must then either:
            </p>
            <ul>
              <li>repay the outstanding loan balance in full, or</li>
              <li>sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.</li>
            </ul>

            <h4>Daily Plan</h4>
            <p>
              The loan is repayable with an interest of 4.5% per day. Interest shall be charged daily for a maximum period of
              two (2) weeks. After two (2) weeks, if the loan is not fully repaid, no further interest will accrue.
              The Recipient must then either:
            </p>
            <ul>
              <li>repay the outstanding loan balance in full, or</li>
              <li>sign a compulsory Loan Renewal Agreement with the Company to extend the repayment period.</li>
            </ul>

            <p>
              Recognizing the circumstances of local communities, the CEO of Nagolie Enterprises Ltd may at their discretion
              grant an extension of the repayment period after consultation with the Recipient. Any extension must be agreed
              upon in writing by both parties, specifying the new repayment date.
            </p>
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
            <p>
              All livestock shall be valued by an authorized Livestock Valuer appointed by Nagolie Enterprises Ltd.
              The valuation shall be final and binding for determining the maximum loan amount.
            </p>
          </div>

          <div className="terms-section">
            <h3>6. Default and Remedies</h3>
            <p>
              Failure to repay the loan by the due date (including any agreed extension) shall constitute default, entitling
              Nagolie Enterprises Ltd to:
            </p>
            <ul>
              <li>Charge compounded interest on the outstanding amount after every seven (7) days until full repayment</li>
              <li>Take immediate possession of the livestock in holding for 48 hours to allow the Recipient to repay or sign a renewal agreement</li>
              <li>Sell the livestock to recover the outstanding loan amount if payment is not made within the 48-hour holding period</li>
              <li>Initiate legal proceedings for recovery of any remaining balance</li>
              <li>Charge interest on overdue amounts at the prevailing market rate</li>
            </ul>
          </div>

          <div className="terms-section">
            <h3>7. Governing Law</h3>
            <p>
              This agreement shall be governed by and construed in accordance with the laws of Kenya.
              Any disputes arising from this agreement shall be subject to the exclusive jurisdiction of the courts of Kenya.
            </p>
          </div>

          <div className="terms-section">
            <h3>8. Entire Agreement</h3>
            <p>
              This document constitutes the entire agreement between the parties and supersedes all prior discussions,
              negotiations, and agreements. No modification of this agreement shall be effective unless in writing and
              signed by both parties.
            </p>
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