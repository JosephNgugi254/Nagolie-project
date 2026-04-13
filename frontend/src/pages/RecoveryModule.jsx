// pages/RecoveryModule.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { recoveryAPI } from '../services/api';
import { userAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useSessionTimeout } from '../components/hooks/useSessionTimeout';
import { generateTransactionReceipt, generateClientStatement,generateLoanAgreementPDF,generateInvestorAgreementPDF, generateInvestorStatementPDF, generateInvestorTransactionReceipt, generateManualLoanAgreementPDF, generateProposalPDF,generateNextOfKinConsentPDF, generateManualNextOfKinConsentPDF, generateLoanRenewalAgreementAutoPDF, generateManualLoanRenewalAgreementPDF } from "../components/admin/ReceiptPDF";
import RecoverySidebar from '../components/recovery/RecoverySidebar';
import Toast, { showToast } from '../components/common/Toast';
import PaymentModal from '../components/recovery/PaymentModal';
import CommentBox from '../components/recovery/CommentBox';
import ChatList from '../components/recovery/ChatList';
import ChatWindow from '../components/recovery/ChatWindow';
import Modal from '../components/common/Modal';
import TakeActionModal from '../components/recovery/TakeActionModal';


const DAYS_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MAX_CHAT_WINDOWS = 4;
const CHAT_WINDOW_WIDTH = 360;
const CHAT_WINDOW_GAP   = 12;

function RecoveryModule() {
  const { user, userRole, isAuthenticated, logout, loading: authLoading, updateUserData } = useAuth();
  const navigate = useNavigate();
  useSessionTimeout(logout, isAuthenticated, userRole);


  // ---------- STATE ----------
  const [loading,         setLoading]         = useState(true);
  const [data,            setData]            = useState({});
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [selectedLoan,    setSelectedLoan]    = useState(null);
  const [showPaymentModal,setShowPaymentModal] = useState(false);
  const [showCommentBox,  setShowCommentBox]  = useState(false);
  const [showChatList,    setShowChatList]    = useState(false);
  const [openChatWindows, setOpenChatWindows] = useState([]);
  const [unreadCount,     setUnreadCount]     = useState(0);
  const [windowWidth,     setWindowWidth]     = useState(window.innerWidth);
  const [commentUnreads,  setCommentUnreads]  = useState({});
  const [audio,           setAudio]           = useState(null);
  const prevCounts = useRef({});


  const [showTakeActionModal, setShowTakeActionModal] = useState(false);
  const [selectedLoanForAction, setSelectedLoanForAction] = useState(null);

  const handleTakeAction = (loan) => {
    setSelectedLoanForAction(loan);
    setShowTakeActionModal(true);
  };

  const handleSendReminder = (loan, message) => {
    // Open SMS app with pre-filled message
    const phone = loan.contacts;
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('254')) {
      formattedPhone = '+' + formattedPhone;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+254' + formattedPhone;
    }
    const smsUri = `sms:${formattedPhone}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUri;
  };

  const handleClaimOwnership = async (loan) => {
    try {
      await recoveryAPI.claimOwnership(loan.id);
      showToast.success('Livestock claimed successfully!');
      setShowTakeActionModal(false);
      fetchData(); // refresh the list
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Claim failed');
    }
  };

  // Renewal modal states
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [renewalLoan, setRenewalLoan] = useState(null);
  const [processingRenewal, setProcessingRenewal] = useState(false);

  const openRenewalModal = (loan) => {
    setRenewalLoan(loan);
    setShowRenewalModal(true);
  };


  // Settings Modal States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  // Password visibility toggles
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showUsernameCurrentPass, setShowUsernameCurrentPass] = useState(false);

  // Filter & sort
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [dayFilter, setDayFilter]   = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy]         = useState('name');
  const [sortOrder, setSortOrder]   = useState('asc');

  // Digital clock
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  // ---------- HANDLERS ----------
  const handleOpenSettings = () => {
    setShowSettingsModal(true);
    if (isMobile) setSidebarOpen(false);
  };

  const handleUsernameChange = async (e) => {
    e.preventDefault();
    setUsernameLoading(true);
    try {
      const response = await userAPI.changeUsername({
        new_username: usernameForm.newUsername,
        current_password: usernameForm.currentPassword
      });
      if (response.data.success) {
        showToast.success('Username updated successfully!');
        const updatedUser = { ...user, username: response.data.new_username };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        updateUserData(updatedUser);
        setUsernameForm({ newUsername: '', currentPassword: '' });
      }
    } catch (error) {
      showToast.error(error.response?.data?.error || 'Failed to update username');
    } finally {
      setUsernameLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast.error('New passwords do not match');
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await userAPI.changePassword({
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
        confirm_password: passwordForm.confirmPassword
      });
      if (response.data.success) {
        showToast.success('Password updated successfully! Please log in again.');
        setTimeout(() => handleLogout(), 3000);
      }
    } catch (error) {
      showToast.error(error.response?.data?.error || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const r = await logout();
      if (r.success) {
        showToast.success('Logged out');
        navigate('/login');
      }
    } catch (e) {
      showToast.error('Logout failed');
    }
  };

  // ---------- CLOCK FORMATTERS ----------
  const formatClockTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatClockDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // ---------- EFFECTS ----------
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const isMobile = windowWidth <= 991.98;

  // ========== FIXED BACK BUTTON HANDLER (prevents navigation) ==========
  useEffect(() => {
    window.history.replaceState({ recovery: true }, '', window.location.href);
    window.history.pushState({ recovery: true }, '', window.location.href);

    const handlePopState = (event) => {
      event.preventDefault();
      if (openChatWindows.length > 0) {
        setOpenChatWindows([]);
        window.history.replaceState({ recovery: true }, '', window.location.href);
      }
      window.history.pushState({ recovery: true }, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [openChatWindows.length]);

  // ---------- DATA FETCHING ----------
  const playSound = () => {
    if (!audio) {
      const a = new Audio('/notification-sound.mp3');
      setAudio(a);
      a.play().catch(() => {});
    } else {
      audio.play().catch(() => {});
    }
  };

  const fetchCommentUnreads = useCallback(async () => {
    try {
      const res = await recoveryAPI.getCommentUnreadCounts();
      const nc = res.data;
      let hasNew = false;
      Object.keys(nc).forEach(id => {
        if (nc[id] > (prevCounts.current[id] || 0)) hasNew = true;
      });
      if (hasNew) playSound();
      setCommentUnreads(nc);
      prevCounts.current = { ...nc };
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchData = async () => {
    try {
      const res = await recoveryAPI.getRecoveryData();
      setData(res.data);
    } catch (e) {
      console.error('Recovery data fetch error:', e);
      if (e.response?.status === 401) {
        // Token expired – logout will be handled by interceptor, but force redirect
        logout();
        navigate('/login');
      } else {
        showToast.error('Failed to load recovery data');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await recoveryAPI.getUnreadCount();
      setUnreadCount(prev => {
        if (res.data.count > prev) playSound();
        return res.data.count;
      });
      document.title = res.data.count > 0 ? `(${res.data.count}) Nagolie Recovery` : 'Nagolie Recovery';
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    const allowed = ['director','secretary','accountant','valuer','head_of_it'];
    if (userRole && !allowed.includes(userRole)) {
      // Only redirect to admin if the user is an admin, otherwise logout
      if (userRole === 'admin') {
        navigate('/admin');
      } else {
        logout();
        navigate('/login');
      }
      return;
    }
    if (!userRole) return;

    fetchData();
    fetchUnreadCount();
    fetchCommentUnreads();

    const i1 = setInterval(fetchUnreadCount, 5000);
    const i2 = setInterval(fetchCommentUnreads, 5000);

    return () => {
      clearInterval(i1);
      clearInterval(i2);
    };
  }, [authLoading, isAuthenticated, userRole, navigate, fetchCommentUnreads, logout]);

  const handleDefaulter = async (loanId, mark) => {
    try {
      mark ? await recoveryAPI.markDefaulter(loanId) : await recoveryAPI.resolveDefaulter(loanId);
      showToast.success(mark ? 'Marked as defaulter' : 'Defaulter resolved');
      fetchData();
    } catch (e) {
      showToast.error(e.response?.data?.error || 'Action failed');
    }
  };

  const handleSelectUser = (u) => {
    if (openChatWindows.some(w => w.id === u.id)) return;
    if (isMobile) {
      setOpenChatWindows([u]);
      return;
    }
    if (openChatWindows.length >= MAX_CHAT_WINDOWS) {
      showToast.info('Max chat windows open');
      return;
    }
    setOpenChatWindows(prev => [...prev, u]);
  };

  const getChatStyle = (i) => isMobile
    ? { position:'fixed', top:0, left:0, width:'100vw', height:'100vh', zIndex:1050+i, borderRadius:0 }
    : { position:'fixed', bottom:20, left:20+i*(CHAT_WINDOW_WIDTH+CHAT_WINDOW_GAP), width:`${CHAT_WINDOW_WIDTH}px`, height:'500px', zIndex:1050+i };

  const fmt = (v) => new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(v)||0);
  const fmtDate = (s) => {
    if (!s) return 'N/A';
    try { return new Date(s).toLocaleDateString('en-KE',{year:'numeric',month:'short',day:'numeric'}); }
    catch { return 'N/A'; }
  };

  const getDaysBadge = (loan) => {
    const d = loan.days_left;
    if (d === null || d === undefined) return null;
    if (d < 0)  return { text: `Overdue ${Math.ceil(Math.abs(d)/7)}w`, cls: 'bg-danger' };
    if (d === 0) return { text: 'Due Today', cls: 'bg-warning text-dark' };
    if (d <= 2)  return { text: `${d}d left`, cls: 'bg-warning text-dark' };
    return { text: `${d}d left`, cls: 'bg-success' };
  };

  // ---------- FILTERING & SORTING ----------
  const filterAndSortLoans = (loans) => {
    let filtered = [...loans];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(loan =>
        loan.name.toLowerCase().includes(term) ||
        (loan.collateral && loan.collateral.toLowerCase().includes(term)) ||
        (loan.id_number && loan.id_number.toLowerCase().includes(term)) ||
        (loan.contacts && loan.contacts.toLowerCase().includes(term))
      );
    }
    if (planFilter !== 'all') {
      filtered = filtered.filter(loan => loan.repayment_plan === planFilter);
    }
    if (dateFilter) {
      filtered = filtered.filter(loan => {
        if (!loan.disbursement_date) return false;
        const loanDate = new Date(loan.disbursement_date).toISOString().split('T')[0];
        return loanDate === dateFilter;
      });
    }
    filtered.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'date':
          valA = a.disbursement_date ? new Date(a.disbursement_date) : 0;
          valB = b.disbursement_date ? new Date(b.disbursement_date) : 0;
          break;
        case 'principal':
          valA = a.current_principal;
          valB = b.current_principal;
          break;
        case 'balance':
          valA = a.accrued_interest;
          valB = b.accrued_interest;
          break;
        default:
          valA = a.name;
          valB = b.name;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  };

  const getFilteredData = () => {
    if (dayFilter === 'all') {
      const newData = {};
      for (const day of DAYS_ORDER) {
        if (data[day] && data[day].length) {
          newData[day] = filterAndSortLoans(data[day]);
        }
      }
      return newData;
    } else {
      return { [dayFilter]: filterAndSortLoans(data[dayFilter] || []) };
    }
  };

  const filteredData = getFilteredData();

  const dayTotals = (loans) => loans.reduce((acc, l) => ({
    principal:   acc.principal   + (l.principal_amount || 0),
    curPrincipal:acc.curPrincipal+ (l.current_principal|| 0),
    interest:    acc.interest    + (l.interest         || 0),
    accrued:     acc.accrued     + (l.accrued_interest || 0),
  }), { principal:0, curPrincipal:0, interest:0, accrued:0 });

  const overall = () => {
    let total = { principal:0, curPrincipal:0, interest:0, accrued:0 };
    Object.values(data).forEach(loans => {
      const d = dayTotals(loans);
      total.principal    += d.principal;
      total.curPrincipal += d.curPrincipal;
      total.interest     += d.interest;
      total.accrued      += d.accrued;
    });
    return total;
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>;

  const mobileChat = isMobile && openChatWindows.length > 0;

  // ---------- JSX (full original with settings modal) ----------
  return (
    <div>
      <Toast />

      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container-fluid">
          <a className="navbar-brand d-flex align-items-center" href="#">
            <img src="/logo.png" alt="Nagolie" height="30" className="me-2"
                 onError={(e) => { e.target.style.display='none'; }} />
            <span className="d-none d-lg-inline">Nagolie Recovery Module</span>
            <span className="d-lg-none">Recovery</span>
          </a>

          <div className="navbar-nav ms-auto d-none d-lg-flex flex-row align-items-center gap-3">
            <span className="navbar-text text-white">Welcome, <strong>{user?.username || user?.name || 'User'}</strong></span>
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt me-1"></i>Logout
            </button>
          </div>
          <button className="navbar-toggler ms-auto" type="button" onClick={() => setSidebarOpen(s => !s)}>
            <span className="navbar-toggler-icon"></span>
          </button>
        </div>
      </nav>

      {sidebarOpen && (
        <div className="d-lg-none bg-primary text-white px-3 py-2">
          <div className="d-flex align-items-center justify-content-between">
            <span className="small">Welcome, <strong>{user?.username || 'User'}</strong></span>
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt me-1"></i>Logout
            </button>
          </div>
        </div>
      )}

      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {!mobileChat && (
        <div className="container-fluid">
          <div className="row">
            <div className={`col-md-3 col-lg-2 sidebar ${sidebarOpen ? 'show' : ''}`}>
              <RecoverySidebar
                activeSection="recovery"
                onSectionChange={() => {}}
                onLogout={handleLogout}
                isMobile={sidebarOpen}
                onToggleInbox={() => { setShowChatList(s => !s); setSidebarOpen(false); }}
                unreadCount={unreadCount}
                onOpenSettings={handleOpenSettings}
              />
            </div>

            <div className="col-md-9 col-lg-10 main-content">
              {/* Desktop digital clock */}
              <div className="d-none d-md-flex justify-content-center mb-3">
                <div className="digital-clock">
                  <div className="clock-date"><i className="fas fa-calendar-alt me-2"></i>{formatClockDate(currentDateTime)}</div>
                  <div className="clock-time"><i className="fas fa-clock me-2"></i>{formatClockTime(currentDateTime)}</div>                  
                </div>
              </div>

              {/* Mobile clock */}
              <div className="d-md-none text-center pb-2">
                <div className="mobile-clock">                  
                  <span><i className="fas fa-calendar-alt me-2"></i>{formatClockDate(currentDateTime)}</span>
                  <span className="mx-1"></span>
                  <span><i className="fas fa-clock me-2"></i>{formatClockTime(currentDateTime)}</span>
                </div>
              </div>

              {/* ---------- FILTERS & SORT BAR (icons only, no emojis) ---------- */}
              <div className="card mb-4 shadow-sm">
                <div className="card-body">
                  <div className="row g-3 align-items-end">
                    <div className="col-md-3">
                      <label className="form-label small fw-bold"><i className="fas fa-search me-1"></i> Search</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Name, Collateral, ID, Contact"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small fw-bold"><i className="fas fa-calendar-week me-1"></i> Payment Plan</label>
                      <select className="form-select" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small fw-bold"><i className="fas fa-sun me-1"></i> Day</label>
                      <select className="form-select" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
                        <option value="all">All Days</option>
                        {DAYS_ORDER.map(day => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small fw-bold"><i className="fas fa-calendar-alt me-1"></i> Borrowed Date</label>
                      <input type="date" className="form-control" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-bold"><i className="fas fa-sort-amount-down me-1"></i> Sort by</label>
                      <div className="input-group">
                        <select className="form-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                          <option value="name">Name</option>
                          <option value="date">Borrowed Date</option>
                          <option value="principal">Current Principal</option>
                          <option value="balance">Accrued Interest</option>
                        </select>
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        >
                          {sortOrder === 'asc' ? <i className="fas fa-arrow-up"></i> : <i className="fas fa-arrow-down"></i>}
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Clear filters button */}
                  {(searchTerm || planFilter !== 'all' || dayFilter !== 'all' || dateFilter || sortBy !== 'name') && (
                    <div className="mt-3 text-end">
                      <button className="btn btn-sm btn-outline-danger" onClick={() => {
                        setSearchTerm('');
                        setPlanFilter('all');
                        setDayFilter('all');
                        setDateFilter('');
                        setSortBy('name');
                        setSortOrder('asc');
                      }}>
                        <i className="fas fa-times me-1"></i> Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {Object.keys(filteredData).length === 0 && (
                <div className="text-center py-5">
                  <i className="fas fa-filter fa-3x text-muted mb-3"></i>
                  <h5 className="text-muted">No loans match your filters</h5>
                </div>
              )}

              {DAYS_ORDER.map(day =>
                filteredData[day]?.length > 0 && (
                  <div key={day} className="card mb-4">
                    <div className="card-header bg-primary">
                      <h5 className="mb-0 text-white">{day}</h5>
                    </div>
                    <div className="card-body p-0">
                      <div className="table-responsive">
                        <table className="table table-hover mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Name</th>
                              <th>Collateral</th>
                              <th>ID Number</th>
                              <th>Contact</th>
                              <th>Borrowed Date</th>
                              <th>Initial Principal</th>
                              <th>Current Principal</th>
                              <th>Interest / Period</th>
                              <th>Accrued (Unpaid)</th>
                              <th>Week</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredData[day].map(loan => {
                              const badge = getDaysBadge(loan);
                              return (
                                <tr key={loan.id}
                                    className={loan.is_defaulter ? 'table-danger' : ''}>
                                  <td>
                                    <div>{loan.name}</div>
                                    <span className="badge me-1" style={{ backgroundColor: '#fff3cd', color: '#856404' }}>
                                      {loan.repayment_plan === 'daily' ? 'Daily' : 'Weekly'}
                                    </span>
                                    {badge && (
                                      <span className={`badge ${badge.cls}`}>
                                        {badge.text}
                                      </span>
                                    )}
                                  </td>
                                  <td>{loan.collateral}</td>
                                  <td>{loan.id_number}</td>
                                  <td>{loan.contacts}</td>
                                  <td>{fmtDate(loan.disbursement_date)}</td>
                                  <td>{fmt(loan.principal_amount)}</td>
                                  <td>{fmt(loan.current_principal)}</td>
                                  <td>{fmt(loan.interest)}</td>
                                  <td className="text-danger fw-bold">{fmt(loan.accrued_interest)}</td>
                                  <td>Week {loan.week}</td>
                                  <td>
                                    <div className="btn-group btn-group-sm">
                                      {['director','secretary','head_of_it'].includes(userRole) && (
                                        <button className="btn btn-outline-primary"
                                                onClick={() => { setSelectedLoan(loan); setShowPaymentModal(true); }}
                                                title="Process Payment">
                                          <i className="fas fa-money-bill-wave"></i>
                                        </button>
                                      )}

                                      <button className="btn btn-outline-success"
                                              onClick={() => { window.location.href = `tel:${loan.contacts}`; }}
                                              title="Call">
                                        <i className="fas fa-phone"></i>
                                      </button>

                                      <button className="btn btn-outline-info position-relative"
                                              onClick={() => { setSelectedLoan(loan); setShowCommentBox(true); }}
                                              title="Comments">
                                        <i className="fas fa-comment"></i>
                                        {commentUnreads[loan.id] > 0 && (
                                          <span className="badge bg-danger rounded-pill"
                                                style={{ position:'absolute', top:'-8px', right:'-8px' }}>
                                            {commentUnreads[loan.id]}
                                          </span>
                                        )}
                                      </button>

                                      {/* Take Action button – visible when days_left <= 1 */}
                                      {loan.days_left <= 1 && (
                                        <button
                                          className="btn btn-outline-danger btn-sm"
                                          onClick={() => handleTakeAction(loan)}
                                          title="Take Action (Reminder/Claim)"
                                        >
                                          <i className="fas fa-bolt"></i>
                                        </button>
                                      )}

                                      {['director','secretary','head_of_it'].includes(userRole) && loan.days_left <= 0 && (
                                        <button 
                                        className="btn btn-outline-warning btn-sm"
                                        onClick={() => openRenewalModal(loan)}
                                        title="Renew Loan"
                                        >
                                          <i className="fas fa-sync-alt"></i>
                                        </button>
                                      )}

                                      {['director','secretary','head_of_it'].includes(userRole) && (
                                        <button
                                          className={`btn btn-outline-${loan.is_defaulter ? 'warning' : 'danger'}`}
                                          onClick={() => handleDefaulter(loan.id, !loan.is_defaulter)}
                                          title={loan.is_defaulter ? 'Resolve' : 'Mark Defaulter'}>
                                          <i className={`fas fa-${loan.is_defaulter ? 'check' : 'flag'}`}></i>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="table-secondary fw-bold">
                            {(() => {
                              const t = dayTotals(filteredData[day]);
                              return (
                                <tr>
                                  <td colSpan="5">Day Totals</td>
                                  <td>{fmt(t.principal)}</td>
                                  <td>{fmt(t.curPrincipal)}</td>
                                  <td>{fmt(t.interest)}</td>
                                  <td className="text-danger">{fmt(t.accrued)}</td>
                                  <td colSpan="2"></td>
                                </tr>
                              );
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              )}

              {Object.keys(filteredData).length > 0 && (() => {
                const t = overall();
                return (
                  <div className="card mt-2 mb-4">
                    <div className="card-header bg-dark">
                      <h5 className="mb-0 text-white">Overall Totals</h5>
                    </div>
                    <div className="card-body">
                      <div className="row text-center">
                        <div className="col-md-3">
                          <p className="mb-1 text-muted fw-bold">Initial Principal</p>
                          <h5>{fmt(t.principal)}</h5>
                        </div>
                        <div className="col-md-3">
                          <p className="mb-1 text-muted fw-bold">Current Principal</p>
                          <h5>{fmt(t.curPrincipal)}</h5>
                        </div>
                        <div className="col-md-3">
                          <p className="mb-1 text-muted fw-bold">Periodic Interest</p>
                          <h5>{fmt(t.interest)}</h5>
                        </div>
                        <div className="col-md-3">
                          <p className="mb-1 text-muted fw-bold">Accrued (Unpaid)</p>
                          <h5 className="text-danger">{fmt(t.accrued)}</h5>
                        </div>
                      </div>
                      <div className="row mt-3 pt-2 border-top text-center">
                        <div className="col-12">
                          <p className="mb-1 text-muted fw-bold">
                            Total Owed (Current Principal + Accrued Interest)
                          </p>
                          <h3 className="text-primary">{fmt(t.curPrincipal + t.accrued)}</h3>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <ChatList isOpen={showChatList} onClose={() => setShowChatList(false)}
                onSelectUser={handleSelectUser} />

      {openChatWindows.map((cu, i) => (
        <ChatWindow key={cu.id} user={cu} onClose={() => setOpenChatWindows(prev => prev.filter(w => w.id !== cu.id))}
                    onNewMessage={fetchUnreadCount} style={getChatStyle(i)} />
      ))}

      {showPaymentModal && selectedLoan && (
        <PaymentModal
          loan={selectedLoan}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            fetchData();
          }}
        />
      )}

      {showCommentBox && selectedLoan && (
        <CommentBox loanId={selectedLoan.id} onClose={() => setShowCommentBox(false)} />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Account Settings" size="md">
          {/* Change Username Section */}
          <div className="mb-4">
            <h6 className="mb-3 fw-bold fs-5 text-center">Change Username</h6>
            <form onSubmit={handleUsernameChange}>
              <div className="mb-3">
                <label className="form-label">Current Username</label>
                <input type="text" className="form-control" value={user?.username || ''} disabled readOnly />
              </div>
              <div className="mb-3">
                <label className="form-label">New Username</label>
                <input
                  type="text"
                  className="form-control"
                  value={usernameForm.newUsername}
                  onChange={(e) => setUsernameForm({ ...usernameForm, newUsername: e.target.value })}
                  required
                  minLength="3"
                  placeholder="Enter new username"
                />
                <small className="text-muted">Username must be at least 3 characters</small>
              </div>
              <div className="mb-3">
                <label className="form-label">Current Password</label>
                <div className="input-group">
                  <input
                    type={showUsernameCurrentPass ? "text" : "password"}
                    className="form-control"
                    value={usernameForm.currentPassword}
                    onChange={(e) => setUsernameForm({ ...usernameForm, currentPassword: e.target.value })}
                    required
                    placeholder="Enter your current password"
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setShowUsernameCurrentPass(!showUsernameCurrentPass)}
                  >
                    <i className={`fas fa-${showUsernameCurrentPass ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={usernameLoading}>
                {usernameLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>Updating...</> : 'Update Username'}
              </button>
            </form>
          </div>
      
          <hr />
      
          {/* Change Password Section */}
          <div>
            <h6 className="mb-3 fw-bold fs-5 text-center">Change Password</h6>
            <form onSubmit={handlePasswordChange}>
              <div className="mb-3">
                <label className="form-label">Current Password</label>
                <div className="input-group">
                  <input
                    type={showCurrentPass ? "text" : "password"}
                    className="form-control"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    required
                    placeholder="Enter current password"
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                  >
                    <i className={`fas fa-${showCurrentPass ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <div className="input-group">
                  <input
                    type={showNewPass ? "text" : "password"}
                    className="form-control"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    required
                    minLength="6"
                    placeholder="Enter new password (min 6 characters)"
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                  >
                    <i className={`fas fa-${showNewPass ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <div className="input-group">
                  <input
                    type={showConfirmPass ? "text" : "password"}
                    className="form-control"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    required
                    placeholder="Confirm new password"
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                  >
                    <i className={`fas fa-${showConfirmPass ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-warning" disabled={passwordLoading}>
                {passwordLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>Updating...</> : 'Update Password'}
              </button>
            </form>
          </div>
        </Modal>
      )}

      {/* Take action modal */}
      {showTakeActionModal && selectedLoanForAction && (
        <TakeActionModal
          loan={selectedLoanForAction}
          onClose={() => {
            setShowTakeActionModal(false);
            setSelectedLoanForAction(null);
          }}
          onSendReminder={handleSendReminder}
          onClaimOwnership={handleClaimOwnership}
        />
      )}

      {/* Loan Renewal Modal */}
      {showRenewalModal && renewalLoan && (
        <Modal
          isOpen={showRenewalModal}
          onClose={() => {
            setShowRenewalModal(false);
            setRenewalLoan(null);
          }}
          title="Loan Renewal"
          size="md"
        >
          <div className="mb-3">
            <p><strong>Client:</strong> {renewalLoan.name}</p>
            <p><strong>Current Balance:</strong> {fmt(renewalLoan.current_principal + renewalLoan.accrued_interest)}</p>
            <p><strong>New Principal after Renewal:</strong> {fmt(renewalLoan.current_principal + renewalLoan.accrued_interest)}</p>
            <p><strong>Repayment Plan:</strong> {renewalLoan.repayment_plan === 'daily' ? 'Daily (4.5% simple)' : 'Weekly (30% compound)'}</p>
            <p><strong>Interest continues on new principal at same rate.</strong></p>
          </div>
          <div className="alert alert-warning">
            <i className="fas fa-file-pdf me-2"></i>
            You must download and have the client sign the renewal agreement before processing.
          </div>
          <div className="d-flex gap-2 justify-content-between">
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  // Build a loanData object compatible with generateLoanRenewalAgreementAutoPDF
                  const outstanding = renewalLoan.current_principal + renewalLoan.accrued_interest;
                  const loanData = {
                    name: renewalLoan.name,
                    idNumber: renewalLoan.id_number,
                    phone: renewalLoan.contacts,
                    borrowedAmount: renewalLoan.principal_amount,
                    expectedReturnDate: renewalLoan.disbursement_date,
                    balance: outstanding,
                    repayment_plan: renewalLoan.repayment_plan,
                  };
                  await generateLoanRenewalAgreementAutoPDF(loanData, outstanding);
                  showToast.success("Renewal agreement downloaded. Have client sign it.");
                } catch (err) {
                  console.error(err);
                  showToast.error("Failed to download agreement");
                }
              }}
            >
              <i className="fas fa-download me-2"></i>Download Agreement
            </button>
            <button
              className="btn btn-success"
              onClick={async () => {
                setProcessingRenewal(true);
                try {
                  const response = await recoveryAPI.renewLoan(renewalLoan.id);
                  if (response.data.success) {
                    showToast.success(`Loan renewed! New loan ID: ${response.data.new_loan.id}`);
                    setShowRenewalModal(false);
                    fetchData(); // refresh table
                  }
                } catch (error) {
                  showToast.error(error.response?.data?.error || "Renewal failed");
                } finally {
                  setProcessingRenewal(false);
                }
              }}
              disabled={processingRenewal}
            >
              {processingRenewal ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</> : "Confirm Renewal"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowRenewalModal(false)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default RecoveryModule;