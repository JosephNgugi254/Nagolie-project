import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import jsPDF from 'jspdf';
import { addHeader, addFooter, addPageNumbers, COMPANY_INFO, COLORS } from '../admin/ReceiptPDF';

const ReportsPanel = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingComment, setEditingComment] = useState({});
  const [saving, setSaving] = useState({});
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchAssignedClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await recoveryAPI.getReportAssignments(reportDate);
      setClients(res.data);
      // Load draft from localStorage if exists
      const draftKey = `reportDraft_${user.id}_${reportDate}`;
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draftComments = JSON.parse(saved);
        setClients(prev => prev.map(client => ({
          ...client,
          comment: draftComments[client.id] || client.comment
        })));
      }
    } catch (error) {
      showToast.error('Failed to load assigned clients');
    } finally {
      setLoading(false);
    }
  }, [reportDate, user.id]);

  useEffect(() => {
    fetchAssignedClients();
  }, [fetchAssignedClients]);

  const handleCommentChange = (clientId, value) => {
    setEditingComment(prev => ({ ...prev, [clientId]: value }));
    // Update local state
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, comment: value } : c));
  };

  const saveComment = async (clientId) => {
    const comment = editingComment[clientId] ?? clients.find(c => c.id === clientId)?.comment ?? '';
    setSaving(prev => ({ ...prev, [clientId]: true }));
    try {
      await recoveryAPI.saveReportComment(clientId, comment);
      showToast.success('Comment saved');
      setEditingComment(prev => {
        const newState = { ...prev };
        delete newState[clientId];
        return newState;
      });
      // Also update draft in localStorage
      saveDraftToLocal();
    } catch (error) {
      showToast.error('Failed to save comment');
    } finally {
      setSaving(prev => ({ ...prev, [clientId]: false }));
    }
  };

  const saveDraftToLocal = () => {
    const draft = {};
    clients.forEach(c => { if (c.comment) draft[c.id] = c.comment; });
    const draftKey = `reportDraft_${user.id}_${reportDate}`;
    localStorage.setItem(draftKey, JSON.stringify(draft));
    showToast.success('Draft saved locally');
  };

  const loadDraft = () => {
    const draftKey = `reportDraft_${user.id}_${reportDate}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      const draftComments = JSON.parse(saved);
      setClients(prev => prev.map(client => ({
        ...client,
        comment: draftComments[client.id] || client.comment
      })));
      showToast.success('Draft loaded');
    } else {
      showToast.info('No saved draft for this date');
    }
  };

  const clearDraft = () => {
    const draftKey = `reportDraft_${user.id}_${reportDate}`;
    localStorage.removeItem(draftKey);
    showToast.success('Draft cleared');
  };

  const generatePDF = async (download = false) => {
    const doc = new jsPDF();
    // Add watermark
    const addWatermark = (doc) => {
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setTextColor(238, 241, 245);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.text('NAGOLIE ENTERPRISES', doc.internal.pageSize.width/2, doc.internal.pageSize.height/2, { align: 'center', angle: 45 });
        doc.setFontSize(18);
        doc.text('WEEKLY REPORT', doc.internal.pageSize.width/2, doc.internal.pageSize.height/2 + 20, { align: 'center', angle: 45 });
        doc.setTextColor(0,0,0);
      }
    };
    // Header
    let yPos = await addHeader(doc, 15);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryBlue);
    doc.text('WEEKLY LOAN REPORT', 105, yPos, { align: 'center' });
    yPos += 8;
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    doc.text(`Officer: ${user?.username} (${user?.role})`, 20, yPos);
    doc.text(`Report Date: ${new Date(reportDate).toLocaleDateString('en-GB')}`, 150, yPos);
    yPos += 8;
    doc.line(20, yPos, 190, yPos);
    yPos += 8;

    // Table headers
    const headers = ['#', 'Client Name', 'Phone', 'Current Principal (KES)', 'Interest Owed (KES)', 'Comments'];
    const colWidths = [10, 50, 30, 35, 35, 40];
    let startX = 20;
    doc.setFillColor(...COLORS.primaryBlue);
    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.rect(startX, yPos, 170, 8, 'F');
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x + 2, yPos + 5.5);
      x += colWidths[i];
    });
    yPos += 8;

    // Table rows
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'normal');
    clients.forEach((client, idx) => {
      const rowHeight = 25; // Enough for multi-line comment
      if (yPos + rowHeight > 270) {
        doc.addPage();
        addWatermark(doc);
        yPos = 20;
        // Re-draw header
        doc.setFillColor(...COLORS.primaryBlue);
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.rect(startX, yPos, 170, 8, 'F');
        x = startX;
        headers.forEach((h, i) => {
          doc.text(h, x + 2, yPos + 5.5);
          x += colWidths[i];
        });
        yPos += 8;
        doc.setTextColor(...COLORS.textDark);
        doc.setFont('helvetica', 'normal');
      }
      if (idx % 2 === 0) {
        doc.setFillColor(...COLORS.border);
        doc.rect(startX, yPos, 170, rowHeight, 'F');
      }
      x = startX;
      doc.text((idx+1).toString(), x + 2, yPos + 15);
      x += colWidths[0];
      doc.text(client.client_name, x + 2, yPos + 15);
      x += colWidths[1];
      doc.text(client.phone, x + 2, yPos + 15);
      x += colWidths[2];
      doc.text(client.current_principal.toLocaleString(), x + 2, yPos + 15);
      x += colWidths[3];
      doc.text(client.unpaid_interest.toLocaleString(), x + 2, yPos + 15);
      x += colWidths[4];
      // Wrap comment into multiple lines
      const commentLines = doc.splitTextToSize(client.comment || '', colWidths[5] - 4);
      let commentY = yPos + 4.5;
      commentLines.forEach(line => {
        doc.text(line, x + 2, commentY);
        commentY += 4.5;
      });
      yPos += rowHeight;
    });

    // Signature section
    yPos += 15;
    if (yPos > 270) {
      doc.addPage();
      addWatermark(doc);
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Prepared by:', 20, yPos);
    doc.text(`${user?.username} (${user?.role})`, 50, yPos);
    doc.text('Signature: ___________________', 120, yPos);
    yPos += 15;
    doc.text('Approved by Director:', 20, yPos);
    doc.text('Signature: ___________________', 80, yPos);
    doc.text('Date: ___________________', 150, yPos);
    yPos += 15;
    // Stamp box
    const stampBoxWidth = 50;
    const stampBoxHeight = 30;
    const stampBoxX = (210 - stampBoxWidth) / 2;
    const stampBoxY = yPos;
    doc.setDrawColor(200,200,200);
    doc.roundedRect(stampBoxX, stampBoxY, stampBoxWidth, stampBoxHeight, 2, 2);
    doc.setTextColor(150,150,150);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('COMPANY STAMP', stampBoxX + stampBoxWidth/2, stampBoxY + stampBoxHeight/2, { align: 'center' });

    addFooter(doc, yPos + stampBoxHeight + 10);
    addPageNumbers(doc, 'page %d');

    if (download) {
      doc.save(`Weekly_Report_${user.username}_${reportDate}.pdf`);
    } else {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    }
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>;

  return (
    <div className="reports-panel">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h4 className="mb-0">📋 Weekly Client Reports</h4>
          <div>
            <input type="date" className="form-control form-control-sm bg-light" value={reportDate} onChange={e => setReportDate(e.target.value)} />
          </div>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered table-hover">
              <thead className="table-light">
                <tr>
                  <th>#</th><th>Client Name</th><th>Phone</th><th>Current Principal (KES)</th><th>Interest Owed (KES)</th><th>Comments / Follow-up Notes</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client, idx) => (
                  <tr key={client.id}>
                    <td>{idx+1}</td>
                    <td>{client.client_name}</td>
                    <td>{client.phone}</td>
                    <td>{client.current_principal.toLocaleString()}</td>
                    <td>{client.unpaid_interest.toLocaleString()}</td>
                    <td>
                      <textarea
                        className="form-control"
                        rows="2"
                        value={editingComment[client.id] !== undefined ? editingComment[client.id] : client.comment || ''}
                        onChange={(e) => handleCommentChange(client.id, e.target.value)}
                        placeholder="Enter follow-up notes..."
                      />
                    </td>
                    <td className="text-center align-middle">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => saveComment(client.id)}
                        disabled={saving[client.id]}
                      >
                        {saving[client.id] ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-save"></i>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-between mt-4">
            <div>
              <button className="btn btn-secondary me-2" onClick={loadDraft}><i className="fas fa-undo"></i> Load Draft</button>
              <button className="btn btn-outline-secondary me-2" onClick={saveDraftToLocal}><i className="fas fa-save"></i> Save Draft</button>
              <button className="btn btn-outline-danger" onClick={clearDraft}><i className="fas fa-trash"></i> Clear Draft</button>
            </div>
            <div>
              <button className="btn btn-info me-2" onClick={() => generatePDF(false)}><i className="fas fa-eye"></i> Preview Report</button>
              <button className="btn btn-success" onClick={() => generatePDF(true)}><i className="fas fa-download"></i> Download Report</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPanel;