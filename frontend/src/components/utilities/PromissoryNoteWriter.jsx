// components/utilities/PromissoryNoteWriter.jsx
import { useState, useEffect } from 'react';
import { adminAPI, recoveryAPI } from '../../services/api';
import { generatePromissoryNote } from '../admin/ReceiptPDF';
import { showToast } from '../common/Toast';

const PromissoryNoteWriter = () => {
  const [loans, setLoans] = useState([]);           // list of loan objects from recovery
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [mode, setMode] = useState('auto'); // 'auto' or 'manual'
  const [formData, setFormData] = useState({
    clientName: '',
    idNumber: '',
    dateBorrowed: '',
    amountBorrowed: '',
    currentPrincipal: '',
    interestOwed: '',
    totalBalance: '',
    amountToPay: '',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
  });
  const [generating, setGenerating] = useState(false);

  // Fetch active loans (recovery data) when in auto mode
  useEffect(() => {
    if (mode === 'auto') {
      fetchRecoveryLoans();
    }
  }, [mode]);

  const fetchRecoveryLoans = async () => {
    setLoadingLoans(true);
    try {
      const res = await recoveryAPI.getRecoveryLoans();
      setLoans(res || []);
    } catch (error) {
      console.error(error);
      showToast.error('Failed to load loan data from recovery');
    } finally {
      setLoadingLoans(false);
    }
  };

  const formatDateForInput = (dateValue) => {
    if (!dateValue) return '';
    try {
      const d = new Date(dateValue);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const handleLoanSelect = (loanId) => {
    const loan = loans.find(l => l.loanId === parseInt(loanId));
    if (loan) {
      const currentPrincipal = loan.currentPrincipal || 0;
      const interestOwed = loan.accruedInterest || 0;
      const totalBalance = currentPrincipal + interestOwed;

      setFormData({
        clientName: loan.clientName,
        idNumber: loan.idNumber || '',
        dateBorrowed: formatDateForInput(loan.borrowedDate),
        amountBorrowed: loan.principalAmount || 0,
        currentPrincipal: currentPrincipal,
        interestOwed: interestOwed,
        totalBalance: totalBalance,
        amountToPay: totalBalance,   // default to total balance
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePreview = async () => {
    if (!formData.clientName.trim()) {
      showToast.error('Client name is required');
      return;
    }
    if (!formData.amountToPay || parseFloat(formData.amountToPay) <= 0) {
      showToast.error('Please enter a valid amount to pay');
      return;
    }
    if (!formData.dueDate) {
      showToast.error('Due date is required');
      return;
    }
    setGenerating(true);
    try {
      const blob = await generatePromissoryNote(formData, true);
      if (blob) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        URL.revokeObjectURL(url);
        showToast.success('Preview opened');
      } else {
        showToast.error('Failed to generate preview');
      }
    } catch (error) {
      console.error(error);
      showToast.error('Failed to generate preview');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!formData.clientName.trim()) {
      showToast.error('Client name is required');
      return;
    }
    if (!formData.amountToPay || parseFloat(formData.amountToPay) <= 0) {
      showToast.error('Please enter a valid amount to pay');
      return;
    }
    if (!formData.dueDate) {
      showToast.error('Due date is required');
      return;
    }
    setGenerating(true);
    try {
      await generatePromissoryNote(formData, false);
      showToast.success('Promissory note downloaded');
    } catch (error) {
      console.error(error);
      showToast.error('Failed to download promissory note');
    } finally {
      setGenerating(false);
    }
  };

  const resetForm = () => {
    setSelectedLoanId('');
    setFormData({
      clientName: '',
      idNumber: '',
      dateBorrowed: '',
      amountBorrowed: '',
      currentPrincipal: '',
      interestOwed: '',
      totalBalance: '',
      amountToPay: '',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    });
    showToast.info('Form cleared');
  };

  return (
    <div className="promissory-note-writer">
      <div className="row">
        <div className="col-md-12 mb-3">
          <div className="btn-group" role="group">
            <button
              type="button"
              className={`btn ${mode === 'auto' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => {
                setMode('auto');
                resetForm();
              }}
            >
              <i className="fas fa-magic me-2"></i>Auto-fill from Client Loan
            </button>
            <button
              type="button"
              className={`btn ${mode === 'manual' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => {
                setMode('manual');
                resetForm();
              }}
            >
              <i className="fas fa-pencil-alt me-2"></i>Manual Entry
            </button>
          </div>
        </div>
      </div>
      <form>
        {mode === 'auto' && (
          <div className="row mb-3">
            <div className="col-md-12">
              <label className="form-label fw-bold">Select Client / Loan</label>
              <select
                className="form-control"
                value={selectedLoanId}
                onChange={(e) => {
                  setSelectedLoanId(e.target.value);
                  handleLoanSelect(e.target.value);
                }}
                required
              >
                <option value="">-- Choose a loan --</option>
                {loans.map(loan => (
                  <option key={loan.loanId} value={loan.loanId}>
                    {loan.clientName} – Loan #{loan.loanId} – {loan.currentPrincipal?.toLocaleString()} KES
                  </option>
                ))}
              </select>
              {loadingLoans && <div className="spinner-border spinner-border-sm ms-2 mt-2"></div>}
              {!loadingLoans && loans.length === 0 && (
                <div className="text-muted small mt-1">No active loans found</div>
              )}
            </div>
          </div>
        )}

        {/* Rest of the form (same as original) */}
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label fw-bold">Client Name *</label>
            <input
              type="text"
              className="form-control"
              name="clientName"
              value={formData.clientName}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label fw-bold">ID Number</label>
            <input
              type="text"
              className="form-control"
              name="idNumber"
              value={formData.idNumber}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Date Borrowed</label>
            <input
              type="date"
              className="form-control"
              name="dateBorrowed"
              value={formData.dateBorrowed}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-4 mb-3">
            <label className="form-label">Amount Borrowed (KES)</label>
            <input
              type="number"
              className="form-control"
              name="amountBorrowed"
              value={formData.amountBorrowed}
              onChange={handleInputChange}
              step="0.01"
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">Current Principal (KES)</label>
            <input
              type="number"
              className="form-control"
              name="currentPrincipal"
              value={formData.currentPrincipal}
              onChange={handleInputChange}
              step="0.01"
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">Interest Owed (KES)</label>
            <input
              type="number"
              className="form-control"
              name="interestOwed"
              value={formData.interestOwed}
              onChange={handleInputChange}
              step="0.01"
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-4 mb-3">
            <label className="form-label">Total Balance (KES)</label>
            <input
              type="number"
              className="form-control"
              name="totalBalance"
              value={formData.totalBalance}
              onChange={handleInputChange}
              step="0.01"
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label fw-bold">Amount to Pay (KES) *</label>
            <input
              type="number"
              className="form-control"
              name="amountToPay"
              value={formData.amountToPay}
              onChange={handleInputChange}
              required
              step="0.01"
              min="0.01"
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label fw-bold">Due Date (on or before) *</label>
            <input
              type="date"
              className="form-control"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>

        <div className="alert alert-info">
          <i className="fas fa-info-circle me-2"></i>
          This promissory note will include the loan summary and a legal statement with the amount in words.
        </div>

        <div className="d-flex gap-2 justify-content-end mt-3">
          <button type="button" className="btn btn-secondary" onClick={resetForm}>
            <i className="fas fa-undo me-2"></i>Reset
          </button>
          <button type="button" className="btn btn-info" onClick={handlePreview} disabled={generating}>
            {generating ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</>
            ) : (
              <><i className="fas fa-eye me-2"></i>Preview</>
            )}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={generating}>
            {generating ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</>
            ) : (
              <><i className="fas fa-download me-2"></i>Download PDF</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PromissoryNoteWriter;