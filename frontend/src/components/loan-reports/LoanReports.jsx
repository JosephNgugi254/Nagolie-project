// components/loan-reports/LoanReports.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import { generateOfficerReportPDF } from '../admin/ReceiptPDF';

const LoanReports = () => {
  const { user } = useAuth();
  const [officers, setOfficers] = useState([]);
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [dayAssignments, setDayAssignments] = useState([]);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const fetchUsersAndAssignments = async () => {
      try {
        const [officersRes, assignmentsRes] = await Promise.all([
          adminAPI.getOfficers(),
          adminAPI.getDayAssignments()
        ]);
        const officersData = officersRes.data;
        setOfficers(officersData);
        setDayAssignments(assignmentsRes.data);

        const firstOfficer = officersData.find(o => o.role !== 'valuer');
        if (firstOfficer) {
          setSelectedOfficerId(firstOfficer.id);
        }
      } catch (error) {
        showToast.error('Failed to load officers or assignments');
      }
    };
    fetchUsersAndAssignments();
  }, [user]);

  useEffect(() => {
    if (!user || !selectedOfficerId || !reportDate) return;
    fetchReport();
  }, [user, selectedOfficerId, reportDate]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getOfficerReport(selectedOfficerId, reportDate);
      setClients(res.data);
    } catch (error) {
      showToast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const res = await adminAPI.clientAssignmentSearch(searchTerm);
      setSearchResults(res.data);
    } catch (error) {
      showToast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const generatePDF = async (download = true) => {
    const selectedOfficer = officers.find(o => o.id === parseInt(selectedOfficerId));
    if (!selectedOfficer) {
      showToast.error('No officer selected');
      return;
    }
    const officerAssignments = dayAssignments.find(d => d.id === selectedOfficer.id);
    const assignedDays = officerAssignments?.days || [];
    const daysMap = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const assignedDaysString = assignedDays.map(d => daysMap[d]).join(', ');
    await generateOfficerReportPDF(clients, selectedOfficer, reportDate, assignedDaysString, download);
  };

  const formatCurrency = (val) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(val);

  return (
    <div className="content-section">
      <h2>📋 Loan Reports</h2>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label">Officer</label>
              <select
                className="form-select"
                value={selectedOfficerId}
                onChange={(e) => setSelectedOfficerId(e.target.value)}
              >
                {officers.filter(o => o.role !== 'valuer').map(o => (
                  <option key={o.id} value={o.id}>{o.username} ({o.role})</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Report Date</label>
              <input
                type="date"
                className="form-control"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
            <div className="col-md-3 d-flex gap-2">
              <button className="btn btn-info" onClick={() => generatePDF(false)}>
                <i className="fas fa-eye me-2"></i>Preview
              </button>
              <button className="btn btn-success" onClick={() => generatePDF(true)}>
                <i className="fas fa-download me-2"></i>Download
              </button>
            </div>
            <div className="col-md-2 text-end">
              <button className="btn btn-outline-primary" onClick={() => setShowSearch(!showSearch)}>
                <i className="fas fa-search me-2"></i>Client Lookup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Client Assignment Search Section – now appears above the table */}
      {showSearch && (
        <div className="card mt-4">
          <div className="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
            <h5 className="mb-0">🔍 Client Assignment Lookup</h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={() => setShowSearch(false)}
              aria-label="Close"
            ></button>
          </div>
          <div className="card-body">
            <div className="input-group mb-3">
              <input
                type="text"
                className="form-control"
                placeholder="Search by client name or ID number..."
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  if (!value.trim()) {
                    setSearchResults([]);
                    return;
                  }
                  if (searchTimeoutRef.current) {
                    clearTimeout(searchTimeoutRef.current);
                  }
                  setSearching(true);
                  searchTimeoutRef.current = setTimeout(() => {
                    handleSearch();
                  }, 400);
                }}
              />
              <button
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={searching}
              >
                {searching ? <span className="spinner-border spinner-border-sm"></span> : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="table-responsive">
                <table className="table table-sm table-striped">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>ID Number</th>
                      <th>Phone</th>
                      <th>Loan ID</th>
                      <th>Assigned Officer</th>
                      <th>Role</th>
                      <th>Flagged?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={`${r.client_id}-${r.loan_id}`}>
                        <td>{r.client_name}</td>
                        <td>{r.id_number}</td>
                        <td>{r.phone}</td>
                        <td>{r.loan_id}</td>
                        <td><strong>{r.assigned_officer}</strong></td>
                        <td>{r.officer_role || '—'}</td>
                        <td>{r.is_flagged ? <span className="badge bg-danger">Flagged</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {searchTerm && !searching && searchResults.length === 0 && (
              <p className="text-muted">No clients found matching your search.</p>
            )}
          </div>
        </div>
      )}

      {/* Report Table */}
      {loading ? (
        <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
      ) : (
        <div className="table-responsive">
          <table className="table table-bordered table-hover">
            <thead className="table-light">
              <tr>
                <th>#</th>
                <th>Client Name</th>
                <th>Phone</th>
                <th>Current Principal (KES)</th>
                <th>Interest Owed (KES)</th>
                <th>Total Balance (KES)</th>
                <th>Comment / Notes</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client, idx) => (
                <tr key={client.loan_id}>
                  <td>{idx + 1}</td>
                  <td>{client.client_name}</td>
                  <td>{client.phone}</td>
                  <td>{formatCurrency(client.current_principal)}</td>
                  <td>{client.interest_rate === 0 ? 'waived' : formatCurrency(client.unpaid_interest)}</td>
                  <td>{formatCurrency(client.total_balance)}</td>
                  <td>{client.comment || '—'}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan="7" className="text-center text-muted">No data for this officer on this date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LoanReports;