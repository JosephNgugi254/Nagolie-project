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
  generateManualDeliveryNotePDF,
  generateBlankReportPDF,
  generateValuerReportPDF,
  generateClientRelationsOfficerContractPDF,
  generatePromissoryNote,
  generateManualPromissoryNotePDF,
  generateManualOathOfSecrecyPDF
} from '../admin/ReceiptPDF';
import { generateSecretaryContractPDF } from '../admin/ReceiptPDF';
import { useAuth } from '../../context/AuthContext';
import LetterWriter from './LetterWriter';
import InvoiceGenerator from './InvoiceGenerator';
import LeaveRequestWriter from './LeaveRequestWriter';
import DocumentGenerator from './DocumentGenerator';
import DeliveryNoteGenerator from './DeliveryNoteGenerator';
import PromissoryNoteWriter from './PromissoryNoteWriter';
import SalaryAdvanceStaff from '../salary/SalaryAdvanceStaff';

const UtilitiesPanel = ({ userRole, restrictedMode = false }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('forms');

  // Define roles that can access each feature
  const canAccessFull = ['admin', 'secretary', 'client_relations_officer', 'director', 'head_of_it', 'accountant', 'valuer', 'hr_manager'].includes(userRole);
  const canAccessManualForms = true;
  const canAccessLetter = canAccessFull;
  const canAccessInvoice = canAccessFull;

  // Staff roles that can request salary advances (must match backend get_staff_roles)
  const staffRoles = ['head_of_it', 'client_relations_officer', 'valuer', 'secretary', 'hr_manager'];
  const isStaff = userRole && staffRoles.includes(userRole);

  // If the user is not staff, ensure we don't show the salary tab
  if (!isStaff && activeTab === 'salary') {
    setActiveTab('forms');
  }

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
                  className={`nav-link ${activeTab === 'promissory' ? 'active' : ''}`}
                  onClick={() => setActiveTab('promissory')}
                >
                  <i className="fas fa-file-signature me-2"></i>Promissory Note
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
            {canAccessInvoice && (
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
            {isStaff && (
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'salary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('salary')}
                >
                  <i className="fas fa-hand-holding-usd me-2"></i>Salary Advance
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
                {/* All form cards – unchanged */}
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-primary">
                    <div className="card-body text-center">
                      <i className="fas fa-file-signature fa-3x text-primary mb-3"></i>
                      <h5>Loan Agreement</h5>
                      <p className="text-muted">Manual loan agreement form for loan applications</p>
                      <button className="btn btn-primary" onClick={() => handleDownloadForm('loan')}>
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
                      <button className="btn btn-success" onClick={() => handleDownloadForm('renewal')}>
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
                      <button className="btn btn-warning" onClick={() => handleDownloadForm('nextOfKin')}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-info">
                    <div className="card-body text-center">
                      <i className="fas fa-hand-holding-heart fa-3x text-info mb-3"></i>
                      <h5>Loan Waiver Agreement</h5>
                      <p className="text-muted">Manual waiver form for loans waived</p>
                      <button className="btn btn-info text-white" onClick={() => handleDownloadForm('waiver')}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-secondary">
                    <div className="card-body text-center">
                      <i className="fas fa-file-signature fa-3x text-secondary mb-3"></i>
                      <h5>Manual Promissory Note</h5>
                      <p className="text-muted">Blank promissory note – fill by hand after printing.</p>
                      <button className="btn btn-secondary" onClick={async () => {
                        try {
                          await generateManualPromissoryNotePDF();
                          showToast.success('Manual promissory note downloaded!');
                        } catch (error) {
                          showToast.error('Failed to generate manual promissory note');
                        }
                      }}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-primary">
                    <div className="card-body text-center">
                      <i className="fas fa-file-invoice fa-3x text-primary mb-3"></i>
                      <h5>Manual Invoice</h5>
                      <p className="text-muted">Manual invoice form</p>
                      <button className="btn btn-primary" onClick={async () => {
                        try {
                          await generateManualInvoicePDF();
                          showToast.success('Manual invoice downloaded!');
                        } catch (error) {
                          showToast.error('Failed to generate manual invoice');
                        }
                      }}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-info">
                    <div className="card-body text-center">
                      <i className="fas fa-truck fa-3x text-info mb-3"></i>
                      <h5>Manual Delivery Note</h5>
                      <p className="text-muted">Manual delivery note</p>
                      <button className="btn btn-info text-white" onClick={async () => {
                        try {
                          await generateManualDeliveryNotePDF();
                          showToast.success('Manual delivery note downloaded!');
                        } catch (error) {
                          showToast.error('Failed to generate manual delivery note');
                        }
                      }}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-info">
                    <div className="card-body text-center">
                      <i className="fas fa-calendar-week fa-3x text-info mb-3"></i>
                      <h5>Manual Leave Form</h5>
                      <p className="text-muted">Blank leave request form (fill by hand)</p>
                      <button className="btn btn-info text-white" onClick={async () => {
                        try {
                          await generateManualLeaveRequestPDF();
                          showToast.success('Manual leave form downloaded!');
                        } catch (error) {
                          showToast.error('Failed to generate manual leave form');
                        }
                      }}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-secondary">
                    <div className="card-body text-center">
                      <i className="fas fa-file-alt fa-3x text-secondary mb-3"></i>
                      <h5>Loan Report Form</h5>
                      <p className="text-muted">Report for Loan follow up records</p>
                      <button className="btn btn-secondary" onClick={generateBlankReportPDF}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-success">
                    <div className="card-body text-center">
                      <i className="fas fa-file-alt fa-3x text-success mb-3"></i>
                      <h5>Valuer Report Form</h5>
                      <p className="text-muted">Valuer Report for Loan recoveries</p>
                      <button className="btn btn-success" onClick={generateValuerReportPDF}>
                        <i className="fas fa-download me-2"></i>Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-4">
                  <div className="card h-100 border-danger">
                    <div className="card-body text-center">
                      <i className="fas fa-user-secret fa-3x text-danger mb-3"></i>
                      <h5>Oath of Secrecy</h5>
                      <p className="text-muted">Oath of secrecy and professional conduct form</p>
                      <button
                        className="btn btn-danger"
                        onClick={async () => {
                          try {
                            await generateManualOathOfSecrecyPDF();
                            showToast.success('Oath of Secrecy downloaded!');
                          } catch (error) {
                            showToast.error('Failed to generate Oath of Secrecy');
                          }
                        }}
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

            {activeTab === 'promissory' && canAccessLetter && (
              <PromissoryNoteWriter />
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

            {activeTab === 'salary' && isStaff && (
              <SalaryAdvanceStaff user={user} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UtilitiesPanel;