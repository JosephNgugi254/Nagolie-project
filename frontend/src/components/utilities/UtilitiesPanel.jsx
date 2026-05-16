// components/utilities/UtilitiesPanel.jsx
import { useState, useCallback } from 'react';
import { showToast } from '../common/Toast';
import {
  generateManualLoanAgreementPDF,
  generateManualNextOfKinConsentPDF,
  generateManualLoanRenewalAgreementPDF,
  generateManualLoanWaiverAgreementPDF,   
  generateLetterPDF,
  downloadLetterPDF,
  generateInvoicePDF,
  generateLeaveRequestPDF,
  generateManualLeaveRequestPDF,
  generateManualInvoicePDF,               
  generateManualDeliveryNotePDF 
} from '../admin/ReceiptPDF';
import { generateSecretaryContractPDF } from '../admin/ReceiptPDF';
import { useAuth } from '../../context/AuthContext';
import LetterWriter from './LetterWriter';
import InvoiceGenerator from './InvoiceGenerator';
import LeaveRequestWriter from './LeaveRequestWriter';
import DocumentGenerator from './DocumentGenerator';
import DeliveryNoteGenerator from './DeliveryNoteGenerator'; 


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
        case 'waiver':                       
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
            {canAccessLetter && (
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'document' ? 'active' : ''}`}
                  onClick={() => setActiveTab('document')}
                >
                  <i className="fas fa-file-alt me-2"></i>Document Generator
                </button>
              </li>
            )}
            {canAccessInvoice && (  // or canAccessFull – your decision
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'delivery' ? 'active' : ''}`}
                  onClick={() => setActiveTab('delivery')}
                >
                  <i className="fas fa-truck me-2"></i>Delivery Note
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
            {canAccessFull && (
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'leave' ? 'active' : ''}`}
                  onClick={() => setActiveTab('leave')}
                >
                  <i className="fas fa-calendar-alt me-2"></i>Leave Request
                </button>
              </li>
            )}

          </ul>

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === 'forms' && (
              <div className="row g-4">
                {/* manual loan agreement form */}
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
                {/* manual loan renewal agreement form */}
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
                {/* manual next of kin consent form */}
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
                {/* manual loan waiver agreement form */}
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
                {/* manual invoice */}
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-primary">
                    <div className="card-body text-center">
                      <i className="fas fa-file-invoice fa-3x text-primary mb-3"></i>
                      <h5>Manual Invoice</h5>
                      <p className="text-muted">Manual invoice form</p>
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          try {
                            await generateManualInvoicePDF();
                            showToast.success('Manual invoice downloaded!');
                          } catch (error) {
                            showToast.error('Failed to generate manual invoice');
                          }
                        }}
                      >
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                {/* manual delivery note */}
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-info">
                    <div className="card-body text-center">
                      <i className="fas fa-truck fa-3x text-info mb-3"></i>
                      <h5>Manual Delivery Note</h5>
                      <p className="text-muted">Manual delivery note</p>
                      <button
                        className="btn btn-info text-white"
                        onClick={async () => {
                          try {
                            await generateManualDeliveryNotePDF();
                            showToast.success('Manual delivery note downloaded!');
                          } catch (error) {
                            showToast.error('Failed to generate manual delivery note');
                          }
                        }}
                      >
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                {/* manual leave form */}
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-info">
                    <div className="card-body text-center">
                      <i className="fas fa-calendar-week fa-3x text-info mb-3"></i>
                      <h5>Manual Leave Form</h5>
                      <p className="text-muted">Blank leave request form (fill by hand)</p>
                      <button
                        className="btn btn-info text-white"
                        onClick={async () => {
                          try {
                            await generateManualLeaveRequestPDF();
                            showToast.success('Manual leave form downloaded!');
                          } catch (error) {
                            showToast.error('Failed to generate manual leave form');
                          }
                        }}
                      >
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                {/* <button
                  className="btn btn-outline-primary w-100 mb-2"
                  onClick={async () => {
                    try {
                      await generateSecretaryContractPDF();
                      showToast.success('Secretary employment contract downloaded!');
                    } catch (error) {
                      showToast.error('Failed to generate contract');
                    }
                  }}
                >
                  <i className="fas fa-file-contract me-2"></i>
                  Secretary Employment Contract
                </button> */}                
              </div>
            )}

            {activeTab === 'letter' && canAccessLetter && (
              <LetterWriter userRole={user} />
            )}

            {activeTab === 'delivery' && canAccessInvoice && (
              <DeliveryNoteGenerator />
            )}

            {activeTab === 'invoice' && canAccessInvoice && (
              <InvoiceGenerator />
            )}

            {activeTab === 'leave' && (
              <LeaveRequestWriter user={user} />
            )}

            {activeTab === 'document' && canAccessLetter && (
              <DocumentGenerator userRole={user} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UtilitiesPanel;