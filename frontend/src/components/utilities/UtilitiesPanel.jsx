// components/utilities/UtilitiesPanel.jsx
import { useState, useCallback } from 'react';
import { showToast } from '../common/Toast';
import {
  generateManualLoanAgreementPDF,
  generateManualNextOfKinConsentPDF,
  generateManualLoanRenewalAgreementPDF,
  generateManualLoanWaiverAgreementPDF,   // <-- ADD THIS
  generateLetterPDF,
  downloadLetterPDF,
  generateInvoicePDF,
} from '../admin/ReceiptPDF';
import { useAuth } from '../../context/AuthContext';
import LetterWriter from './LetterWriter';
import InvoiceGenerator from './InvoiceGenerator';

const UtilitiesPanel = ({ userRole, restrictedMode = false }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('forms');

  // Allow accountant and valuer as well (for Recovery Module)
  const canAccessFull = ['admin', 'secretary', 'director', 'head_of_it', 'accountant', 'valuer'].includes(userRole);
  const canAccessManualForms = true; // always
  const canAccessLetter = canAccessFull;
  const canAccessInvoice = canAccessFull;

  const handleDownloadForm = async (formType) => {
    try {
      switch (formType) {
        case 'loan':
          await generateManualLoanAgreementPDF();
          break;
        case 'nextOfKin':
          await generateManualNextOfKinConsentPDF();
          break;
        case 'renewal':
          await generateManualLoanRenewalAgreementPDF();
          break;
        case 'waiver':                       // <-- ADD THIS CASE
          await generateManualLoanWaiverAgreementPDF();
          break;
        default:
          return;
      }
      showToast.success(`${formType} form downloaded!`);
    } catch (error) {
      console.error(error);
      showToast.error(`Failed to download ${formType} form`);
    }
  };

  return (
    <div className="utilities-panel">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white">
          <h4 className="mb-0">📄 Utilities</h4>
        </div>
        <div className="card-body">
          {/* Tabs */}
          <ul className="nav nav-tabs mb-4">
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'forms' ? 'active' : ''}`}
                onClick={() => setActiveTab('forms')}
              >
                <i className="fas fa-file-pdf me-2"></i>Manual Forms
              </button>
            </li>
            {canAccessLetter && (
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'letter' ? 'active' : ''}`}
                  onClick={() => setActiveTab('letter')}
                >
                  <i className="fas fa-pen-fancy me-2"></i>Letter Writer
                </button>
              </li>
            )}
            {canAccessInvoice && (
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'invoice' ? 'active' : ''}`}
                  onClick={() => setActiveTab('invoice')}
                >
                  <i className="fas fa-receipt me-2"></i>Invoice Generator
                </button>
              </li>
            )}
          </ul>

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === 'forms' && (
              <div className="row g-4">
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-primary">
                    <div className="card-body text-center">
                      <i className="fas fa-file-signature fa-3x text-primary mb-3"></i>
                      <h5>Loan Agreement</h5>
                      <p className="text-muted">Manual loan agreement form for loan applications</p>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleDownloadForm('loan')}
                      >
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-warning">
                    <div className="card-body text-center">
                      <i className="fas fa-user-friends fa-3x text-warning mb-3"></i>
                      <h5>Next of Kin Consent</h5>
                      <p className="text-muted">Manual next of kin consent form for clients' next of kin</p>
                      <button
                        className="btn btn-warning"
                        onClick={() => handleDownloadForm('nextOfKin')}
                      >
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-success">
                    <div className="card-body text-center">
                      <i className="fas fa-sync-alt fa-3x text-success mb-3"></i>
                      <h5>Loan Renewal Agreement</h5>
                      <p className="text-muted">Manual loan renewal form for overdue loans</p>
                      <button
                        className="btn btn-success"
                        onClick={() => handleDownloadForm('renewal')}
                      >
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                {/* NEW: Loan Waiver Agreement card */}
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-info">
                    <div className="card-body text-center">
                      <i className="fas fa-hand-holding-heart fa-3x text-info mb-3"></i>
                      <h5>Loan Waiver Agreement</h5>
                      <p className="text-muted">Manual waiver form for loans waived</p>
                      <button
                        className="btn btn-info text-white"
                        onClick={() => handleDownloadForm('waiver')}
                      >
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'letter' && canAccessLetter && (
              <LetterWriter userRole={user} />
            )}

            {activeTab === 'invoice' && canAccessInvoice && (
              <InvoiceGenerator />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UtilitiesPanel;