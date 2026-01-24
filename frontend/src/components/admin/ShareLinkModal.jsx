"use client"
import { useState } from "react"
import Modal from "../common/Modal";
import Toast,{ showToast } from "../common/Toast";

// Company constants (same as in ReceiptPDF.js)
const COMPANY_INFO = {
  name: 'NAGOLIE ENTERPRISES LTD',
  tagline: 'Giving livestock farmers another chance',
  address: 'Target - Isinya, Kajiado County, Kenya',
  phone1: '+254 721 451 707',
  phone2: '+254 763 003 182',
  email: 'nagolie7@gmail.com',
  hours: 'Everyday: 8:00 AM - 6:00 PM',
  poBox: 'P.O BOX 359-01100',
  logoUrl: '/logo.png'
};

function ShareLinkModal({ isOpen, onClose, shareLinkData }) {
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLinkData.link)
    showToast.success("Link copied to clipboard!")
  }

  const handleCopyPassword = () => {
    if (shareLinkData.temporaryPassword) {
      navigator.clipboard.writeText(shareLinkData.temporaryPassword)
      showToast.success("Password copied to clipboard!")
    } else {
      showToast.error("No temporary password available")
    }
  }

  const handleShareEmail = () => {
    const subject = `Complete Your Nagolie Enterprises Investor Account Setup - ${shareLinkData.investorName}`
    const body = `Hello ${shareLinkData.investorName},\n\nWelcome to Nagolie Enterprises!\n\nPlease complete your investor account setup by clicking the link below:\n\n${shareLinkData.link}\n\nYour temporary password: ${shareLinkData.temporaryPassword}\n\nImportant Instructions:\n1. Click the link above to open the registration page\n2. Enter the temporary password shown above\n3. Choose your username and new password\n4. Complete the registration\n\nThis link is valid for 24 hours.\n\nBest regards,\nNagolie Enterprises LTD\n${COMPANY_INFO.phone1} | ${COMPANY_INFO.email}`
    
    window.location.href = `mailto:${shareLinkData.investorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const handleShareWhatsApp = () => {
    const message = `Hello ${shareLinkData.investorName}, Welcome to Nagolie Enterprises!\n\nComplete your investor account setup:\nLink: ${shareLinkData.link}\nTemporary Password: ${shareLinkData.temporaryPassword}\n\nClick the link and enter the password to create your account.`
    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank')
  }

  const handleShareSMS = () => {
    const message = `Hello ${shareLinkData.investorName}, Welcome to Nagolie Enterprises! Complete account setup: ${shareLinkData.link} Password: ${shareLinkData.temporaryPassword}`
    window.location.href = `sms:${shareLinkData.investorPhone}?body=${encodeURIComponent(message)}`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Account Creation Link"
      size="md"
    >
      <div className="mb-3">
        <label className="form-label">Investor Details</label>
        <div className="card mb-3">
          <div className="card-body">
            <p className="mb-1"><strong>Name:</strong> {shareLinkData.investorName}</p>
            {shareLinkData.investorEmail && (
              <p className="mb-1"><strong>Email:</strong> {shareLinkData.investorEmail}</p>
            )}
            <p className="mb-1"><strong>Phone:</strong> {shareLinkData.investorPhone}</p>
            <p className="mb-1">
              <strong>Temporary Password:</strong> 
              <span className="text-primary fw-bold ms-2">{shareLinkData.temporaryPassword || 'Not available'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label">Account Creation Link</label>
        <div className="input-group mb-2">
          <input 
            type="text" 
            className="form-control" 
            value={shareLinkData.link} 
            readOnly 
          />
          <button 
            className="btn btn-outline-primary" 
            type="button"
            onClick={handleCopyLink}
          >
            <i className="fas fa-copy"></i>
          </button>
        </div>
        <small className="text-muted">This link will expire in 24 hours.</small>
      </div>

      <div className="mb-3">
        <label className="form-label">Copy Temporary Password</label>
        <div className="input-group mb-2">
          <input 
            type="text" 
            className="form-control" 
            value={shareLinkData.temporaryPassword || ''} 
            readOnly 
          />
          <button 
            className="btn btn-outline-secondary" 
            type="button"
            onClick={handleCopyPassword}
          >
            <i className="fas fa-copy"></i>
          </button>
        </div>
        <small className="text-muted">Investor needs this to complete registration</small>
      </div>

      <div className="mb-4">
        <label className="form-label">Share via</label>
        <div className="d-flex flex-wrap gap-2">
          {shareLinkData.investorEmail && (
            <button 
              className="btn btn-primary flex-fill"
              onClick={handleShareEmail}
              title="Share via Email"
            >
              <i className="fas fa-envelope me-2"></i> Email
            </button>
          )}
          <button 
            className="btn btn-success flex-fill"
            onClick={handleShareWhatsApp}
            title="Share via WhatsApp"
          >
            <i className="fab fa-whatsapp me-2"></i> WhatsApp
          </button>
          <button 
            className="btn btn-info flex-fill"
            onClick={handleShareSMS}
            title="Share via SMS"
          >
            <i className="fas fa-sms me-2"></i> SMS
          </button>
        </div>
      </div>

      <div className="alert alert-warning">
        <i className="fas fa-exclamation-triangle me-2"></i>
        <strong>Important:</strong> The investor needs both the link AND the temporary password to create their account.
      </div>

      <div className="d-flex justify-content-end">
        <button 
          type="button" 
          className="btn btn-secondary" 
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  )
}

export default ShareLinkModal