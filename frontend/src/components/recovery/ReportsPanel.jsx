import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import { generateOfficerReportPDF } from '../admin/ReceiptPDF';

const ReportsPanel = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignedDaysString, setAssignedDaysString] = useState('');

  const fetchingRef = useRef(false);
  const saveTimeouts = useRef({});

  // Determine if the selected date is in the past (strictly before today)
  const isPastReport = (() => {
    const today = new Date().toISOString().split('T')[0];
    return reportDate < today;
  })();

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const res = await recoveryAPI.getReportAssignments(reportDate);
      setClients(res.data.clients);
      const daysMap = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const assignedDayNames = (res.data.assigned_days || []).map(d => daysMap[d]);
      setAssignedDaysString(assignedDayNames.join(', '));
    } catch (error) {
      showToast.error('Failed to load assigned clients');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [reportDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveComment = async (loanId, comment) => {
    // Do not save if the report is from a past date
    if (isPastReport) return;
    try {
      await recoveryAPI.saveReportComment(loanId, comment);
    } catch (error) {
      showToast.error('Failed to save comment');
    }
  };

  const handleCommentChange = (loanId, value) => {
    // Prevent any changes if report is from a past date
    if (isPastReport) return;

    setClients(prev =>
      prev.map(c => (c.loan_id === loanId ? { ...c, comment: value } : c))
    );
    if (saveTimeouts.current[loanId]) {
      clearTimeout(saveTimeouts.current[loanId]);
    }
    saveTimeouts.current[loanId] = setTimeout(() => {
      saveComment(loanId, value);
    }, 600);
  };

  const generatePDF = async (download = false) => {
    await generateOfficerReportPDF(clients, user, reportDate, assignedDaysString, download);
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>;

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  return (
    <div className="reports-panel">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h4 className="mb-0">
            📋 Daily Loan Reports
            <span className="ms-3 badge bg-light text-dark fs-6">
              {formatDisplayDate(reportDate)}
            </span>
          </h4>
          <div>
            <input
              type="date"
              className="form-control form-control-sm bg-light"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
            />
          </div>
        </div>
        <div className="card-body">
          {isPastReport && (
            <div className="alert alert-info mb-3">
              <i className="fas fa-info-circle me-2"></i>
              You are viewing a past report. Comments are read‑only.
            </div>
          )}
          <div className="table-responsive">
            <table className="table table-bordered table-hover">
              <thead className="table-light">
                <tr>
                  <th>#</th>
                  <th>Client Name</th>
                  <th>Phone</th>
                  <th>Current Principal (KES)</th>
                  <th>Interest Owed (KES)</th>
                  <th>Comments / Follow-up Notes</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client, idx) => {
                  const uniqueKey = client?.loan_id ? `client-${client.loan_id}` : `temp-${idx}`;
                  return (
                    <tr key={uniqueKey}>
                      <td>{idx + 1}</td>
                      <td>{client.client_name}</td>
                      <td>{client.phone}</td>
                      <td>{client.current_principal?.toLocaleString() ?? 0}</td>
                      <td>{client.interest_rate === 0 ? 'waived' : (client.unpaid_interest?.toLocaleString() ?? 0)}</td>
                      <td>
                        <textarea
                          className={`form-control ${isPastReport ? 'bg-light' : ''}`}
                          rows="2"
                          value={client.comment || ''}
                          onChange={(e) => handleCommentChange(client.loan_id, e.target.value)}
                          placeholder={isPastReport ? 'Past report – comments locked' : 'Enter follow-up notes...'}
                          readOnly={isPastReport}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="d-flex justify-content-end mt-4">
            <button className="btn btn-info me-2" onClick={() => generatePDF(false)}>
              <i className="fas fa-eye"></i> Preview Report
            </button>
            <button className="btn btn-success" onClick={() => generatePDF(true)}>
              <i className="fas fa-download"></i> Download Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPanel;