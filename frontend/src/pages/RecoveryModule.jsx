// pages/RecoveryModule.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { recoveryAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import RecoverySidebar from '../components/recovery/RecoverySidebar';
import Toast, { showToast } from '../components/common/Toast';
import PaymentModal from '../components/recovery/PaymentModal';
import CommentBox from '../components/recovery/CommentBox';
import ChatList from '../components/recovery/ChatList';
import ChatWindow from '../components/recovery/ChatWindow';

const DAYS_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MAX_CHAT_WINDOWS = 4;
const CHAT_WINDOW_WIDTH = 360;
const CHAT_WINDOW_GAP   = 12;

function RecoveryModule() {
  const { user, userRole, isAuthenticated, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

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

  // ---------- FILTER & SORT STATE ----------
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [dayFilter, setDayFilter]   = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy]         = useState('name');
  const [sortOrder, setSortOrder]   = useState('asc');

  // ---------- CREATIVE DIGITAL CLOCK ----------
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  // ---------- FILTERING & SORTING (unchanged) ----------
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

  // ---------- EXISTING HOOKS (unchanged) ----------
  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const isMobile = windowWidth <= 991.98;

  const playSound = () => {
    if (!audio) {
      const a = new Audio('/notification-sound.mp3'); setAudio(a); a.play().catch(() => {});
    } else { audio.play().catch(() => {}); }
  };

  const fetchCommentUnreads = useCallback(async () => {
    try {
      const res = await recoveryAPI.getCommentUnreadCounts();
      const nc  = res.data;
      let hasNew = false;
      Object.keys(nc).forEach(id => { if (nc[id] > (prevCounts.current[id] || 0)) hasNew = true; });
      if (hasNew) playSound();
      setCommentUnreads(nc);
      prevCounts.current = { ...nc };
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated()) { navigate('/login'); return; }
    const allowed = ['director','secretary','accountant','valuer'];
    if (userRole && !allowed.includes(userRole)) { navigate('/admin'); return; }
    if (!userRole) return;

    fetchData();
    fetchUnreadCount();
    fetchCommentUnreads();
    const i1 = setInterval(fetchUnreadCount, 5000);
    const i2 = setInterval(fetchCommentUnreads, 5000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [authLoading, isAuthenticated, userRole, navigate, fetchCommentUnreads]);

  const fetchData = async () => {
    try {
      const res = await recoveryAPI.getRecoveryData();
      setData(res.data);
    } catch (e) {
      showToast.error('Failed to load recovery data');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await recoveryAPI.getUnreadCount();
      setUnreadCount(prev => { if (res.data.count > prev) playSound(); return res.data.count; });
      document.title = res.data.count > 0 ? `(${res.data.count}) Nagolie Recovery` : 'Nagolie Recovery';
    } catch (e) { console.error(e); }
  };

  const handleDefaulter = async (loanId, mark) => {
    try {
      mark ? await recoveryAPI.markDefaulter(loanId) : await recoveryAPI.resolveDefaulter(loanId);
      showToast.success(mark ? 'Marked as defaulter' : 'Defaulter resolved');
      fetchData();
    } catch (e) { showToast.error(e.response?.data?.error || 'Action failed'); }
  };

  const handleSelectUser = (u) => {
    if (openChatWindows.some(w => w.id === u.id)) return;
    if (isMobile) { setOpenChatWindows([u]); return; }
    if (openChatWindows.length >= MAX_CHAT_WINDOWS) { showToast.info('Max chat windows open'); return; }
    setOpenChatWindows(prev => [...prev, u]);
  };

  const handleLogout = async () => {
    try {
      const r = await logout();
      if (r.success) { showToast.success('Logged out'); navigate('/login'); }
    } catch (e) { showToast.error('Logout failed'); }
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
    if (d === 0) return { text: 'Due Today',                            cls: 'bg-warning text-dark' };
    if (d <= 2)  return { text: `${d}d left`,                           cls: 'bg-warning text-dark' };
    return              { text: `${d}d left`,                           cls: 'bg-success' };
  };

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

  return (
    <div>
      <Toast />

      {/* Navbar with animated digital clock */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container-fluid">
          <a className="navbar-brand d-flex align-items-center" href="#">
            <img src="/logo.png" alt="Nagolie" height="30" className="me-2"
                 onError={(e) => { e.target.style.display='none'; }} />
            <span className="d-none d-lg-inline">Nagolie Recovery Module</span>
            <span className="d-lg-none">Recovery</span>
          </a>

          <div className="navbar-nav ms-auto d-none d-lg-flex flex-row align-items-center gap-3">
            <span className="navbar-text text-white">
              Welcome, <strong>{user?.username || user?.name || 'User'}</strong>
            </span>
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt me-1"></i>Logout
            </button>
          </div>
          <button className="navbar-toggler ms-auto" type="button"
                  onClick={() => setSidebarOpen(s => !s)}>
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

      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`}
           onClick={() => setSidebarOpen(false)} />

      {!mobileChat && (
        <div className="container-fluid">
          <div className="row">
            <div className={`col-md-3 col-lg-2 sidebar ${sidebarOpen ? 'show' : ''}`}>
              <RecoverySidebar
                activeSection="recovery" onSectionChange={() => {}} onLogout={handleLogout}
                isMobile={sidebarOpen}
                onToggleInbox={() => { setShowChatList(s => !s); setSidebarOpen(false); }}
                unreadCount={unreadCount}
              />
            </div>

            <div className="col-md-9 col-lg-10 main-content">
              {/* Desktop digital clock */}
              <div className="d-none d-md-flex justify-content-center mb-3">
                <div className="digital-clock">
                  <div className="clock-time">
                    <i className="fas fa-clock me-2"></i>
                    {formatClockTime(currentDateTime)}
                  </div>
                  
                  <div className="clock-date">
                    <i className="fas fa-calendar-alt me-2"></i>
                    {formatClockDate(currentDateTime)}
                  </div>
                </div>
              </div>

              {/* Mobile clock */}
              <div className="d-md-none text-center pb-2">
                <div className="mobile-clock">
                  <span>{formatClockTime(currentDateTime)}</span>
                  <span className="mx-1"></span>
                  <span>{formatClockDate(currentDateTime)}</span>
                </div>
              </div>

              {/* ---------- FILTERS & SORT BAR (icons only, no emojis) ---------- */}
              <div className="card mb-4 shadow-sm">
                <div className="card-body">
                  <div className="row g-3 align-items-end">
                    <div className="col-md-3">
                      <label className="form-label small fw-bold">
                        <i className="fas fa-search me-1"></i> Search
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Name, Collateral, ID, Contact"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small fw-bold">
                        <i className="fas fa-calendar-week me-1"></i> Plan
                      </label>
                      <select className="form-select" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small fw-bold">
                        <i className="fas fa-sun me-1"></i> Day
                      </label>
                      <select className="form-select" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
                        <option value="all">All Days</option>
                        {DAYS_ORDER.map(day => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small fw-bold">
                        <i className="fas fa-calendar-alt me-1"></i> Borrowed Date
                      </label>
                      <input type="date" className="form-control" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-bold">
                        <i className="fas fa-sort-amount-down me-1"></i> Sort by
                      </label>
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
                                      {['director','secretary'].includes(userRole) && (
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
                                      {['director','secretary'].includes(userRole) && (
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
    </div>
  );
}

export default RecoveryModule;