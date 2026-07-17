// frontend/src/components/utilities/LeaveRequestWriter.jsx
import { useState, useEffect } from 'react';
import { generateLeaveRequestPDF } from '../admin/ReceiptPDF';
import { showToast } from '../common/Toast';

const getFullName = (user) => {
  if (!user) return 'Unknown';
  const role = user.role;
  const username = (user.username || '').toLowerCase();

  if (role === 'director') {
    if (username === 'director') return 'Shadrack Kesumet';
    if (username === 'millicent') return 'Millicent Mantaine';
    return 'Shadrack Kesumet';
  }
  if (role === 'deputy_director') {
    return 'Millicent Mantaine';
  }
  if (role === 'secretary') {
    return 'Gladys Sakinoi';
  }
  if (role === 'accountant') {
    return 'Gideon Matunta';
  }
  if (role === 'head_of_it') {
    if (username === 'ngugi') return 'Joseph Ngugi';
    return 'Joseph Ngugi';
  }
  if (role === 'valuer') {
    if (username === 'robert') return 'Robert Kalama';
    if (username === 'george') return 'George Marite';
    return 'George Marite';
  }
  if (role === 'client_relations_officer') {
    if (username === 'lucie') return 'Lucy Nyambura';
    if (username === 'annie') return 'Ann Ndura';
    return 'Client Relations Officer';
  }
  if (role === 'hr_manager') {
    if (username == 'terry') return 'Terry Kintei';
    return 'HR Manager';
  }
  return user.username || user.fullName || 'Unknown';
};

const formatRole = (role) => {
  if (!role) return 'Staff';
  switch (role.toLowerCase()) {
    case 'head_of_it':
      return 'Head of I.T';
    case 'secretary':
      return 'Secretary';
    case 'client_relations_officer':
      return 'Client Relations Officer';
    case 'valuer':
      return 'Valuer';
    case 'accountant':
      return 'Accountant';
    case 'director':
      return 'Director';
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
};

const LeaveRequestWriter = ({ user }) => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [generatingType, setGeneratingType] = useState(null);

  const getDraftKey = () => {
    const userId = user?.id || user?.username || 'anonymous';
    return `leaveDraft_${userId}`;
  };

  useEffect(() => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setFromDate(draft.fromDate || '');
        setToDate(draft.toDate || '');
        setReason(draft.reason || '');
        setHasDraft(true);
      } catch (e) {}
    }
  }, [user]);

  useEffect(() => {
    if (fromDate || toDate || reason) {
      const draft = { fromDate, toDate, reason, lastSaved: new Date().toISOString() };
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      setHasDraft(true);
    } else {
      setHasDraft(false);
    }
  }, [fromDate, toDate, reason, user]);

  const clearDraft = () => {
    setFromDate('');
    setToDate('');
    setReason('');
    localStorage.removeItem(getDraftKey());
    setHasDraft(false);
    showToast.success('Draft cleared');
  };

  const loadDraft = () => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setFromDate(draft.fromDate || '');
        setToDate(draft.toDate || '');
        setReason(draft.reason || '');
        showToast.success('Draft loaded');
      } catch (e) {
        showToast.error('Failed to load draft');
      }
    } else {
      showToast.info('No saved draft found');
    }
  };

  const requesterName = getFullName(user);
  const requesterRole = formatRole(user?.role);
  const displayRole = requesterRole;

  const handleGeneratePreview = async () => {
    if (!fromDate || !toDate || !reason.trim()) {
      showToast.error('Please fill in all fields');
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      showToast.error('"From" date must be before "To" date');
      return;
    }
    setGeneratingType('preview');
    setIsGenerating(true);
    try {
      await generateLeaveRequestPDF({
        requesterName,
        requesterRole: displayRole,
        fromDate,
        toDate,
        reason: reason.trim(),
        date: new Date().toLocaleDateString('en-GB')
      }, true);
    } catch (error) {
      console.error(error);
      showToast.error('Failed to generate leave request preview');
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const handleDownload = async () => {
    if (!fromDate || !toDate || !reason.trim()) {
      showToast.error('Please fill in all fields');
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      showToast.error('"From" date must be before "To" date');
      return;
    }
    setGeneratingType('download');
    setIsGenerating(true);
    try {
      await generateLeaveRequestPDF({
        requesterName,
        requesterRole: displayRole,
        fromDate,
        toDate,
        reason: reason.trim(),
        date: new Date().toLocaleDateString('en-GB')
      }, false);
      showToast.success('Leave request downloaded as PDF');
    } catch (error) {
      console.error(error);
      showToast.error('Failed to download leave request');
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const isLoading = isGenerating;

  return (
    <div className="leave-request-writer">
      <div className="row">
        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Requester</label>
          <input type="text" className="form-control" value={`${requesterName} (${displayRole})`} readOnly disabled />
        </div>
        <div className="col-md-6 mb-4">
          <label className="form-label fw-bold">Leave From</label>
          <input 
            type="date" 
            className="form-control" 
            value={fromDate} 
            onChange={(e) => setFromDate(e.target.value)} 
            required 
            disabled={isLoading}
          />
        </div>
        <div className="col-md-6 mb-4">
          <label className="form-label fw-bold">Leave To</label>
          <input 
            type="date" 
            className="form-control" 
            value={toDate} 
            onChange={(e) => setToDate(e.target.value)} 
            required 
            disabled={isLoading}
          />
        </div>
        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Reason for Leave</label>
          <textarea 
            className="form-control" 
            rows="6" 
            value={reason} 
            onChange={(e) => setReason(e.target.value)} 
            placeholder="Explain why you need leave..." 
            required 
            disabled={isLoading}
          />
        </div>
        <div className="col-md-12 d-flex flex-wrap gap-2 justify-content-end">
          {hasDraft && (
            <button className="btn btn-outline-info" onClick={loadDraft} disabled={isLoading}>
              <i className="fas fa-undo me-2"></i>Load Draft
            </button>
          )}
          <button className="btn btn-secondary" onClick={clearDraft} disabled={isLoading}>
            <i className="fas fa-trash me-2"></i>Clear Draft
          </button>
          <button className="btn btn-primary" onClick={handleGeneratePreview} disabled={isLoading}>
            {isLoading && generatingType === 'preview' ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generating...</>
            ) : (
              <><i className="fas fa-eye me-2"></i>Generate & Preview PDF</>
            )}
          </button>
          <button className="btn btn-success" onClick={handleDownload} disabled={isLoading}>
            {isLoading && generatingType === 'download' ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Downloading...</>
            ) : (
              <><i className="fas fa-download me-2"></i>Download PDF</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveRequestWriter;