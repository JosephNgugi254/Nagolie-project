import { useState, useEffect } from 'react';
import { generateLetterPDF, downloadLetterPDF } from '../admin/ReceiptPDF';
import { showToast } from '../common/Toast';
import { useAuth } from '../../context/AuthContext';

const LetterWriter = ({ userRole }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [recipient, setRecipient] = useState('');
  const [re, setRe] = useState('');
  const [body, setBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // Get user-specific draft key
  const getDraftKey = () => {
    const userId = user?.id || user?.username || 'anonymous';
    return `letterDraft_${userId}`;
  };

  // Load draft from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setTitle(draft.title || '');
        setRecipient(draft.recipient || '');
        setRe(draft.re || '');
        setBody(draft.body || '');
        setHasDraft(true);
      } catch (e) {}
    }
  }, [user]);

  // Save draft whenever any field changes (auto-save)
  useEffect(() => {
    if (title || recipient || re || body) {
      const draft = { title, recipient, re, body, lastSaved: new Date().toISOString() };
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      setHasDraft(true);
    } else {
      setHasDraft(false);
    }
  }, [title, recipient, re, body, user]);

  const clearDraft = () => {
    setTitle('');
    setRecipient('');
    setRe('');
    setBody('');
    localStorage.removeItem(getDraftKey());
    setHasDraft(false);
    showToast.success('Draft cleared');
  };

  const loadDraft = () => {
    const saved = localStorage.getItem(getDraftKey());
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setTitle(draft.title || '');
        setRecipient(draft.recipient || '');
        setRe(draft.re || '');
        setBody(draft.body || '');
        showToast.success('Draft loaded');
      } catch (e) {
        showToast.error('Failed to load draft');
      }
    } else {
      showToast.info('No saved draft found');
    }
  };

  const insertFormat = (format) => {
    const textarea = document.getElementById('letterBody');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.substring(start, end);
    let newText = '';
    switch (format) {
      case 'bold':
        newText = `**${selectedText || 'bold text'}**`;
        break;
      case 'italic':
        newText = `*${selectedText || 'italic text'}*`;
        break;
      case 'underline':
        newText = `__${selectedText || 'underlined text'}__`;
        break;
      default:
        return;
    }
    const newBody = body.substring(0, start) + newText + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + newText.length, start + newText.length);
    }, 10);
  };

  const handleGeneratePreview = async () => {
    if (!title.trim() || !body.trim()) {
      showToast.error('Please provide a title and message body');
      return;
    }
    setIsGenerating(true);
    try {
      await generateLetterPDF({
        title: title.trim(),
        recipient: recipient.trim() || 'The Management',
        re: re.trim(),
        body: body.trim(),
        date: new Date().toLocaleDateString('en-GB'),
        user: userRole,
      });      
    } catch (error) {
      console.error(error);
      showToast.error('Failed to generate letter preview');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!title.trim() || !body.trim()) {
      showToast.error('Please provide a title and message body');
      return;
    }
    setIsGenerating(true);
    try {
      await downloadLetterPDF({
        title: title.trim(),
        recipient: recipient.trim() || 'The Management',
        re: re.trim(),
        body: body.trim(),
        date: new Date().toLocaleDateString('en-GB'),
        user: userRole,
      });
      showToast.success('Letter downloaded as PDF');
    } catch (error) {
      console.error(error);
      showToast.error('Failed to download letter');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="letter-writer">
      <div className="row">
        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Document Title</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g., Appointment Letter, Termination Notice, etc."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="col-md-6 mb-4">
          <label className="form-label fw-bold">Recipient</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g., The Human Resources Manager, John Doe"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
        <div className="col-md-6 mb-4">
          <label className="form-label fw-bold">RE: (Subject)</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g., Loan Renewal Notice"
            value={re}
            onChange={(e) => setRe(e.target.value)}
          />
        </div>
        <div className="col-md-12 mb-2">
          <label className="form-label fw-bold">Formatting</label>
          <div className="d-flex flex-wrap gap-2 mb-2">
            <button type="button" className="btn btn-outline-secondary" onClick={() => insertFormat('bold')}>
              <i className="fas fa-bold"></i> Bold
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => insertFormat('italic')}>
              <i className="fas fa-italic"></i> Italic
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => insertFormat('underline')}>
              <i className="fas fa-underline"></i> Underline
            </button>
          </div>
          <small className="text-muted d-block mb-2">
            Use **bold**, *italic*, __underline__ or select text and click buttons.
          </small>
        </div>
        <div className="col-md-12 mb-4">
          <label className="form-label fw-bold">Letter Content</label>
          <textarea
            id="letterBody"
            className="form-control"
            rows="12"
            placeholder="Type your letter content here."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="col-md-12 d-flex flex-wrap gap-2 justify-content-end">
          {hasDraft && (
            <button className="btn btn-outline-info" onClick={loadDraft}>
              <i className="fas fa-undo me-2"></i>Load Draft
            </button>
          )}
          <button className="btn btn-secondary" onClick={clearDraft}>
            <i className="fas fa-trash me-2"></i>Clear Draft
          </button>
          <button className="btn btn-primary" onClick={handleGeneratePreview} disabled={isGenerating}>
            {isGenerating ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</>
            ) : (
              <><i className="fas fa-eye me-2"></i>Generate & Preview PDF</>
            )}
          </button>
          <button className="btn btn-success" onClick={handleDownload} disabled={isGenerating}>
            <i className="fas fa-download me-2"></i>Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default LetterWriter;