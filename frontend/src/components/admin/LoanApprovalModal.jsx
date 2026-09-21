// components/admin/LoanApprovalModal.jsx
"use client"

import { useState, useEffect } from "react"
import Modal from "../common/Modal"
import Toast, { showToast } from "../common/Toast"


function LoanApprovalModal({ 
  isOpen, 
  onClose, 
  onApprove, 
  application, 
  investors = [],
  loading = false 
}) {
  const [fundingSource, setFundingSource] = useState('company')
  const [selectedInvestor, setSelectedInvestor] = useState('')
  const [filteredInvestors, setFilteredInvestors] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  const [disbursementMethod, setDisbursementMethod] = useState('bank'); // default = bank
  const [disbursementRef, setDisbursementRef]       = useState('');
  
  // Add state for investor stats
  const [investorStats, setInvestorStats] = useState({})
  
  // Calculate investor stats when selection changes
  useEffect(() => {
    if (selectedInvestor && fundingSource === 'investor') {
      const investor = investors.find(inv => inv.id === selectedInvestor)
      if (investor) {        
        setInvestorStats({
          invested: investor.investment_amount,
          available: investor.available_balance, 
          lent: investor.total_lent_amount        
        })
      }
    }
  }, [selectedInvestor, fundingSource, investors])

  useEffect(() => {
    if (investors) {
      const activeInvestors = investors.filter(inv => 
        inv.account_status === 'active'
      )
      setFilteredInvestors(activeInvestors)
    }
  }, [investors])

  const handleSearch = (term) => {
    setSearchTerm(term)
    if (term.trim() === '') {
      setFilteredInvestors(investors.filter(inv => inv.account_status === 'active'))
    } else {
      const filtered = investors.filter(inv => 
        inv.account_status === 'active' &&
        (inv.name.toLowerCase().includes(term.toLowerCase()) ||
         inv.phone.includes(term) ||
         inv.email?.toLowerCase().includes(term.toLowerCase()))
      )
      setFilteredInvestors(filtered)
    }
  }

  const handleSubmit = () => {
    if (fundingSource === 'investor' && !selectedInvestor) {
      alert('Please select an investor');
      return;
    }

    // Check if investor has enough balance
    if (fundingSource === 'investor' && investorStats.available < parseFloat(application.loanAmount)) {
      alert(`Insufficient funds! Selected investor only has KSh ${investorStats.available.toLocaleString()} available`);
      return;
    }

    if (disbursementMethod === 'bank' && !disbursementRef.trim()) {
    showToast.error('Reference code is required for bank transfers');
    return;
  }

    onApprove(application.id, {
      funding_source: fundingSource,
      investor_id: fundingSource === 'investor' ? selectedInvestor : null,

      disbursement_method:    disbursementMethod,                   // 'bank' | 'cash'
      disbursement_reference: disbursementMethod === 'bank'? disbursementRef.trim().toUpperCase(): '',
    });
  };

  if (!application) return null

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
    }).format(Number(amount) || 0)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Loan"
      size="md"
    >
      <div className="mb-3">
        <label className="form-label">Client Details</label>
        <div className="card bg-light p-3">
          <p className="mb-1"><strong>Name:</strong> {application.name}</p>
          <p className="mb-1"><strong>Phone:</strong> {application.phone}</p>
          <p className="mb-1"><strong>Loan Amount:</strong> {formatCurrency(application.loanAmount)}</p>
          <p className="mb-0"><strong>Livestock:</strong> {application.livestockType} ({application.livestockCount})</p>
          <p className="mb-0"><strong>Production Classification:</strong> {application.production_classification || 'Not specified'}</p>
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label"><strong>Select Funding Source</strong></label>
        <div className="form-check mb-2">
          <input
            className="form-check-input"
            type="radio"
            name="fundingSource"
            id="companyFunds"
            checked={fundingSource === 'company'}
            onChange={() => setFundingSource('company')}
          />
          <label className="form-check-label" htmlFor="companyFunds">
            Company Funds
          </label>
          <small className="d-block text-muted">
            Use company's available funds for this loan
          </small>
        </div>
        
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="fundingSource"
            id="investorFunds"
            checked={fundingSource === 'investor'}
            onChange={() => setFundingSource('investor')}
          />
          <label className="form-check-label" htmlFor="investorFunds">
            Investor Funds
          </label>
          <small className="d-block text-muted">
            Use funds from a specific investor
          </small>
        </div>
      </div>


      {fundingSource === 'investor' && (
        <div className="mb-3">
          <label className="form-label"><strong>Select Investor</strong></label>
          <input
            type="text"
            className="form-control mb-2"
            placeholder="Search investor by name, phone, or email..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
          
          {filteredInvestors.length > 0 ? (
            <div className="list-group" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {filteredInvestors.map(investor => {
                const availableBalance = investor.available_balance || 0;
                const alreadyLent = investor.total_lent_amount || 0;
                
                return (
                  <button
                    key={investor.id}
                    type="button"
                    className={`list-group-item list-group-item-action ${selectedInvestor === investor.id ? 'active' : ''}`}
                    onClick={() => {
                      // 1. Set the ID
                      setSelectedInvestor(investor.id);
                                      
                      // 2. Immediately update the stats for the "Selected Investor" info box
                      setInvestorStats({
                        invested: investor.investment_amount,
                        available: investor.available_balance,
                        lent: investor.total_lent_amount || 0
                      });
                    }}
                  >
                    <div className="d-flex w-100 justify-content-between align-items-start">
                      <div>
                        <h6 className="mb-1">{investor.name}</h6>
                        <p className="mb-1 small">
                          <i className="fas fa-phone me-1"></i>{investor.phone}
                          {investor.email && <><br/><i className="fas fa-envelope me-1"></i>{investor.email}</>}
                        </p>
                        
                        {/* Display investment details */}
                        <div className="mt-2">
                          <small className="d-block">
                            <strong>Invested:</strong> {formatCurrency(investor.investment_amount)}
                          </small>
                          <small className="d-block">
                            <strong>Available to Lend:</strong> {formatCurrency(availableBalance)}
                          </small>
                          {alreadyLent > 0 && (
                            <small className="d-block">
                              <strong>Already Lent:</strong> {formatCurrency(alreadyLent)}
                            </small>
                          )}
                        </div>
                      </div>
                      <small>
                        <span className={`badge ${availableBalance >= parseFloat(application.loanAmount) ? 'bg-success' : 'bg-warning'}`}>
                          {availableBalance >= parseFloat(application.loanAmount) ? 'Sufficient Funds' : 'Insufficient'}
                        </span>
                      </small>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="alert alert-warning">
              <i className="fas fa-exclamation-triangle me-2"></i>
              No active investors found. {searchTerm && 'Try a different search term.'}
            </div>
          )}
          
          {selectedInvestor && (
            <div className="alert alert-info mt-2">
              <i className="fas fa-info-circle me-2"></i>
              <strong>Selected Investor:</strong> {filteredInvestors.find(inv => inv.id === selectedInvestor)?.name}
              <br />
              <strong>Loan Amount:</strong> {formatCurrency(application.loanAmount)}
              <br />
              <strong>Available Balance:</strong> {formatCurrency(investorStats.available)}
              <br />
              <strong>Remaining After Loan:</strong> {formatCurrency(investorStats.available - parseFloat(application.loanAmount))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Disbursement Method ---------- */}
      <div className="mb-3">
        <label className="form-label fw-bold">
          Disbursement Method <span className="text-danger">*</span>
        </label>
        <select
          className="form-select"
          value={disbursementMethod}
          onChange={(e) => {
            setDisbursementMethod(e.target.value);
            if (e.target.value === 'cash') setDisbursementRef(''); // clear ref on cash
          }}
          disabled={loading}
        >
          <option value="bank">Bank Transfer</option>
          <option value="cash">Cash</option>
        </select>
      </div>
        
      {/* ---------- Bank Reference (only when bank) ---------- */}
      {disbursementMethod === 'bank' && (
        <div className="mb-3">
          <label className="form-label fw-bold">
            Bank Reference Code <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className="form-control"
            value={disbursementRef}
            onChange={(e) => setDisbursementRef(e.target.value)}
            placeholder="e.g. KCB-2024-0912-88421"
            required
            disabled={loading}
            style={{ textTransform: 'uppercase' }}
          />
          <small className="text-muted">
            Enter the bank transfer / cheque reference number.
          </small>
        </div>
      )}

      <div className="alert alert-warning">
        <i className="fas fa-exclamation-triangle me-2"></i>
        This action will approve the loan and move the client to active clients.
        The livestock will be marked as collateral owned by {fundingSource === 'company' ? 'the company' : 'the selected investor'}.
      </div>

      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-success"
          onClick={handleSubmit}
          disabled={loading || (fundingSource === 'investor' && !selectedInvestor)}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2"></span>
              Approving...
            </>
          ) : (
            <>
              <i className="fas fa-check me-2"></i>
              Approve Loan
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </Modal>
  )
}

export default LoanApprovalModal