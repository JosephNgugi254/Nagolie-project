// pages/RecoveryModule.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { recoveryAPI } from '../services/api';
import { userAPI } from '../services/api';
import { adminAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useSessionTimeout } from '../components/hooks/useSessionTimeout';
import { io } from 'socket.io-client';
import { 
 generateTransactionReceipt,
 generateClientStatement,
 generateLoanAgreementPDF,
 generateLoanInvoicePDF,
 generateInvestorAgreementPDF,
 generateInvestorStatementPDF,
 generateInvestorTransactionReceipt,
 generateManualLoanAgreementPDF,
 generateNextOfKinConsentPDF,
 generateManualNextOfKinConsentPDF,
 generateLoanRenewalAgreementAutoPDF,
 generateManualLoanRenewalAgreementPDF,
 generateLoanWaiverAgreementAutoPDF } from "../components/admin/ReceiptPDF";
import RecoverySidebar from '../components/recovery/RecoverySidebar';
import Toast, { showToast } from '../components/common/Toast';
import PaymentModal from '../components/recovery/PaymentModal';
import CommentBox from '../components/recovery/CommentBox';
import ChatList from '../components/recovery/ChatList';
import ChatWindow from '../components/recovery/ChatWindow';
import Modal from '../components/common/Modal';
import ConfirmationDialog from '../components/common/ConfirmationDialog';
import TakeActionModal from '../components/recovery/TakeActionModal';
import AdminTakeActionModal from "../components/admin/TakeActionModal";
import UtilitiesPanel from '../components/utilities/UtilitiesPanel';
import { startRegistration } from '@simplewebauthn/browser';
import ReportsPanel from '../components/recovery/ReportsPanel';
import AdminCard from "../components/admin/AdminCard";
import AdminTable from "../components/admin/AdminTable";
import AdminCompanyGallery from "../components/admin/AdminCompanyGallery";
import ImageCarousel from "../components/common/ImageCarousel";
import LoanApprovalModal from "../components/admin/LoanApprovalModal";
import ShareLinkModal from "../components/admin/ShareLinkModal";
import imageCompression from 'browser-image-compression';
import { getStatusBadge } from '../components/admin/Clientstatusbadge';
import ReportManagement from '../components/admin/ReportManagement';
import ValuerPanel from '../components/recovery/ValuerPanel';
import LoanReports from '../components/loan-reports/LoanReports';
import SalaryManagement from '../components/director/SalaryManagement';
import UnifiedReportsTabs from '../components/admin/UnifiedReportsTabs';

import { CallProvider, useCall } from '../context/CallContext';
import IncomingCallModal from '../components/call/IncomingCallModal';
import CallScreen from '../components/call/CallScreen';
import FloatingCallWidget from '../components/call/FloatingCallWidget';
import AddParticipantModal from '../components/call/AddParticipantModal';
import CallContext from '../context/CallContext';

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MAX_CHAT_WINDOWS = 4;
const CHAT_WINDOW_WIDTH = 360;
const CHAT_WINDOW_GAP = 12;

function RecoveryModule() {
  const { user, userRole, isAuthenticated, logout, loading: authLoading, updateUserData } = useAuth();
  const navigate = useNavigate();
  useSessionTimeout(logout, isAuthenticated, userRole);


  const [branchFilter, setBranchFilter] = useState('all'); // 'all', 'isinya', 'emarti'
  const filterByBranch = (loans) => {
    if (branchFilter === 'all') return loans;
    return loans.filter(loan => {
      const loc = (loan.location || '').toLowerCase();
      if (branchFilter === 'emarti') {
        return loc.includes('emarti');
      }
      return !loc.includes('emarti');
    });
  };

  // socket states
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const socketRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL ||
    (window.location.hostname === 'localhost'
      ? 'http://localhost:5000/api'
      : 'https://nagolie-backend.onrender.com/api');    

  // ---------- Director / Utilities state ----------
  const [directorSection, setDirectorSection] = useState("recovery");
  const [showUtilities, setShowUtilities] = useState(false);

  // ---------- Original recovery state ----------
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  const [openChatWindows, setOpenChatWindows] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [commentUnreads, setCommentUnreads] = useState({});
  const [audio, setAudio] = useState(null);
  const prevCounts = useRef({});
  const [showTakeActionModal, setShowTakeActionModal] = useState(false);
  const [selectedLoanForAction, setSelectedLoanForAction] = useState(null);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [renewalLoan, setRenewalLoan] = useState(null);
  const [processingRenewal, setProcessingRenewal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showUsernameCurrentPass, setShowUsernameCurrentPass] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [renewalType, setRenewalType] = useState('renew');
  const [waiverAmount, setWaiverAmount] = useState(0);
  const [waiverDuration, setWaiverDuration] = useState(14);
  const [waiverProcessing, setWaiverProcessing] = useState(false);

  // ---------- Director dashboard data ----------
  const [dashboardData, setDashboardData] = useState({
    total_clients: 0, total_lent: 0, total_received: 0, total_revenue: 0,
    total_principal_paid: 0, available_funds: 0, due_today: [], overdue: []
  });
  const [applications, setApplications] = useState([]);
  const [approvedLoans, setApprovedLoans] = useState([]);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const prevPendingApplicationsRef = useRef(0);
  const [clients, setClients] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [paymentStats, setPaymentStats] = useState({
    payment_stats: [], total_principal_collected: 0,
    currently_lent: 0, available_for_lending: 0, revenue_collected: 0
  });
  const [livestock, setLivestock] = useState([]);
  const [livestockLoading, setLivestockLoading] = useState(false);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [approvedLoansLoading, setApprovedLoansLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [paymentStatsLoading, setPaymentStatsLoading] = useState(false);
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingDate, setPendingDate] = useState("");
  const [approvedSearch, setApprovedSearch] = useState("");
  const [approvedDate, setApprovedDate] = useState("");
  const [applicationsTab, setApplicationsTab] = useState('pending');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [applicationToApprove, setApplicationToApprove] = useState(null);
  const [approvingLoan, setApprovingLoan] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showAddLivestockModal, setShowAddLivestockModal] = useState(false);
  const [showEditLivestockModal, setShowEditLivestockModal] = useState(false);
  const [editingLivestock, setEditingLivestock] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [livestockToDelete, setLivestockToDelete] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [paymentStatsSearch, setPaymentStatsSearch] = useState("");
  const [paymentStatsStatus, setPaymentStatsStatus] = useState("all");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionDate, setTransactionDate] = useState("");

  // ---------- Director investor section ----------
  const [investors, setInvestors] = useState([]);
  const [investorsLoading, setInvestorsLoading] = useState(false);
  const [investorSearch, setInvestorSearch] = useState("");
  const [investorFilter, setInvestorFilter] = useState("");
  const [showAddInvestorModal, setShowAddInvestorModal] = useState(false);
  const [newInvestor, setNewInvestor] = useState({ name: "", phone: "", id_number: "", email: "", investment_amount: "" });
  const [showInvestorLoginModal, setShowInvestorLoginModal] = useState(false);
  const [investorPassword, setInvestorPassword] = useState("");
  const [isInvestorSectionAuthenticated, setIsInvestorSectionAuthenticated] = useState(false);
  const [showShareLinkModal, setShowShareLinkModal] = useState(false);
  const [shareLinkData, setShareLinkData] = useState({ link: '', investorName: '', investorEmail: '', investorPhone: '', temporaryPassword: '' });
  const [showViewInvestorModal, setShowViewInvestorModal] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [showEditInvestorModal, setShowEditInvestorModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState(null);
  const [updatedInvestor, setUpdatedInvestor] = useState({ name: "", phone: "", email: "", id_number: "", notes: "" });
  const [showActivateDeactivateModal, setShowActivateDeactivateModal] = useState(false);
  const [investorToToggle, setInvestorToToggle] = useState(null);
  const [showDeleteInvestorModal, setShowDeleteInvestorModal] = useState(false);
  const [investorToDelete, setInvestorToDelete] = useState(null);
  const [investorTransactions, setInvestorTransactions] = useState([]);
  const [investorTransactionsLoading, setInvestorTransactionsLoading] = useState(false);
  const [investorTransactionSearch, setInvestorTransactionSearch] = useState("");
  const [investorTransactionDate, setInvestorTransactionDate] = useState("");
  const [investorTab, setInvestorTab] = useState('investors');
  const [showProcessReturnModal, setShowProcessReturnModal] = useState(false);
  const [selectedInvestorForReturn, setSelectedInvestorForReturn] = useState(null);
  const [returnAmount, setReturnAmount] = useState("");
  const [returnMethod, setReturnMethod] = useState("mpesa");
  const [returnReference, setReturnReference] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [isTopupAdjustmentMode, setIsTopupAdjustmentMode] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState("topup");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [investorTopupMethod, setInvestorTopupMethod] = useState("cash");
  const [investorTopupReference, setInvestorTopupReference] = useState("");
  const [investorTopupNotes, setInvestorTopupNotes] = useState("");
  const [maxReturnAmount, setMaxReturnAmount] = useState(0);
  const [isEarlyWithdrawal, setIsEarlyWithdrawal] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Flag confirmation modal
  const [showFlagConfirmModal, setShowFlagConfirmModal] = useState(false);
  const [flagLoanToConfirm, setFlagLoanToConfirm] = useState(null);
  const [flagLoanName, setFlagLoanName] = useState('');

  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  
  const fetchPendingRequestsCount = async () => {
    try {
      const res = await salaryAPI.getAdvanceRequests();
      const pending = res.data.filter(r => r.status === 'pending').length;
      setPendingRequestsCount(pending);
    } catch (err) {
      console.error('Failed to fetch pending requests');
    }
  };

  const handleConfirmFlag = async () => {
    if (!flagLoanToConfirm) return;
    try {
      await recoveryAPI.flagLoan(flagLoanToConfirm, '');
      showToast.success('Client flagged for valuer');
      fetchData(); // refresh the list – loan disappears
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Flagging failed');
    } finally {
      setShowFlagConfirmModal(false);
      setFlagLoanToConfirm(null);
      setFlagLoanName('');
    }
  };

  // ---------- Director data fetching ----------
  const fetchDirectorDashboard = async () => {
    try {
      const res = await adminAPI.getDashboard();
      setDashboardData(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchDirectorApplications = async () => {
    setApplicationsLoading(true);
    try {
      const res = await adminAPI.getApplications();
      const newApps = res.data || [];
      setApplications(newApps);

      // Count pending applications
      const newPendingCount = newApps.filter(app => app.status === 'pending').length;
      setPendingApplicationsCount(newPendingCount);

      // Play sound if count increased
      if (newPendingCount > prevPendingApplicationsRef.current) {
        playSound(); // reuse existing playSound function
      }
      prevPendingApplicationsRef.current = newPendingCount;
    } catch (err) {
      showToast.error("Failed to load applications");
    } finally {
      setApplicationsLoading(false);
    }
  };

  const fetchDirectorApprovedLoans = async () => {
    setApprovedLoansLoading(true);
    try {
      const res = await adminAPI.getApprovedLoans();
      setApprovedLoans(res.data || []);
    } catch (err) { console.error(err); }
    finally { setApprovedLoansLoading(false); }
  };

  const fetchDirectorClients = async () => {
    setClientsLoading(true);
    try {
      const res = await adminAPI.getClients();
      setClients(res.data || []);
    } catch (err) { console.error(err); }
    finally { setClientsLoading(false); }
  };

  const fetchDirectorTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const res = await adminAPI.getTransactions();
      const sorted = (res.data || []).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      setTransactions(sorted);
    } catch (err) { console.error(err); }
    finally { setTransactionsLoading(false); }
  };

  const fetchDirectorPaymentStats = async () => {
    setPaymentStatsLoading(true);
    try {
      const res = await adminAPI.getPaymentStats();
      setPaymentStats(res.data || { payment_stats: [], total_principal_collected: 0, currently_lent: 0, available_for_lending: 0, revenue_collected: 0 });
    } catch (err) { console.error(err); }
    finally { setPaymentStatsLoading(false); }
  };

  const fetchDirectorLivestock = async () => {
    setLivestockLoading(true);
    try {
      const res = await adminAPI.getLivestock(1, 100);
      setLivestock(res.data.items || []);
    } catch (err) { showToast.error("Failed to load livestock gallery"); }
    finally { setLivestockLoading(false); }
  };

  const fetchInvestors = async () => {
    setInvestorsLoading(true);
    try {
      const res = await adminAPI.getInvestors();
      setInvestors(Array.isArray(res.data) ? res.data : (res.data.investors || []));
    } catch (err) { showToast.error("Failed to load investors"); }
    finally { setInvestorsLoading(false); }
  };

  const fetchInvestorTransactions = async () => {
    setInvestorTransactionsLoading(true);
    try {
      const res = await adminAPI.getInvestorTransactions();
      const sorted = (res.data || []).sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
      setInvestorTransactions(sorted);
    } catch (err) { console.error(err); }
    finally { setInvestorTransactionsLoading(false); }
  };

  // ---------- Director helper functions (investor management) ----------
  const generateTemporaryPassword = (name) => {
    if (!name?.trim()) return '';
    const clean = name.toLowerCase().replace(/[^a-z]/g, '');
    const prefix = clean.substring(0, 3);
    const random = Math.floor(100 + Math.random() * 900);
    return `inv?${prefix}${random}`;
  };

  const handleInvestorPasswordSubmit = (e) => {
    e.preventDefault();
    if (investorPassword === "n@g0l13") {
      setIsInvestorSectionAuthenticated(true);
      setShowInvestorLoginModal(false);
      setInvestorPassword("");
      setDirectorSection("investors");
      if (window.innerWidth <= 991.98) setSidebarOpen(false);
      showToast.success("Investor section unlocked");
    } else {
      showToast.error("Invalid password");
      setInvestorPassword("");
    }
  };

  const handleInvestorSectionClick = () => {
    if (window.innerWidth <= 991.98) setSidebarOpen(false);
    if (isInvestorSectionAuthenticated) {
      setDirectorSection("investors");
      return;
    }
    // Force modal to show
    setInvestorPassword("");
    setShowInvestorLoginModal(true);
  };

  const handleInvestorSectionLogout = () => {
    setIsInvestorSectionAuthenticated(false);
    if (directorSection === "investors") setDirectorSection("recovery");
    showToast.info("Investor section locked");
  };

  const handleGenerateShareLink = async (investor) => {
    if (investor.account_status !== 'pending') {
      showToast.error("Can only generate link for pending investors");
      return;
    }
    setGeneratingLink(true);
    try {
      const res = await adminAPI.createInvestorAccountLink(investor.id);
      if (res.data.success) {
        setShareLinkData({
          link: res.data.link,
          investorName: investor.name,
          investorEmail: investor.email || '',
          investorPhone: investor.phone,
          temporaryPassword: res.data.temporary_password || 'Check notes'
        });
        setShowShareLinkModal(true);
        showToast.success("Account creation link generated!");
      } else {
        showToast.error(res.data.error || "Failed to generate link");
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || "Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleEditInvestor = (investor) => {
    setEditingInvestor(investor);
    setUpdatedInvestor({
      name: investor.name, phone: investor.phone, email: investor.email || '',
      id_number: investor.id_number, notes: investor.notes || ''
    });
    setShowEditInvestorModal(true);
  };

  const handleUpdateInvestor = async () => {
    try {
      const res = await adminAPI.updateInvestor(editingInvestor.id, updatedInvestor);
      if (res.data.success) {
        showToast.success("Investor updated!");
        setShowEditInvestorModal(false);
        fetchInvestors();
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || "Update failed");
    }
  };

  const handleToggleAccountStatus = (investor) => {
    setInvestorToToggle(investor);
    setShowActivateDeactivateModal(true);
  };

  const confirmToggleAccountStatus = async () => {
    const newStatus = investorToToggle.account_status === 'active' ? 'inactive' : 'active';
    try {
      const res = await adminAPI.updateInvestor(investorToToggle.id, { account_status: newStatus });
      if (res.data.success) {
        showToast.success(`Account ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
        setShowActivateDeactivateModal(false);
        setInvestorToToggle(null);
        fetchInvestors();
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || "Status update failed");
    }
  };

  const handleDeleteInvestor = (investor) => {
    setInvestorToDelete(investor);
    setShowDeleteInvestorModal(true);
  };

  const confirmDeleteInvestor = async () => {
    try {
      const res = await adminAPI.deleteInvestor(investorToDelete.id);
      if (res.data.success) {
        showToast.success("Investor deleted");
        setShowDeleteInvestorModal(false);
        setInvestorToDelete(null);
        fetchInvestors();
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || "Delete failed");
    }
  };

  const handleProcessReturn = async (investor) => {
    try {
      const calc = await adminAPI.calculateInvestorReturn(investor.id);
      if (calc.data.success) {
        setSelectedInvestorForReturn(investor);
        setReturnAmount("");
        setMaxReturnAmount(calc.data.max_payable);
        setReturnMethod("mpesa");
        setReturnReference("");
        setReturnNotes("");
        setIsTopupAdjustmentMode(false);
        setAdjustmentType("topup");
        setAdjustmentAmount("");
        setInvestorTopupMethod("cash");
        setInvestorTopupReference("");
        setInvestorTopupNotes("");
        setIsEarlyWithdrawal(false);
        setShowProcessReturnModal(true);
      }
    } catch (err) {
      showToast.error("Failed to load return data");
    }
  };

  const handleProcessAction = async () => {
    if (!selectedInvestorForReturn) return;
    if (isTopupAdjustmentMode) {
      if (!adjustmentAmount || parseFloat(adjustmentAmount) <= 0) {
        showToast.error("Enter a valid amount");
        return;
      }
      if (adjustmentType === 'topup' && investorTopupMethod === 'mpesa' && !investorTopupReference) {
        showToast.error("M-Pesa reference required");
        return;
      }
      const data = {
        adjustment_type: adjustmentType,
        amount: parseFloat(adjustmentAmount),
        notes: investorTopupNotes,
        ...(adjustmentType === 'topup' && { payment_method: investorTopupMethod, mpesa_reference: investorTopupMethod === 'mpesa' ? investorTopupReference : null })
      };
      try {
        const res = await adminAPI.adjustInvestorInvestment(selectedInvestorForReturn.id, data);
        if (res.data.success) {
          showToast.success(`Investment ${adjustmentType === 'topup' ? 'topped up' : 'adjusted'}`);
          setShowProcessReturnModal(false);
          fetchInvestors();
        }
      } catch (err) {
        showToast.error(err.response?.data?.error || "Action failed");
      }
    } else {
      if (!returnAmount || parseFloat(returnAmount) <= 0) {
        showToast.error("Enter a valid return amount");
        return;
      }
      if (returnMethod === 'mpesa' && !returnReference) {
        showToast.error("M-Pesa reference required");
        return;
      }
      const data = {
        amount: parseFloat(returnAmount),
        payment_method: returnMethod,
        mpesa_receipt: returnMethod === 'mpesa' ? returnReference : null,
        notes: returnNotes,
        is_early_withdrawal: isEarlyWithdrawal
      };
      try {
        const res = await adminAPI.processInvestorReturn(selectedInvestorForReturn.id, data);
        if (res.data.success) {
          showToast.success(`Return of ${fmt(returnAmount)} processed`);
          setShowProcessReturnModal(false);
          fetchInvestors();
        }
      } catch (err) {
        showToast.error(err.response?.data?.error || "Return failed");
      }
    }
  };

  const handleApplicationAction = async (applicationId, action, fundingData = null) => {
    try {
      if (action === "approve") {
        if (!fundingData) {
          const app = applications.find(a => a.id === applicationId);
          if (app) {
            setApplicationToApprove(app);
            setShowApprovalModal(true);
          }
          return;
        }
        setApprovingLoan(true);
        await adminAPI.approveApplication(applicationId, fundingData);
        showToast.success("Loan approved!");
      } else if (action === "reject") {
        await adminAPI.rejectApplication(applicationId);
        showToast.info("Loan rejected.");
      }
      await Promise.all([
        fetchDirectorApplications(),
        fetchDirectorApprovedLoans(),
        fetchDirectorClients(),
        fetchData(),
        fetchDirectorTransactions()
      ]);
      setShowApplicationModal(false);
      setShowApprovalModal(false);
    } catch (err) {
      showToast.error(err.response?.data?.error || `Failed to ${action} application`);
    } finally {
      setApprovingLoan(false);
    }
  };

  const filterPendingApplications = () => {
    let filtered = applications.filter(app => app.status === 'pending');
    if (pendingSearch) {
      const term = pendingSearch.toLowerCase();
      filtered = filtered.filter(app =>
        app.name?.toLowerCase().includes(term) ||
        app.phone?.toLowerCase().includes(term) ||
        app.livestockType?.toLowerCase().includes(term) ||
        app.idNumber?.toLowerCase().includes(term)
      );
    }
    if (pendingDate) {
      filtered = filtered.filter(app => {
        if (!app.date) return false;
        const d = new Date(app.date).toISOString().split('T')[0];
        return d === pendingDate;
      });
    }
    return filtered;
  };

  const filterApprovedLoans = () => {
    let filtered = [...approvedLoans];
    if (approvedSearch) {
      const term = approvedSearch.toLowerCase();
      filtered = filtered.filter(loan =>
        loan.name?.toLowerCase().includes(term) ||
        loan.phone?.toLowerCase().includes(term) ||
        loan.livestockType?.toLowerCase().includes(term) ||
        loan.idNumber?.toLowerCase().includes(term)
      );
    }
    if (approvedDate) {
      filtered = filtered.filter(loan => {
        if (!loan.date) return false;
        const d = new Date(loan.date).toISOString().split('T')[0];
        return d === approvedDate;
      });
    }
    return filtered;
  };

  const filterInvestors = () => {
    let filtered = [...investors];
    if (investorSearch) {
      const term = investorSearch.toLowerCase();
      filtered = filtered.filter(i =>
        i.name?.toLowerCase().includes(term) ||
        i.phone?.toLowerCase().includes(term) ||
        i.id_number?.toLowerCase().includes(term)
      );
    }
    if (investorFilter) filtered = filtered.filter(i => i.account_status === investorFilter);
    return filtered;
  };

  const filterInvestorTransactions = () => {
    let filtered = [...investorTransactions];
    if (investorTransactionSearch) {
      const term = investorTransactionSearch.toLowerCase();
      filtered = filtered.filter(t => t.investor_name?.toLowerCase().includes(term));
    }
    if (investorTransactionDate) {
      filtered = filtered.filter(t => {
        const d = new Date(t.date || t.return_date || t.created_at).toISOString().split('T')[0];
        return d === investorTransactionDate;
      });
    }
    return filtered;
  };

  // ---------- Livestock helper functions (full like AdminPanel) ----------
  const handleAddLivestock = async (livestockData) => {
    try {
      const res = await adminAPI.addLivestock({
        type: livestockData.type,
        count: parseInt(livestockData.count),
        price: parseFloat(livestockData.price),
        description: livestockData.description || 'Available for purchase',
        location: livestockData.location || 'Isinya, Kajiado',
        images: livestockData.images || []
      });
      showToast.success('Livestock added successfully!');
      setShowAddLivestockModal(false);
      fetchDirectorLivestock();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to add livestock');
    }
  };

  const handleEditLivestock = (livestockItem) => {
    setEditingLivestock(livestockItem);
    setSelectedImages(livestockItem.images || []);
    setShowEditLivestockModal(true);
  };

  const handleUpdateLivestock = async (e) => {
    e.preventDefault();
    if (!editingLivestock) return;
    try {
      const formData = new FormData(e.target);
      const updatedData = {
        type: formData.get('editType'),
        count: parseInt(formData.get('editCount')),
        price: parseFloat(formData.get('editPrice')),
        description: formData.get('editDescription'),
        location: formData.get('editLocation'),
        images: selectedImages
      };
      const res = await adminAPI.updateLivestock(editingLivestock.id, updatedData);
      if (res.data.success) {
        showToast.success('Livestock updated successfully!');
        setShowEditLivestockModal(false);
        setEditingLivestock(null);
        setSelectedImages([]);
        fetchDirectorLivestock();
      } else {
        showToast.error(res.data.error || 'Update failed');
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const confirmDeleteLivestock = (livestockId) => {
    setLivestockToDelete(livestockId);
    setShowDeleteConfirmation(true);
  };

  const handleDeleteLivestock = async () => {
    if (!livestockToDelete) return;
    try {
      const res = await adminAPI.deleteLivestock(livestockToDelete);
      if (res.data.success) {
        showToast.success('Livestock deleted!');
        fetchDirectorLivestock();
      } else {
        showToast.error(res.data.error || 'Delete failed');
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setShowDeleteConfirmation(false);
      setLivestockToDelete(null);
    }
  };

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    setImageUploading(true);
    try {
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true };
      const compressed = await Promise.all(files.map(f => imageCompression(f, options)));
      const promises = compressed.map(file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      }));
      const newImages = await Promise.all(promises);
      setSelectedImages(prev => [...prev, ...newImages]);
    } catch (err) {
      showToast.error("Failed to process images");
    } finally {
      setImageUploading(false);
    }
  };

  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const isDescription = (str) => {
    const lowerStr = str.toLowerCase();
    return (
      lowerStr.includes('cow') ||
      lowerStr.includes('goat') ||
      lowerStr.includes('sheep') ||
      lowerStr.includes('chicken') ||
      lowerStr.includes('poultry') ||
      lowerStr.includes('bull') ||
      lowerStr.includes('calf') ||
      lowerStr.includes('healthy') ||
      lowerStr.includes('good') ||
      lowerStr.includes('excellent') ||
      lowerStr.includes('nice') ||
      lowerStr.includes('quality') ||
      lowerStr.includes('available for') ||
      lowerStr.includes('for sale') ||
      lowerStr.includes('for purchase')
    );
  };

  // ---------- Payment and client helpers (same as AdminPanel) ----------
  const [paymentType, setPaymentType] = useState('principal');
  const [mpesaReference, setMpesaReference] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showMpesaModal, setShowMpesaModal] = useState(false);
  const [mpesaAmount, setMpesaAmount] = useState("");
  const [mpesaPaymentType, setMpesaPaymentType] = useState('principal');
  const [mpesaUnpaidInterest, setMpesaUnpaidInterest] = useState(0);
  const [sendingStk, setSendingStk] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsPhone, setSmsPhone] = useState('');
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupMethod, setTopupMethod] = useState("cash");
  const [topupReference, setTopupReference] = useState("");
  const [topupNotes, setTopupNotes] = useState("");
  const [isTopupMode, setIsTopupMode] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingLivestock, setSharingLivestock] = useState(null);
  const [shareMessage, setShareMessage] = useState('');

  const openMpesaModal = (client) => {
    setSelectedClient(client);
    setMpesaAmount("");
    setMpesaPaymentType('principal');
    setMpesaUnpaidInterest(client.unpaidInterest || 0);
    setShowMpesaModal(true);
  };

  const openTopupModal = (loan) => {
    // Create a client object with the required fields
    const clientForTopup = {
      ...loan,
      loan_id: loan.id,          // Add loan_id (critical for the API call)
      name: loan.name,           // Already present
      borrowedAmount: loan.current_principal || loan.principal_amount || 0, // For consistency
      current_principal: loan.current_principal || loan.principal_amount || 0,
    };
    setSelectedClient(clientForTopup);
    setTopupAmount("");
    const currentPrincipal = clientForTopup.current_principal;
    setAdjustmentAmount(currentPrincipal.toString());
    setTopupMethod("cash");
    setTopupReference("");
    setTopupNotes("");
    setIsTopupMode(true);
    setShowTopupModal(true);
  };

  const openShareModal = (livestock) => {
    setSharingLivestock(livestock);
    setShareMessage('');
    setShowShareModal(true);
  };

  const formatPhoneNumber = (phone) => {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '254' + cleaned.substring(1);
    else if (cleaned.startsWith('7') || cleaned.startsWith('1')) cleaned = '254' + cleaned;
    return cleaned;
  };

  const handleMpesaPayment = async () => {
    if (!selectedClient?.loan_id || !mpesaAmount) {
      showToast.error("Please enter a valid payment amount");
      return;
    }
    const paymentAmount = parseInt(mpesaAmount, 10);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      showToast.error("Please enter a valid whole number amount");
      return;
    }
    const currentPrincipal = selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0;
    if (mpesaPaymentType === 'interest') {
      if (paymentAmount > mpesaUnpaidInterest) {
        showToast.error(`Interest payment cannot exceed ${fmt(mpesaUnpaidInterest)}`);
        return;
      }
    } else {
      if (paymentAmount > currentPrincipal) {
        showToast.error(`Principal payment cannot exceed ${fmt(currentPrincipal)}`);
        return;
      }
    }
    setSendingStk(true);
    try {
      const formattedPhone = formatPhoneNumber(selectedClient.phone);
      const response = await paymentAPI.processMpesaPayment({
        loan_id: selectedClient.loan_id,
        amount: paymentAmount,
        phone_number: formattedPhone,
        payment_type: mpesaPaymentType
      });
      if (response.data.success) {
        showToast.success(`Payment prompt sent to ${selectedClient.name}. Waiting for confirmation...`, 5000);
        const checkoutRequestId = response.data.checkout_request_id;
        // Simplified status polling (like AdminPanel)
        setTimeout(() => {
          setShowMpesaModal(false);
          setSelectedClient(null);
          Promise.all([fetchDirectorClients(), fetchDirectorTransactions(), fetchDirectorDashboard()]);
          showToast.success("Payment completed (demo)");
        }, 15000);
      } else {
        showToast.error("Failed to send payment prompt.");
        setSendingStk(false);
      }
    } catch (error) {
      console.error(error);
      showToast.error("Failed to process M-Pesa payment.");
      setSendingStk(false);
    }
  };

  const handleTakeAction = (client) => {
    setSelectedClient(client);
    setShowActionModal(true);
  };

  const handleCloseModal = () => {
    setShowActionModal(false);
    setSelectedClient(null);
  };

  const handleSendReminder = (client, message) => {
    try {
      // Support both client.phone (from admin) and client.contacts (from recovery)
      let phoneNumber = client?.phone || client?.contacts;
      if (!phoneNumber) throw new Error('Phone number missing');

      // Clean and format
      phoneNumber = phoneNumber.toString().trim();
      phoneNumber = phoneNumber.replace(/\s+/g, '').replace(/[-\s()]/g, '');

      if (!phoneNumber.startsWith('+')) {
        if (phoneNumber.startsWith('0')) {
          phoneNumber = '+254' + phoneNumber.substring(1);
        } else if (phoneNumber.startsWith('254')) {
          phoneNumber = '+' + phoneNumber;
        } else {
          throw new Error('Invalid phone format');
        }
      }

      const encodedMessage = encodeURIComponent(message);
      window.location.href = `sms:${phoneNumber}?body=${encodedMessage}`;

      // Close modals that might have been open
      setShowActionModal(false);
      setSelectedClient(null);
    } catch (error) {
      showToast.error(error.message);
    }
  };
  
  const handleClaimOwnership = async (client) => {
    try {
      const response = await adminAPI.claimOwnership({
        client_id: client.client_id || client.id,
        loan_id: client.loan_id || client.id
      });
      if (response.data.success) {
        showToast.success(response.data.message);
        // Close BOTH action modals and clear their states
        setShowActionModal(false);
        setShowTakeActionModal(false);
        setSelectedClient(null);
        setSelectedLoanForAction(null);
        // Refresh all relevant data
        fetchDirectorDashboard();
        fetchDirectorClients();
        fetchDirectorLivestock();
        fetchDirectorTransactions();
        fetchData();
      }
    } catch (error) {
      showToast.error(error.response?.data?.error || 'Claim failed');
    }
  };

  const openPaymentModal = (client) => {
    setSelectedClient(client);
    setShowPaymentModal(true);
  };

  const handlePayment = async (paymentData) => {
    // Simplified - similar to AdminPanel
    try {
      const amount = parseFloat(paymentData.amount);
      if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');
      const response = await paymentAPI.processCashPayment({
        loan_id: selectedClient.loan_id,
        amount: amount,
        payment_type: paymentType,
        notes: paymentData.notes || 'Cash payment'
      });
      if (response.data.success) {
        showToast.success('Payment processed');
        setShowPaymentModal(false);
        setSelectedClient(null);
        await Promise.all([fetchDirectorClients(), fetchDirectorTransactions(), fetchDirectorDashboard()]);
      }
    } catch (error) {
      showToast.error(error.response?.data?.error || 'Payment failed');
    }
  };

  const handleTopup = async () => {
    if (!selectedClient?.loan_id) {
      showToast.error("Error: No active loan found for this client");
      return;
    }

    // Get the correct current principal
    const oldPrincipal = selectedClient.current_principal || selectedClient.principal_amount || selectedClient.borrowedAmount || 0;

    let amount = 0;
    if (isTopupMode) {
      amount = parseFloat(topupAmount);
      if (isNaN(amount) || amount <= 0) {
        showToast.error("Please enter a valid top-up amount");
        return;
      }
    } else {
      amount = parseFloat(adjustmentAmount);
      if (isNaN(amount) || amount <= 0) {
        showToast.error("Please enter a valid loan amount");
        return;
      }
      // adjustment amount = new total principal - old principal
      amount = amount - oldPrincipal;
    }

    if (topupMethod === 'mpesa' && !topupReference.trim()) {
      showToast.error("Please enter M-Pesa reference code for M-Pesa disbursement");
      return;
    }

    try {
      const response = await adminAPI.processTopup(selectedClient.loan_id, {
        topup_amount: isTopupMode ? amount : 0,
        adjustment_amount: !isTopupMode ? (parseFloat(adjustmentAmount) || oldPrincipal) : 0,
        disbursement_method: topupMethod,
        mpesa_reference: topupMethod === 'mpesa' ? topupReference.toUpperCase().trim() : '',
        notes: topupNotes || `${isTopupMode ? 'Top-up' : 'Adjustment'} processed for ${selectedClient.name}`
      });

      if (response.data.success) {
        showToast.success(`Loan ${isTopupMode ? 'top-up' : 'adjustment'} processed successfully!`);
        setShowTopupModal(false);
        setSelectedClient(null);
        setTopupAmount("");
        setAdjustmentAmount("");
        setTopupMethod("cash");
        setTopupReference("");
        setTopupNotes("");

        await Promise.all([
          fetchDirectorClients(),
          fetchDirectorTransactions(),
          fetchDirectorDashboard(),
          fetchData()
        ]);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      showToast.error(`Failed to process ${isTopupMode ? 'top-up' : 'adjustment'}: ${errorMsg}`);
    }
  };

  const canRenewLoan = (loan) => {
    const allowed = ['director', 'admin', 'secretary', 'client_relations_officer', 'head_of_it', 'deputy_director', 'hr_manager'];
    if (!allowed.includes(userRole)) return false;
    if (loan.daysLeft <= 0) return true;
    if (loan.weeks_overdue > 0) return true;
    if (loan.borrowedDate) {
      const daysSince = (new Date() - new Date(loan.borrowedDate)) / (1000*3600*24);
      if (daysSince >= 14 && loan.balance > 0) return true;
    }
    return false;
  };

  const [newRenewalPrincipal, setNewRenewalPrincipal] = useState(0);
  const [newRenewalPlan, setNewRenewalPlan] = useState('weekly');

  const openRenewalModal = (loan) => {
    // Calculate current outstanding balance as default principal
    const principal = Number(loan.current_principal || loan.currentPrincipal || loan.borrowedAmount || 0);
    const isWeekly = loan.repayment_plan === 'weekly';
    const totalBalance = isWeekly ? principal + principal * 0.30 : principal + Number(loan.accrued_interest || 0);
    setNewRenewalPrincipal(totalBalance);
    setNewRenewalPlan(loan.repayment_plan || 'weekly');
    setRenewalLoan(loan);
    setShowRenewalModal(true);
  };

  // ---------- Original recovery handlers (unchanged) ----------
  const handleOpenSettings = () => {
    setShowSettingsModal(true);
    if (isMobile) setSidebarOpen(false);
  };

  const handleOpenUtilities = () => {
    if (['director', 'secretary', 'client_relations_officer','hr_manager'].includes(userRole)) {
      setDirectorSection('utilities');
    } else {
      setShowUtilities(true);
    }
    if (isMobile) setSidebarOpen(false);
  };

  const handleDownloadInvoice = async (loan) => {
    try {
      // 1. Fetch the most current loan data (including period_interest_prepaid)
      const loanResponse = await adminAPI.getLoan(loan.id);   // or recoveryAPI.getLoan(loan.id)
      const freshLoan = loanResponse.data;

      // 2. Get transactions for the invoice
      const txnResponse = await recoveryAPI.getLoanTransactions(loan.id);

      // 3. Generate invoice with fresh data
      await generateLoanInvoicePDF(freshLoan, txnResponse.data || []);
      showToast.success('Invoice downloaded');
    } catch (error) {
      console.error('Invoice error:', error);
      showToast.error('Failed to generate invoice');
    }
  };

  const enrollBiometrics = async () => {
    try {
      const token = localStorage.getItem('token');
      const beginRes = await fetch(`${API_BASE}/auth/biometric/register/begin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!beginRes.ok) throw new Error(await beginRes.text());
      const { cacheKey, options } = await beginRes.json();
      const attResp = await startRegistration({ optionsJSON: options });
      const completeRes = await fetch(`${API_BASE}/auth/biometric/register/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...attResp, cacheKey }),
      });
      if (!completeRes.ok) throw new Error(await completeRes.text());
      showToast.success('Biometric login enabled successfully!');
      const userRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) {
        const freshUser = await userRes.json();
        if (updateUserData) updateUserData(freshUser);
      } else {
        if (updateUserData) updateUserData({ ...user, webauthn_credential_id: attResp.id });
      }
    } catch (err) {
      console.error(err);
      showToast.error(err.message || 'Failed to enable biometrics');
    }
  };

  const disableBiometrics = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/auth/biometric/disable`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      showToast.success('Biometrics disabled.');
      const userRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) {
        const freshUser = await userRes.json();
        if (updateUserData) updateUserData(freshUser);
      } else {
        if (updateUserData) updateUserData({ ...user, webauthn_credential_id: null });
      }
    } catch (err) {
      console.error(err);
      showToast.error(err.message || 'Failed to disable biometrics');
    }
  };

  const formatPhoneForSms = (phone) => {
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '254' + cleaned.substring(1);
    else if (cleaned.startsWith('7') || cleaned.startsWith('1')) cleaned = '254' + cleaned;
    if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return cleaned;
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
      await logout();
      showToast.success('Logged out');
      navigate('/');
    } catch (e) {
      showToast.error('Logout failed');
    }
  };

  const formatClockTime = (date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const formatClockDate = (date) => date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const playSound = () => {
    if (!audio) { const a = new Audio('/notification-sound.mp3'); setAudio(a); a.play().catch(() => {}); }
    else audio.play().catch(() => {});
  };

  const fetchCommentUnreads = useCallback(async () => {
    try {
      const res = await recoveryAPI.getCommentUnreadCounts();
      const nc = res.data;
      let hasNew = false;
      Object.keys(nc).forEach(id => { if (nc[id] > (prevCounts.current[id] || 0)) hasNew = true; });
      if (hasNew) playSound();
      setCommentUnreads(nc);
      prevCounts.current = { ...nc };
    } catch (e) { console.error(e); }
  }, []);
  
  const fetchData = async () => {
    try {
      const res = await recoveryAPI.getRecoveryData();
      setData(res.data);
    } catch (e) {
      if (e.response?.status === 401) { logout(); navigate('/login'); }
      else showToast.error('Failed to load recovery data');
    } finally { setLoading(false); }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await recoveryAPI.getUnreadCount();
      setUnreadCount(prev => { if (res.data.count > prev) playSound(); return res.data.count; });
      document.title = res.data.count > 0 ? `(${res.data.count}) Nagolie Recovery` : 'Nagolie Recovery';
    } catch (e) { console.error(e); }
  };

  const handleSelectUser = (u) => {
    if (openChatWindows.some(w => w.id === u.id)) return;
    if (isMobile) { setOpenChatWindows([u]); return; }
    if (openChatWindows.length >= MAX_CHAT_WINDOWS) { showToast.info('Max chat windows open'); return; }
    setOpenChatWindows(prev => [...prev, u]);
  };

  const getChatStyle = (i) => isMobile
    ? { position:'fixed', top:0, left:0, width:'100vw', height:'100vh', zIndex:1050+i, borderRadius:0 }
    : { position:'fixed', bottom:20, left:20+i*(CHAT_WINDOW_WIDTH+CHAT_WINDOW_GAP), width:`${CHAT_WINDOW_WIDTH}px`, height:'500px', zIndex:1050+i };
  
    const fmt = (v) => new Intl.NumberFormat('en-KE', { style:'currency', currency:'KES' }).format(Number(v)||0);
  

  const fmtDate = (s) => {
    if (!s) return 'N/A';
    try { return new Date(s).toLocaleDateString('en-KE',{year:'numeric',month:'short',day:'numeric'}); }
    catch { return 'N/A'; }
  };

  const getDaysBadge = (loan) => {
    const isDaily = loan.repayment_plan === 'daily';
    const daysOverdue = loan.overdue_days || 0;
    const weeksOverdue = loan.overdue_weeks || 0;

    if (isDaily && daysOverdue > 0) {
      return { text: `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`, cls: 'bg-danger' };
    }
    if (!isDaily && weeksOverdue > 0) {
      return { text: `${weeksOverdue} week${weeksOverdue !== 1 ? 's' : ''} overdue`, cls: 'bg-danger' };
    }
    // Still within grace period – show days left (based on due_date)
    const daysLeft = loan.days_left;
    if (daysLeft === 0) {
      return { text: 'Due Today', cls: 'bg-warning text-dark' };
    }
    if (daysLeft > 0) {
      return { text: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`, cls: 'bg-success' };
    }
    return null;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    try { return new Date(date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }); }
    catch { return 'N/A'; }
  };

  const filterAndSortLoans = (loans) => {
    let filtered = [...loans];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(loan =>
        loan.name.toLowerCase().includes(term) ||
        (loan.collateral && loan.collateral.toLowerCase().includes(term)) ||
        (loan.location && loan.location.toLowerCase().includes(term)) ||
        (loan.id_number && loan.id_number.toLowerCase().includes(term)) ||
        (loan.contacts && loan.contacts.toLowerCase().includes(term))
      );
    }
    if (planFilter !== 'all') {
      if (planFilter === 'waived') filtered = filtered.filter(loan => loan.interest_rate === 0);
      else filtered = filtered.filter(loan => loan.repayment_plan === planFilter && loan.interest_rate !== 0);
    }
    if (dateFilter) {
      filtered = filtered.filter(loan => {
        if (!loan.disbursement_date) return false;
        return new Date(loan.disbursement_date).toISOString().split('T')[0] === dateFilter;
      });
    }
    filtered.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
        case 'date': valA = a.disbursement_date ? new Date(a.disbursement_date) : 0; valB = b.disbursement_date ? new Date(b.disbursement_date) : 0; break;
        case 'principal': valA = a.current_principal; valB = b.current_principal; break;
        case 'balance': valA = a.accrued_interest; valB = b.accrued_interest; break;
        default: valA = a.name; valB = b.name;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  };

  const getFilteredData = () => {
    // 1. Apply day filter & existing filters (search, plan, date, sort)
    let dayData = {};
    if (dayFilter === 'all') {
      for (const day of DAYS_ORDER) {
        if (data[day]?.length) {
          dayData[day] = filterAndSortLoans(data[day]);
        }
      }
    } else {
      dayData = { [dayFilter]: filterAndSortLoans(data[dayFilter] || []) };
    }

    // 2. Apply branch filter on each day's loans and remove empty days
    const filtered = {};
    for (const [day, loans] of Object.entries(dayData)) {
      const branchFiltered = filterByBranch(loans);
      if (branchFiltered.length) {
        filtered[day] = branchFiltered;
      }
    }
    return filtered;
  };

  const dayTotals = (loans) => loans.reduce((acc, l) => ({
    principal: acc.principal + (l.principal_amount || 0),
    curPrincipal: acc.curPrincipal + (l.current_principal || 0),
    interest: acc.interest + (l.interest || 0),
    accrued: acc.accrued + (l.accrued_interest || 0),
  }), { principal:0, curPrincipal:0, interest:0, accrued:0 });

  const overallTotals = () => {
    let total = { principal: 0, curPrincipal: 0, interest: 0, accrued: 0 };
    for (const dayLoans of Object.values(filteredData)) {
      const d = dayTotals(dayLoans);
      total.principal += d.principal;
      total.curPrincipal += d.curPrincipal;
      total.interest += d.interest;
      total.accrued += d.accrued;
    }
    return total;
  };

  // For the recovery module's "Take Action" button (⚡) – uses recovery/TakeActionModal
  const handleRecoveryTakeAction = (loan) => {
    setSelectedLoanForAction(loan);
    setShowTakeActionModal(true);
  };

  const filteredData = getFilteredData();
  const isMobile = window.innerWidth <= 991.98;
  const mobileChat = isMobile && openChatWindows.length > 0;

  const disconnectTimeouts = useRef({});

  // ---------- Effects ----------
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

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

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated()) { navigate('/login'); return; }
    if (userRole === 'admin') { navigate('/admin'); return; }
    const allowed = ['director', 'secretary', 'client_relations_officer', 'accountant', 'valuer', 'head_of_it', 'hr_manager'];
    if (userRole && !allowed.includes(userRole)) { logout(); navigate('/login'); return; }
    if (!userRole) return;
    fetchData();
    fetchUnreadCount();
    fetchCommentUnreads();
    if (userRole === 'director') {
      fetchDirectorTransactions();  
    }
    const i1 = setInterval(fetchUnreadCount, 5000);
    const i2 = setInterval(fetchCommentUnreads, 5000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [authLoading, isAuthenticated, userRole, navigate, fetchCommentUnreads, logout]);

  useEffect(() => {
    if (userRole === 'director') {
      fetchInvestors();
    }
  }, [userRole]);
  
  useEffect(() => {
    if (!['director', 'secretary', 'client_relations_officer','hr_manager'].includes(userRole)) return;

    // Poll for new applications every 30 seconds (regardless of active section)
    const fetchApps = () => {
      fetchDirectorApplications();
    };

    // Immediate fetch once
    fetchApps();

    const applicationInterval = setInterval(fetchApps, 30000);

    // Original section‑based data fetching
    if (directorSection === 'overview') {
      fetchDirectorDashboard();
    } else if (directorSection === 'applications') {
      fetchDirectorApplications();   // already fetched by interval, but keep for tab click
      fetchDirectorApprovedLoans();
    } else if (directorSection === 'clients') {
      fetchDirectorClients();
    } else if (directorSection === 'transactions') {
      fetchDirectorTransactions();
    } else if (directorSection === 'payment-stats') {
      fetchDirectorPaymentStats();
      fetchDirectorTransactions();
    } else if (directorSection === 'gallery') {
      fetchDirectorLivestock();
    } else if (directorSection === 'investors' && isInvestorSectionAuthenticated) {
      fetchInvestors();
      fetchInvestorTransactions();
    }

    // Cleanup interval on unmount or when userRole changes
    return () => clearInterval(applicationInterval);
  }, [directorSection, userRole, isInvestorSectionAuthenticated]);

  // Global Socket.IO connection for online status & chat
  useEffect(() => {
    // Only connect if user is authenticated and not already connected
    if (!isAuthenticated() || socketRef.current) return;

    const socketUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '') || 'http://localhost:5000';
    const token = localStorage.getItem('token');
    if (!token) return;

    console.log('[Global Socket] Connecting to:', socketUrl);
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      pingInterval: 25000,
      pingTimeout: 60000,
      query: { token },
    });

    newSocket.on('connect', () => {
      console.log('[Global Socket] Connected');
      // Join the user's personal room (already handled on server)
    });

    newSocket.on('online_users_list', (data) => {
      console.log('[Global Socket] Initial online users:', data.user_ids);
      setOnlineUsers(new Set(data.user_ids));
    });

    newSocket.on('user_online', (data) => {
      console.log('[Global Socket] User online:', data.user_id);
      if (disconnectTimeouts.current[data.user_id]) {
        clearTimeout(disconnectTimeouts.current[data.user_id]);
        delete disconnectTimeouts.current[data.user_id];
      }
      setOnlineUsers(prev => new Set([...prev, data.user_id]));
    });

    newSocket.on('user_offline', (data) => {
      console.log('[Global Socket] User offline:', data.user_id);
      // Delay removal to avoid flickering on temporary disconnects
      if (disconnectTimeouts.current[data.user_id]) {
        clearTimeout(disconnectTimeouts.current[data.user_id]);
      }
      const timeout = setTimeout(() => {
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.user_id);
          return newSet;
        });
        delete disconnectTimeouts.current[data.user_id];
      }, 10000); // 10 seconds grace period
      disconnectTimeouts.current[data.user_id] = timeout;
    });

    newSocket.on('disconnect', () => {
      console.log('[Global Socket] Disconnected');
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="mt-2">Loading...</div>
      </div>
    );
  }

  const [showAddParticipant, setShowAddParticipant] = useState(false);

  const CallUI = () => {
   const {
     activeCall,
     incomingCall,
     isMinimized,
     setIsMinimized,
     callDuration,
     localStream,
     remoteStreams,
     answerCall,
     endCall,
     addParticipant,
   } = useCall();
  
   if (!activeCall && !incomingCall) return null;
  
   return (
     <>
       {incomingCall && (
         <IncomingCallModal
           call={incomingCall}
           onAnswer={() => answerCall(incomingCall.callId, true)}
           onDecline={() => answerCall(incomingCall.callId, false)}
         />
       )}
  
       {activeCall && !isMinimized && (
         <CallScreen
           call={activeCall}
           localStream={localStream}
           remoteStream={remoteStreams[activeCall.callId]?.[activeCall.remoteUser?.id]}
           onEnd={() => endCall(activeCall.callId)}
           onMinimize={() => setIsMinimized(true)}
           duration={callDuration}
           isGroup={activeCall.isGroup}
           participants={activeCall.participants}
           onAddParticipant={() => setShowAddParticipant(true)}   // <-- open modal
         />
       )}
  
       {activeCall && isMinimized && (
         <FloatingCallWidget
           call={activeCall}
           duration={callDuration}
           onMaximize={() => setIsMinimized(false)}
           onEnd={() => endCall(activeCall.callId)}
         />
       )}
  
       {/* Add Participant Modal */}
       <AddParticipantModal
         isOpen={showAddParticipant}
         onClose={() => setShowAddParticipant(false)}
         onAdd={addParticipant}
         currentParticipants={activeCall?.participants || []}
         onlineUsers={onlineUsers}   // <-- pass the onlineUsers set from parent
       />
     </>
   );
} ;

  // ---------- JSX ----------
  return (
    <CallProvider socket={socket}>
    <div>
      <Toast />
      <CallUI /> 
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container-fluid">
          <a className="navbar-brand d-flex align-items-center" href="#">
            <img src="/logo.png" alt="Nagolie" height="30" className="me-2" onError={(e) => e.target.style.display='none'} />
            <span className="d-none d-lg-inline">Nagolie Recovery Module</span>
            <span className="d-lg-none">Recovery</span>
          </a>
          <div className="navbar-nav ms-auto d-none d-lg-flex flex-row align-items-center gap-3">
            <span className="navbar-text text-white">Welcome, <strong>{user?.username || user?.name || 'User'}</strong></span>
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}><i className="fas fa-sign-out-alt me-1"></i>Logout</button>
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
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}><i className="fas fa-sign-out-alt me-1"></i>Logout</button>
          </div>
        </div>
      )}

      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {!mobileChat && (
        <div className="container-fluid">
          <div className="row">
            <div className={`col-md-3 col-lg-2 sidebar ${sidebarOpen ? 'show' : ''}`}>
              <RecoverySidebar
                activeSection={directorSection}
                onSectionChange={(section) => {
                  setShowUtilities(false);
                  setDirectorSection(section);
                  if (isMobile) setSidebarOpen(false);
                }}
                onLogout={handleLogout}
                isMobile={isMobile}
                onToggleInbox={() => {
                  setShowUtilities(false);
                  setShowChatList(s => !s);
                  setSidebarOpen(false);
                }}
                unreadCount={unreadCount}
                onOpenSettings={() => {
                   setShowUtilities(false);
                   setShowSettingsModal(true);
                   if (isMobile) setSidebarOpen(false);
                }}
                onOpenUtilities={handleOpenUtilities}
                userRole={userRole}
                pendingApplications={pendingApplicationsCount}
              />
            </div>

            <div className="col-md-9 col-lg-10 main-content">
              {['director', 'secretary', 'client_relations_officer', 'hr_manager'].includes(userRole) ? (
                // ---------- DIRECTOR / SECRETARY / CLIENT RELATIONS PANEL ----------
                <>
                  {/* OVERVIEW SECTION */}
                  {directorSection === 'overview' && (
                    <div id="overview-section" className="content-section">
                      <div className="row mb-4">
                        <div className="col-md-3 mb-3"><AdminCard title="Total Clients" value={dashboardData.total_clients} icon="fa-users" color="primary" /></div>
                        <div className="col-md-3 mb-3"><AdminCard title="Money Lent" value={fmt(dashboardData.total_lent)} icon="fa-hand-holding-usd" color="success" /></div>
                        <div className="col-md-3 mb-3"><AdminCard title="Money Received" value={fmt(dashboardData.total_received)} icon="fa-coins" color="info" /></div>
                        <div className="col-md-3 mb-3"><AdminCard title="Available Funds" value={fmt(paymentStats.available_for_lending)} icon="fa-wallet" color="warning" /></div>
                      </div>
                      <div className="row mb-4">
                        <div className="col-12">
                          <div className="card shadow"><div className="card-header bg-warning text-white"><h6>Due Today ({dashboardData.due_today.length})</h6></div>
                            <div className="card-body">
                              {dashboardData.overdue.length === 0 ? (
                                <p className="text-muted">No overdue loans</p>
                              ) : (
                                dashboardData.overdue.map(client => {
                                  const isDaily = client.repayment_plan === 'daily';
                                  const overdueUnit = isDaily ? 'day' : 'week';
                                  const overdueValue = isDaily ? client.days_overdue : client.weeks_overdue;
                                  return (
                                    <div key={client.id} className="alert alert-danger d-flex justify-content-between align-items-center">
                                      <div>
                                        <h6 className="mb-0">{client.client_name}</h6>
                                        <small>KES {client.balance?.toLocaleString()} remaining</small>
                                        <br />
                                        <small className="text-muted">
                                          <i className="fas fa-clock me-1"></i>
                                          {overdueValue} {overdueUnit}{overdueValue !== 1 ? 's' : ''} overdue
                                        </small>
                                      </div>
                                      <button className="btn btn-sm btn-primary" onClick={() => handleTakeAction(client)} title="Send reminder or claim collateral">
                                        Take Action
                                      </button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-12">
                          <div className="card shadow"><div className="card-header bg-danger text-white"><h6>Overdue ({dashboardData.overdue.length})</h6></div>
                            <div className="card-body">
                              {dashboardData.overdue.length === 0 ? <p className="text-muted">No overdue loans</p> :
                                dashboardData.overdue.map(client => (
                                  <div key={client.id} className="alert alert-danger d-flex justify-content-between align-items-center">
                                    <div><h6 className="mb-0">{client.client_name}</h6><small>KES {client.balance?.toLocaleString()} remaining</small></div>
                                    <button className="btn btn-sm btn-primary" onClick={() => handleTakeAction(client)} title="Send reminder or claim collateral">Take Action</button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
            
                  {/* ORIGINAL RECOVERY MODULE (for director)*/}
                  {directorSection === 'recovery' && (
                    <>
                      <div className="d-none d-md-flex justify-content-center mb-3">
                        <div className="digital-clock">
                          <div className="clock-date"><i className="fas fa-calendar-alt me-2"></i>{formatClockDate(currentDateTime)}</div>
                          <div className="clock-time"><i className="fas fa-clock me-2"></i>{formatClockTime(currentDateTime)}</div>
                        </div>
                      </div>
                      <div className="d-md-none text-center pb-2">
                        <div className="mobile-clock">
                          <span><i className="fas fa-calendar-alt me-2"></i>{formatClockDate(currentDateTime)}</span>
                          <span className="mx-1"></span>
                          <span><i className="fas fa-clock me-2"></i>{formatClockTime(currentDateTime)}</span>
                        </div>
                      </div>
                      {/* Branch filter tabs */}
                      <div className="d-flex flex-wrap gap-3 mb-3">
                        <button
                          className={`btn ${branchFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setBranchFilter('all')}
                        >
                          <i className="fas fa-globe me-1"></i> All
                        </button>
                        <button
                          className={`btn ${branchFilter === 'isinya' ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setBranchFilter('isinya')}
                        >
                          <i className="fas fa-building me-1"></i> Isinya (Kap North Ward)
                        </button>
                        <button
                          className={`btn ${branchFilter === 'emarti' ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setBranchFilter('emarti')}
                        >
                          <i className="fas fa-store me-1"></i> Emarti Branch (Imaroro Ward)
                        </button>
                      </div>
                      <div className="card mb-4 shadow-sm">
                        <div className="card-body">
                          <div className="row g-3 align-items-end">
                            <div className="col-md-3"><label className="form-label small fw-bold">Search</label><input type="text" className="form-control" placeholder="Name, Collateral, ID, Contact" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                            <div className="col-md-2"><label className="form-label small fw-bold">Payment Plan</label><select className="form-select" value={planFilter} onChange={e => setPlanFilter(e.target.value)}><option value="all">All</option><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="waived">Waived</option></select></div>
                            <div className="col-md-2"><label className="form-label small fw-bold">Day</label><select className="form-select" value={dayFilter} onChange={e => setDayFilter(e.target.value)}><option value="all">All Days</option>{DAYS_ORDER.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                            <div className="col-md-2"><label className="form-label small fw-bold">Borrowed Date</label><input type="date" className="form-control" value={dateFilter} onChange={e => setDateFilter(e.target.value)} /></div>
                            <div className="col-md-3"><label className="form-label small fw-bold">Sort by</label><div className="input-group"><select className="form-select" value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="name">Name</option><option value="date">Borrowed Date</option><option value="principal">Current Principal</option><option value="balance">Accrued Interest</option></select><button className="btn btn-outline-secondary" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>{sortOrder === 'asc' ? <i className="fas fa-arrow-up"></i> : <i className="fas fa-arrow-down"></i>}</button></div></div>
                          </div>
                          {(searchTerm || planFilter !== 'all' || dayFilter !== 'all' || dateFilter || sortBy !== 'name') && (
                            <div className="mt-3 text-end"><button className="btn btn-sm btn-outline-danger" onClick={() => { setSearchTerm(''); setPlanFilter('all'); setDayFilter('all'); setDateFilter(''); setSortBy('name'); setSortOrder('asc'); }}>Clear Filters</button></div>
                          )}
                        </div>
                      </div>
                      {Object.keys(filteredData).length === 0 && <div className="text-center py-5"><i className="fas fa-filter fa-3x text-muted mb-3"></i><h5>No loans match your filters</h5></div>}
                      {DAYS_ORDER.map(day => filteredData[day]?.length > 0 && (
                        <div key={day} className="card mb-4">
                          <div className="card-header bg-primary"><h5 className="mb-0 text-white">{day}</h5></div>
                          <div className="card-body p-0">
                            <div className="table-responsive">
                              <table className="table table-hover mb-0">
                                <thead className="table-light">
                                  <tr><th>Name</th><th>Collateral</th><th>Location</th><th>ID Number</th><th>Contact</th><th>Borrowed Date</th><th>Initial Principal</th><th>Current Principal</th><th>Interest / Period</th><th>Accrued (Unpaid)</th><th>Week</th><th>Actions</th></tr></thead>
                                <tbody>
                                  {filteredData[day].map(loan => {
                                    const badge = getDaysBadge(loan);
                                    return (
                                      <tr key={loan.id}>
                                        <td><div>{loan.name}</div><span className="badge me-1" style={{ backgroundColor: '#fff3cd', color: '#856404' }}>{loan.interest_rate === 0 ? 'Waived' : (loan.repayment_plan === 'daily' ? 'Daily' : 'Weekly')}</span>{badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}</td>
                                        <td>{loan.collateral}</td>
                                        <td>{loan.location}</td>
                                        <td>{loan.id_number}</td>
                                        <td>{loan.contacts}</td>
                                        <td>{fmtDate(loan.disbursement_date)}</td>
                                        <td>
                                          {loan.is_waiver && loan.original_principal ? fmt(loan.original_principal) : fmt(loan.principal_amount)}
                                        </td>
                                        <td>{fmt(loan.current_principal)}</td>
                                        <td>{loan.interest_rate === 0 ? 'waived' : fmt(loan.interest)}</td>
                                        <td className="text-danger fw-bold">{fmt(loan.accrued_interest)}</td>
                                        <td>Week {loan.week}</td>
                                        <td><div className="btn-group btn-group-sm">
                                          {['director','secretary','client_relations_officer','head_of_it','deputy_director','hr_manager'].includes(userRole) && (
                                            <button className="btn btn-outline-primary" onClick={() => { setSelectedLoan(loan); setShowPaymentModal(true); }}><i className="fas fa-money-bill-wave"></i></button>
                                          )}
                                          <button className="btn btn-outline-success" onClick={() => window.location.href = `tel:${loan.contacts}`}><i className="fas fa-phone"></i></button>
                                          <button className="btn btn-outline-info position-relative" onClick={() => { setSelectedLoan(loan); setShowCommentBox(true); }}><i className="fas fa-comment"></i>{commentUnreads[loan.id] > 0 && <span className="badge bg-danger rounded-pill" style={{ position:'absolute', top:'-8px', right:'-8px' }}>{commentUnreads[loan.id]}</span>}</button>
                                          <button className="btn btn-outline-danger btn-sm" onClick={() => handleRecoveryTakeAction(loan)}><i className="fas fa-bolt"></i></button>
                                          <button className="btn btn-outline-info btn-sm" onClick={() => handleDownloadInvoice(loan)}><i className="fas fa-file-invoice"></i></button>
                                          {['director','secretary','client_relations_officer','head_of_it','deputy_director','hr_manager'].includes(userRole) && (loan.days_left <= 0 || loan.overdue_days > 0 || loan.overdue_weeks > 0) && (
                                            <button className="btn btn-outline-warning btn-sm" onClick={() => openRenewalModal(loan)}><i className="fas fa-sync-alt"></i></button>
                                          )}
                                          {['director','secretary','client_relations_officer','head_of_it','deputy_director','hr_manager'].includes(userRole) && (
                                            <button className="btn btn-outline-warning" onClick={() => openTopupModal(loan)}>
                                              <i className="fas fa-edit"></i>
                                            </button>
                                          )}
                                          {['director','secretary','client_relations_officer','head_of_it','deputy_director','hr_manager'].includes(userRole) && (                                            <button
                                              className="btn btn-outline-danger btn-sm"
                                              onClick={() => {
                                                setFlagLoanToConfirm(loan.id);
                                                setFlagLoanName(loan.name);
                                                setShowFlagConfirmModal(true);
                                              }}
                                              title="Flag as defaulter – moves to valuer"
                                            >
                                              <i className="fas fa-flag"></i>
                                            </button>
                                          )}
                                        </div></td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="table-secondary fw-bold">{(() => { const t = dayTotals(filteredData[day]); return (<tr><td colSpan="6">Day Totals</td><td>{fmt(t.principal)}</td><td>{fmt(t.curPrincipal)}</td><td>{fmt(t.interest)}</td><td className="text-danger">{fmt(t.accrued)}</td><td colSpan="2"></td></tr>); })()}</tfoot>
                              </table>
                            </div>
                          </div>
                        </div>
                      ))}
                      {Object.keys(filteredData).length > 0 && (() => { const t = overallTotals(); return (<div className="card mt-2 mb-4"><div className="card-header bg-dark"><h5 className="mb-0 text-white">Overall Totals</h5></div><div className="card-body"><div className="row text-center"><div className="col-md-3"><p className="mb-1 text-muted fw-bold">Initial Principal</p><h5>{fmt(t.principal)}</h5></div><div className="col-md-3"><p className="mb-1 text-muted fw-bold">Current Principal</p><h5>{fmt(t.curPrincipal)}</h5></div><div className="col-md-3"><p className="mb-1 text-muted fw-bold">Periodic Interest</p><h5>{fmt(t.interest)}</h5></div><div className="col-md-3"><p className="mb-1 text-muted fw-bold">Accrued (Unpaid)</p><h5 className="text-danger">{fmt(t.accrued)}</h5></div></div><div className="row mt-3 pt-2 border-top text-center"><div className="col-12"><p className="mb-1 text-muted fw-bold">Total Owed (Current Principal + Accrued Interest)</p><h3 className="text-primary">{fmt(t.curPrincipal + t.accrued)}</h3></div></div></div></div>); })()}
                    </>
                  )}
            
                  {/* APPLICATIONS SECTION */}
                  {directorSection === 'applications' && (
                    <div id="applications-section" className="content-section">
                      <h2>Loan Applications</h2>
                      <ul className="nav nav-tabs mb-4" id="applicationsTab">
                        <li className="nav-item">
                          <button
                            className={`nav-link ${applicationsTab === 'pending' ? 'active' : ''}`}
                            onClick={() => setApplicationsTab('pending')}
                          >
                            Pending Applications
                            {applications.filter(a => a.status === 'pending').length > 0 && (
                              <span className="badge bg-warning ms-2">
                                {applications.filter(a => a.status === 'pending').length}
                              </span>
                            )}
                          </button>
                        </li>
                        <li className="nav-item">
                          <button
                            className={`nav-link ${applicationsTab === 'approved' ? 'active' : ''}`}
                            onClick={() => setApplicationsTab('approved')}
                          >
                            Approved Loans
                            <span className="badge bg-success ms-2">{approvedLoans.length}</span>
                          </button>
                        </li>
                      </ul>
                          
                      {/* Pending Applications Tab */}
                      {applicationsTab === 'pending' && (
                        <>
                          <div className="search-filter-row mb-4">
                            <div>
                              <label className="form-label small text-muted mb-1">Search Applications</label>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Search by name, phone, livestock..."
                                value={pendingSearch}
                                onChange={(e) => setPendingSearch(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label small text-muted mb-1">Application Date</label>
                              <input
                                type="date"
                                className="form-control"
                                value={pendingDate}
                                onChange={(e) => setPendingDate(e.target.value)}
                              />
                            </div>
                          </div>
                          {applicationsLoading ? (
                            <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                          ) : filterPendingApplications().length === 0 ? (
                            <div className="card">
                              <div className="card-body text-center py-5">
                                <i className="fas fa-file-alt fa-3x text-muted mb-3"></i>
                                <h5 className="text-muted">No Pending Applications</h5>
                                <p className="text-muted">No pending loan applications at the moment.</p>
                              </div>
                            </div>
                          ) : (
                            <AdminTable
                              columns={[
                                { header: "Date", render: row => formatDate(row.date) },
                                { header: "Name", field: "name" },
                                { header: "Phone", field: "phone" },
                                { header: "Amount", render: row => fmt(row.loanAmount) },
                                { header: "Livestock", render: row => `${row.livestockCount || ''} ${row.livestockType || ''}` },
                                { header: "Status", render: () => <span className="badge bg-warning">Pending</span> },
                                { header: "Actions", render: row => (
                                  <div className="btn-group btn-group-sm">
                                    <button className="btn btn-outline-success" onClick={() => handleApplicationAction(row.id, "approve")}><i className="fas fa-check"></i></button>
                                    <button className="btn btn-outline-danger" onClick={() => handleApplicationAction(row.id, "reject")}><i className="fas fa-times"></i></button>
                                    <button className="btn btn-outline-info" onClick={() => { setSelectedApplication(row); setShowApplicationModal(true); }}><i className="fas fa-eye"></i></button>
                                  </div>
                                ) }
                              ]}
                              data={filterPendingApplications()}
                            />
                          )}
                        </>
                      )}
            
                      {/* Approved Loans Tab */}
                      {applicationsTab === 'approved' && (
                        <>
                          <div className="search-filter-row mb-4">
                            <div>
                              <label className="form-label small text-muted mb-1">Search Loans</label>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Search by name, phone..."
                                value={approvedSearch}
                                onChange={(e) => setApprovedSearch(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label small text-muted mb-1">Approval Date</label>
                              <input
                                type="date"
                                className="form-control"
                                value={approvedDate}
                                onChange={(e) => setApprovedDate(e.target.value)}
                              />
                            </div>
                          </div>
                          {approvedLoansLoading ? (
                            <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                          ) : filterApprovedLoans().length === 0 ? (
                            <div className="card">
                              <div className="card-body text-center py-5">
                                <i className="fas fa-file-contract fa-3x text-muted mb-3"></i>
                                <h5 className="text-muted">
                                  {approvedLoans.length === 0 ? "No Approved Loans" : "No Loans Match Your Filters"}
                                </h5>
                                <p className="text-muted">
                                  {approvedLoans.length === 0 
                                    ? "No approved loans found." 
                                    : "Try adjusting your search or date criteria."}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <AdminTable
                              columns={[
                                { header: "Approved Date", render: row => formatDate(row.date) },
                                { header: "Name", field: "name" },
                                { header: "Phone", field: "phone" },
                                { header: "ID Number", field: "idNumber" },
                                { header: "Loan Amount", render: row => fmt(row.loanAmount) },
                                { header: "Payment Plan", render: row => row.repayment_plan === 'daily' ? 'Daily (4.5%)' : 'Weekly (30%)' },
                                { header: "Actions", render: row => (
                                  <div className="btn-group btn-group-sm">
                                    <button className="btn btn-outline-info" onClick={() => {
                                      setSelectedApplication(row);
                                      setShowApplicationModal(true);
                                      }}>
                                      <i className="fas fa-eye"></i>
                                    </button>
                                    <button 
                                      className="btn btn-outline-success" 
                                      onClick={async () => {
                                      await generateLoanAgreementPDF({ ...row, repaymentPlan: row.repayment_plan });
                                      showToast.success("Agreement downloaded");
                                      }}
                                      title="Download loan agreement"
                                      >
                                      
                                      <i className="fas fa-download"></i>
                                    </button>
                                    <button 
                                      className="btn btn-outline-warning" 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await generateNextOfKinConsentPDF(row);
                                          showToast.success("Next of Kin consent form downloaded!");
                                        } catch (error) {
                                          console.error("Error generating next of kin consent:", error);
                                          showToast.error("Failed to download next of kin consent form");
                                        }
                                      }}
                                      title="Download Next of Kin Consent"
                                    >
                                      <i className="fas fa-user-friends"></i>
                                    </button>
                                  </div>
                                ) }
                              ]}
                              data={filterApprovedLoans()}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
            
                  {/* PAYMENT STATS SECTION */}
                  {directorSection === 'payment-stats' && (
                    <div id="payment-stats-section" className="content-section">
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <h2>Payment Statistics</h2>
                        <div className="d-flex gap-2">
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Search by name or phone..." 
                            value={paymentStatsSearch}
                            onChange={e => setPaymentStatsSearch(e.target.value)} 
                          />
                          <select 
                            className="form-select" 
                            value={paymentStatsStatus} 
                            onChange={e => setPaymentStatsStatus(e.target.value)}
                          >
                            <option value="all">All</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                            <option value="claimed">Claimed</option>
                          </select>
                        </div>
                      </div>
                      <div className="row mb-4">
                        <div className="col-md-3 mb-3"><AdminCard title="Total Principal Collected" value={fmt(paymentStats.total_principal_collected)} icon="fa-coins" color="success" /></div>
                        <div className="col-md-3 mb-3"><AdminCard title="Currently Lent" value={fmt(paymentStats.currently_lent)} icon="fa-hand-holding-usd" color="info" /></div>
                        <div className="col-md-3 mb-3"><AdminCard title="Available for Lending" value={fmt(paymentStats.available_for_lending)} icon="fa-piggy-bank" color="primary" /></div>
                        <div className="col-md-3 mb-3"><AdminCard title="Revenue Collected" value={fmt(paymentStats.revenue_collected)} icon="fa-chart-line" color="warning" /></div>
                      </div>
                      <div className="card"><div className="card-body">
                        {paymentStatsLoading ? (
                          <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                        ) : (
                          (() => {
                            const filteredStats = paymentStats.payment_stats.filter(stat => {
                              if (paymentStatsSearch) { 
                                const term = paymentStatsSearch.toLowerCase(); 
                                if (!stat.name?.toLowerCase().includes(term) && !stat.phone?.toLowerCase().includes(term)) return false; 
                              }
                              if (paymentStatsStatus !== 'all') { 
                                  if (paymentStatsStatus === 'active' && stat.status !== 'active') return false; 
                                  if (paymentStatsStatus === 'completed' && stat.status !== 'completed') return false; 
                                  if (paymentStatsStatus === 'claimed' && stat.status !== 'claimed') return false; 
                              }
                              return true;
                            });
                            return filteredStats.length === 0 ? (
                              <div className="text-center py-5">
                                <i className="fas fa-chart-bar fa-3x text-muted mb-3"></i>
                                <h5 className="text-muted">No Payment Data</h5>
                                <p className="text-muted">
                                  {paymentStats.payment_stats.length === 0 
                                    ? "No principal payments have been recorded yet."
                                    : "No results match your filters."}
                                </p>
                              </div>
                            ) : (
                              <AdminTable columns={[
                                { header: "Name", field: "name" }, { header: "Phone", field: "phone" },
                                { header: "Borrowed Date", render: row => formatDate(row.borrowed_date) },
                                { header: "Amount Borrowed", render: row => fmt(row.borrowed_amount) },
                                { header: "Principal Paid", render: row => fmt(row.principal_paid) },
                                { header: "Current Principal", render: row => fmt(row.current_principal) },
                                { header: "Interest Paid", render: row => <span className="text-warning fw-bold">{fmt(row.interest_paid)}</span> },
                                {
                                  header: "Status",
                                  render: (row) => (
                                    <span className={`badge ${
                                      row.status === 'active' ? 'bg-success' :
                                      row.status === 'completed' ? 'bg-secondary' :
                                      row.status === 'claimed' ? 'bg-danger' : 'bg-warning'
                                    }`}>
                                      {row.status.toUpperCase()}
                                    </span>
                                  ),
                                },
                                {
                                  header: "Actions",
                                  render: row => (
                                    <div className="btn-group btn-group-sm">
                                      {/* Statement download button (existing) */}
                                      <button 
                                        className="btn btn-sm btn-outline-info" 
                                        onClick={async () => {
                                          const clientForStatement = {
                                            name: row.name,
                                            phone: row.phone || 'N/A',
                                            idNumber: row.id_number || 'N/A',
                                            loan_id: row.id,
                                            borrowedAmount: row.borrowed_amount || 0,
                                            borrowedDate: row.borrowed_date,
                                            expectedReturnDate: row.expected_return_date || null,
                                            amountPaid: (row.principal_paid || 0) + (row.interest_paid || 0),
                                            balance: (row.current_principal || 0) + ((row.accrued_interest || 0) - (row.interest_paid || 0))
                                          };
                                          const loanTransactions = transactions.filter(t => t.loan_id === row.id);
                                          await generateClientStatement(clientForStatement);
                                          showToast.success(`Statement for ${row.name} downloaded!`);
                                        }}
                                        title='Download Loan statement (PDF)'
                                      >
                                        <i className="fas fa-download"></i>
                                      </button>
                                      
                                      {/* NEW: Thank‑You button – only for completed loans */}
                                      {row.status === 'completed' && (
                                        <button
                                          className="btn btn-sm btn-outline-success"
                                          onClick={() => {
                                            const message = `Hello ${row.name}, your payment has been received and the loan has been settled. Thank you for choosing Nagolie Enterprises. Welcome back!`;
                                            handleSendReminder({ name: row.name, phone: row.phone }, message);
                                          }}
                                          title="Send thank‑you message"
                                        >
                                          <i className="fas fa-envelope"></i>
                                        </button>
                                      )}
                                    </div>
                                  )
                                }
                              ]} data={filteredStats} />
                            );
                          })()
                        )}
                      </div></div>
                    </div>
                  )}
            
                  {/* TRANSACTIONS SECTION */}
                  {directorSection === 'transactions' && (
                    <div id="transactions-section" className="content-section">
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <h2>Transaction Monitoring</h2>
                        <div className="d-flex gap-2">
                          <input 
                            type="date" 
                            className="form-control" 
                            value={transactionDate}
                            onChange={(e) => setTransactionDate(e.target.value)}
                          />
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Search transactions..." 
                            value={transactionSearch}
                            onChange={(e) => setTransactionSearch(e.target.value)}
                          />
                        </div>
                      </div>
                  
                      <div className="card">
                        <div className="card-body">
                          {transactionsLoading ? (
                            <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                          ) : (() => {
                            const filtered = transactions.filter(t => {
                              if (transactionSearch && !t.clientName?.toLowerCase().includes(transactionSearch.toLowerCase())) return false;
                              if (transactionDate) { 
                                const d = new Date(t.createdAt || t.date || t.created_at).toISOString().split('T')[0]; 
                                if (d !== transactionDate) return false; 
                              }
                              return true;
                            });
                            return filtered.length === 0 ? (
                              <div className="text-center py-5">
                                <i className="fas fa-exchange-alt fa-3x text-muted mb-3"></i>
                                <h5 className="text-muted">
                                  {transactions.length === 0 ? "No Transactions" : "No Transactions Match Your Filters"}
                                </h5>
                                <p className="text-muted">
                                  {transactions.length === 0 
                                    ? "Transactions will appear here when payments are processed." 
                                    : "Try adjusting your search or date criteria."}
                                </p>
                              </div>
                            ) : (
                              <AdminTable
                                columns={[
                                  { header: "Date", render: row => formatDate(row.createdAt || row.date || row.created_at) },
                                  { header: "Client", field: "clientName" },
                                  { 
                                    header: "Type", 
                                    render: row => {
                                      const type = row.type || '';
                                      const paymentType = row.payment_type || '';
                                      let displayType = type.charAt(0).toUpperCase() + type.slice(1);
                                      if (type === 'payment') {
                                        displayType = paymentType === 'principal' ? 'Principal Payment' : 
                                                      paymentType === 'interest' ? 'Interest Payment' : 'Payment';
                                      }
                                      let badgeClass = 'bg-success';
                                      if (type === 'topup') badgeClass = 'bg-info';
                                      else if (type === 'adjustment') badgeClass = 'bg-warning';
                                      else if (type === 'claim') badgeClass = 'bg-danger';
                                      else if (type === 'investor_return') badgeClass = 'bg-secondary';
                                      else if (type === 'disbursement') badgeClass = 'bg-primary';
                                      return <span className={`badge ${badgeClass}`}>{displayType}</span>;
                                    }
                                  },
                                  { header: "Amount", render: row => fmt(row.amount) },
                                  { 
                                    header: "Method", 
                                    render: row => (
                                      <span className={`badge ${row.method === "mpesa" ? "bg-info" : "bg-secondary"}`}>
                                        {row.method?.toUpperCase() || 'CASH'}
                                      </span>
                                    )
                                  },
                                  { 
                                    header: "Status", 
                                    render: row => <span className="badge bg-success">{row.status || 'Completed'}</span>
                                  },
                                  {
                                    header: "Actions",
                                    render: row => (
                                      <button 
                                        className="btn btn-sm btn-outline-info"
                                        onClick={async () => {
                                          await generateTransactionReceipt(row);
                                          showToast.success(`Transaction receipt for ${row.clientName} downloaded!`);
                                        }}
                                        title="Download Receipt"
                                      >
                                        <i className="fas fa-download"></i>
                                      </button>
                                    ),
                                  },
                                ]}
                                data={filtered}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
            
                  {/* LIVESTOCK GALLERY SECTION */}
                  {directorSection === 'gallery' && (
                    <div id="gallery-section" className="content-section">
                      <div className="d-flex justify-content-between align-items-center mb-4"><h2>Livestock Gallery Management</h2><button className="btn btn-primary" onClick={() => setShowAddLivestockModal(true)}><i className="fas fa-plus me-1"></i>Add Livestock</button></div>
                      {livestockLoading ? <div className="text-center py-5"><div className="spinner-border text-primary"></div></div> :
                        <div className="row">{livestock.map(item => (
                          <div key={item.id} className="col-md-6 col-lg-4 mb-4">
                            <div className="card h-100">
                              <ImageCarousel images={item.images} title={item.title} />
                              <div className="card-body">
                                <h5 className="card-title">{item.title}</h5>
                                <p className="card-text">{item.description}</p>
                                <div className="d-flex justify-content-between align-items-center mb-2"><span className="h6 text-primary">{fmt(item.price)}</span><span className="badge bg-warning">{item.availableInfo}</span></div>
                                {item.ownership_type === 'investor' && item.investor_name && (<small className="text-muted mb-2"><i className="fas fa-user-tie me-1"></i>Owned by Investor: {item.investor_name}</small>)}
                                {item.ownership_type === 'company' && !item.isAdminAdded && (<small className="text-muted mb-2"><i className="fas fa-hand-holding-usd me-1"></i>Loan Collateral (Company Owned)</small>)}
                                {item.isAdminAdded && (<small className="text-muted mb-2"><i className="fas fa-user-tie me-1"></i>Admin Added</small>)}
                                <div className="mt-auto">
                                  <button className="btn btn-sm btn-outline-primary me-2" onClick={() => handleEditLivestock(item)}><i className="fas fa-edit"></i> Edit</button>
                                  <button className="btn btn-sm btn-outline-info me-2" onClick={() => openShareModal(item)}><i className="fas fa-share-alt"></i> Share</button>
                                  <button className="btn btn-sm btn-outline-danger" onClick={() => confirmDeleteLivestock(item.id)}><i className="fas fa-trash"></i> Delete</button>
                                </div>
                              </div>
                            </div>
                          </div>))}</div>}
                    </div>
                  )}
            
                  {/* COMPANY GALLERY SECTION */}
                  {directorSection === 'company-gallery' && (
                    <AdminCompanyGallery />
                  )}
            
                  {/* REPORT MANAGEMENT SECTION */}
                  {directorSection === 'report-management' && (
                    <ReportManagement />
                  )}
            
                  {/* INVESTORS SECTION */}
                  {directorSection === 'investors' && (
                    <div id="investors-section" className="content-section">
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <h2>Investor Management</h2>
                        {isInvestorSectionAuthenticated ? (
                          <div className="d-flex gap-2">
                            <button className="btn btn-sm btn-outline-danger" onClick={handleInvestorSectionLogout}>
                              <i className="fas fa-lock me-1"></i>Lock Section
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowAddInvestorModal(true)}>
                              <i className="fas fa-plus me-1"></i>Add Investor
                            </button>
                          </div>
                        ) : (
                          <button className="btn btn-primary" onClick={handleInvestorSectionClick}>
                            <i className="fas fa-unlock me-1"></i>Unlock Investor Section
                          </button>
                        )}
                      </div>
                      
                      {!isInvestorSectionAuthenticated ? (
                        <div className="text-center py-5">
                          <i className="fas fa-lock fa-3x text-muted mb-3"></i>
                          <h5 className="text-muted">Investor Section Locked</h5>
                          <p className="text-muted">Click "Unlock Investor Section" to access investor management</p>
                        </div>
                      ) : (
                        <>
                          <ul className="nav nav-tabs mb-4" id="investorsTab">
                            <li className="nav-item">
                              <button
                                className={`nav-link ${investorTab === "investors" ? "active" : ""}`}
                                onClick={() => { setInvestorTab("investors"); fetchInvestors(); }}
                              >
                                <i className="fas fa-users me-1"></i>
                                <span className="investors-tab-text-long">Investors</span>
                                <span className="investors-tab-text-short">Investors</span>
                                <span className="badge bg-info ms-1">{investors.length}</span>
                              </button>
                            </li>
                            <li className="nav-item">
                              <button
                                className={`nav-link ${investorTab === "transactions" ? "active" : ""}`}
                                onClick={() => { setInvestorTab("transactions"); fetchInvestorTransactions(); }}
                              >
                                <i className="fas fa-exchange-alt me-1"></i>
                                <span className="investors-tab-text-long">Transactions</span>
                                <span className="investors-tab-text-short">Transactions</span>
                                <span className="badge bg-success ms-1">{investorTransactions.length}</span>
                              </button>
                            </li>
                          </ul>
                      
                          {/* Investors Tab */}
                          {investorTab === "investors" && (
                            <>
                              <div className="search-filter-row mb-4">
                                <div>
                                  <label className="form-label small text-muted mb-1">Search Investors</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search by name, phone, ID..."
                                    value={investorSearch}
                                    onChange={(e) => setInvestorSearch(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="form-label small text-muted mb-1">Filter by Status</label>
                                  <select
                                    className="form-select"
                                    value={investorFilter}
                                    onChange={(e) => setInvestorFilter(e.target.value)}
                                  >
                                    <option value="">All Investors</option>
                                    <option value="active">Active</option>
                                    <option value="pending">Pending</option>
                                    <option value="inactive">Inactive</option>
                                  </select>
                                </div>
                              </div>
                          
                              {investorsLoading ? (
                                <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                              ) : filterInvestors().length === 0 ? (
                                <div className="card">
                                  <div className="card-body text-center py-5">
                                    <i className="fas fa-users fa-3x text-muted mb-3"></i>
                                    <h5 className="text-muted">No Investors Found</h5>
                                    <p className="text-muted">Try adjusting your search or filter criteria.</p>
                                  </div>
                                </div>
                              ) : (
                                <AdminTable
                                  columns={[
                                    { header: "Name", field: "name" },
                                    { header: "Phone", field: "phone" },
                                    { header: "ID Number", field: "id_number" },
                                    { header: "Email", field: "email" },
                                    { header: "Investment Amount", render: row => fmt(row.investment_amount) },
                                    { header: "Investment Date", render: row => formatDate(row.invested_date) },
                                    {
                                      header: "Next Return",
                                      render: row => {
                                        const nextDate = new Date(row.next_return_date);
                                        const today = new Date();
                                        const daysDiff = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
                                        let badgeClass = daysDiff <= 0 ? "bg-danger" : daysDiff <= 2 ? "bg-warning" : "bg-success";
                                        return (
                                          <span className={`badge ${badgeClass}`}>
                                            {formatDate(row.next_return_date)}
                                            {daysDiff <= 0 && " (Due)"}
                                          </span>
                                        );
                                      }
                                    },
                                    { header: "Total Returns", render: row => fmt(row.total_returns_received) },
                                    { header: "Returns Owed", render: row => fmt(row.outstanding_returns || 0) },
                                    { header: "Credit Balance", render: row => fmt(row.credit_balance || 0) },
                                    {
                                      header: "Status",
                                      render: row => (
                                        <span className={`badge ${
                                          row.account_status === 'active' ? 'bg-success' :
                                          row.account_status === 'pending' ? 'bg-warning' : 'bg-secondary'
                                        }`}>
                                          {row.account_status?.toUpperCase()}
                                        </span>
                                      )
                                    },
                                    {
                                      header: "Actions",
                                      render: row => (
                                        <div className="btn-group btn-group-sm">
                                          <button className="btn btn-outline-info" onClick={() => { setSelectedInvestor(row); setShowViewInvestorModal(true); }}>
                                            <i className="fas fa-eye"></i>
                                          </button>
                                          <button className="btn btn-outline-warning" onClick={() => handleEditInvestor(row)}>
                                            <i className="fas fa-edit"></i>
                                          </button>
                                          {row.account_status === "pending" && (
                                            <button className="btn btn-outline-success" onClick={() => handleGenerateShareLink(row)} disabled={generatingLink}>
                                              <i className="fas fa-share-alt"></i>
                                            </button>
                                          )}
                                          {row.account_status === "active" && (
                                            <>
                                              <button className="btn btn-outline-primary" onClick={() => handleProcessReturn(row)}>
                                                <i className="fas fa-money-bill-wave"></i>
                                              </button>
                                              <button className="btn btn-outline-secondary" onClick={() => generateInvestorStatementPDF(row, investorTransactions)}>
                                                <i className="fas fa-file-alt"></i>
                                              </button>
                                            </>
                                          )}
                                          <button className={`btn btn-outline-${row.account_status === "active" ? "danger" : "success"}`} onClick={() => handleToggleAccountStatus(row)}>
                                            <i className={`fas fa-${row.account_status === "active" ? "ban" : "check"}`}></i>
                                          </button>
                                          <button className="btn btn-outline-danger" onClick={() => handleDeleteInvestor(row)}>
                                            <i className="fas fa-trash"></i>
                                          </button>
                                        </div>
                                      )
                                    }
                                  ]}
                                  data={filterInvestors()}
                                />
                              )}
                            </>
                          )}
            
                          {/* Transactions Tab */}
                          {investorTab === "transactions" && (
                            <>
                              <div className="search-filter-row mb-4">
                                <div>
                                  <label className="form-label small text-muted mb-1">Search Transactions</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search by investor name..."
                                    value={investorTransactionSearch}
                                    onChange={(e) => setInvestorTransactionSearch(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="form-label small text-muted mb-1">Transaction Date</label>
                                  <input
                                    type="date"
                                    className="form-control"
                                    value={investorTransactionDate}
                                    onChange={(e) => setInvestorTransactionDate(e.target.value)}
                                  />
                                </div>
                              </div>
                          
                              {investorTransactionsLoading ? (
                                <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                              ) : filterInvestorTransactions().length === 0 ? (
                                <div className="card">
                                  <div className="card-body text-center py-5">
                                    <i className="fas fa-exchange-alt fa-3x text-muted mb-3"></i>
                                    <h5 className="text-muted">No Transactions Found</h5>
                                    <p className="text-muted">Try adjusting your search or date criteria.</p>
                                  </div>
                                </div>
                              ) : (
                                <AdminTable
                                  columns={[
                                    { header: "Date", render: row => formatDate(row.date || row.return_date || row.created_at) },
                                    { header: "Investor", field: "investor_name" },
                                    {
                                      header: "Type",
                                      render: row => {
                                        const type = (row.type || "").toLowerCase();
                                        let badgeClass = "bg-success";
                                        if (type === 'return') badgeClass = "bg-success";
                                        else if (type === 'topup') badgeClass = "bg-info";
                                        else if (type === 'adjustment') badgeClass = "bg-warning";
                                        else if (type === 'disbursement') badgeClass = "bg-primary";
                                        return <span className={`badge ${badgeClass}`}>{row.type}</span>;
                                      }
                                    },
                                    { header: "Amount", render: row => fmt(row.amount) },
                                    { header: "Method", render: row => <span className="badge bg-secondary">{row.method?.toUpperCase() || "CASH"}</span> },
                                    { header: "Reference", field: "mpesa_receipt" },
                                    {
                                      header: "Actions",
                                      render: row => (
                                        <button
                                          className="btn btn-sm btn-outline-info"
                                          onClick={async () => {
                                            await generateInvestorTransactionReceipt(row);
                                            showToast.success(`Transaction receipt for ${row.investor_name} downloaded!`);
                                          }}
                                          title="Download Receipt"
                                        >
                                          <i className="fas fa-download"></i>
                                        </button>
                                      )
                                    }
                                  ]}
                                  data={filterInvestorTransactions()}
                                />
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
            
                  {/* UTILITIES */}
                  {directorSection === 'utilities' && <UtilitiesPanel userRole={userRole} restrictedMode={true} />}
                
                  {/* REPORTS */}
                  {directorSection === 'reports' && <ReportsPanel />}
                
                  {/* MODALS (identical to AdminPanel)*/}
                  {showApplicationModal && selectedApplication && (
                    <Modal isOpen={showApplicationModal} onClose={() => setShowApplicationModal(false)} title="Application Details" size="lg">
                      <div className="row">
                        <div className="col-md-6">
                          <p><strong>Name:</strong> {selectedApplication.name || 'N/A'}</p>
                          <p><strong>Phone:</strong> {selectedApplication.phone || 'N/A'}</p>
                          <p><strong>ID Number:</strong> {selectedApplication.idNumber || 'N/A'}</p>
                          <p><strong>Loan Amount:</strong> {fmt(selectedApplication.loanAmount)}</p>
                          <p><strong>Payment Plan:</strong> {selectedApplication.repayment_plan === 'daily' ? 'Daily – 4.5% per day' : 'Weekly – 30% interest'}</p>
                          <p><strong>Livestock:</strong> {selectedApplication.livestockCount || 'N/A'} {selectedApplication.livestockType || 'N/A'}</p>
                          <p><strong>Production Classification:</strong> {selectedApplication.production_classification || 'Not specified'}</p>
                          <p><strong>Estimated Value:</strong> {fmt(selectedApplication.estimatedValue)}</p>
                          <p><strong>Location:</strong> {selectedApplication.location || 'N/A'}</p>
                          <p><strong>Additional Info:</strong> {selectedApplication.additionalInfo || "None"}</p>
                          {selectedApplication.status === 'active' && <p><strong>Approval Date:</strong> {formatDate(selectedApplication.date)}</p>}
                        </div>
                        <div className="col-md-6">
                          <strong>Photos:</strong>
                          <div className="row mt-2">
                            {selectedApplication.photos && selectedApplication.photos.length > 0 ? selectedApplication.photos.map((photo, idx) => (
                              <div key={idx} className="col-6 mb-2"><img src={photo} alt="livestock" className="img-fluid rounded" style={{ cursor:'pointer', height:'120px', width:'100%', objectFit:'cover' }} onClick={() => { setSelectedImage(photo); setShowImageModal(true); }} /></div>
                            )) : <p className="text-muted">No photos provided</p>}
                          </div>
                        </div>
                      </div>
                      {selectedApplication.status === "pending" && (
                        <div className="mt-4 d-flex gap-2">
                          <button className="btn btn-success" onClick={() => handleApplicationAction(selectedApplication.id, "approve")}>Approve</button>
                          <button className="btn btn-danger" onClick={() => handleApplicationAction(selectedApplication.id, "reject")}>Reject</button>
                        </div>
                      )}
                    </Modal>
                  )}

                  {/* LOAN REPORTS SECTION */}
                  {directorSection === 'loan-reports' &&<UnifiedReportsTabs />}

                  {directorSection === 'salaries' && (
                    <SalaryManagement />
                  )}
            
                  {showApprovalModal && applicationToApprove && (
                    <LoanApprovalModal isOpen={showApprovalModal} onClose={() => setShowApprovalModal(false)} onApprove={(loanId, fundingData) => handleApplicationAction(loanId, 'approve', fundingData)} application={applicationToApprove} investors={investors} loading={approvingLoan} />
                  )}
            
                  {showImageModal && selectedImage && (
                    <Modal isOpen={showImageModal} onClose={() => { setShowImageModal(false); setSelectedImage(null); }} title="Livestock Photo" size="lg"><div className="text-center"><img src={selectedImage} alt="Livestock" className="img-fluid rounded" style={{ maxHeight:'70vh' }} /></div></Modal>
                  )}
                  {showAddLivestockModal && (
                    <Modal isOpen={showAddLivestockModal} onClose={() => setShowAddLivestockModal(false)} title="Add Livestock to Gallery" size="lg">
                      <form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.target); await handleAddLivestock({ type: fd.get('type'), count: parseInt(fd.get('count')), price: parseFloat(fd.get('price')), description: fd.get('description') || 'Available for purchase', location: fd.get('location') || 'Isinya, Kajiado', images: selectedImages }); setSelectedImages([]); }}>
                        <div className="row"><div className="col-md-6 mb-3"><label className="form-label">Livestock Type *</label><select className="form-control" name="type" required><option value="cattle">Cattle</option><option value="goats">Goats</option><option value="sheep">Sheep</option><option value="poultry">Poultry</option></select></div><div className="col-md-6 mb-3"><label className="form-label">Count *</label><input type="number" className="form-control" name="count" min="1" required /></div></div>
                        <div className="mb-3"><label className="form-label">Price (KSh) *</label><input type="number" className="form-control" name="price" min="1" required /></div>
                        <div className="row"><div className="col-md-6 mb-3"><label className="form-label">Description</label><textarea className="form-control" name="description" rows="3" placeholder="Brief description" /></div><div className="col-md-6 mb-3"><label className="form-label">Location</label><input type="text" className="form-control" name="location" placeholder="Isinya, Kajiado" defaultValue="Isinya, Kajiado" /></div></div>
                        <div className="mb-3"><label className="form-label">Upload Images</label><input type="file" className="form-control" multiple accept="image/*" onChange={handleImageUpload} disabled={imageUploading} /><small className="text-muted">You can select multiple images</small></div>
                        {selectedImages.length > 0 && (<div className="mt-3"><label>Image Previews:</label><div className="row">{selectedImages.map((img, idx) => (<div key={idx} className="col-3 mb-2 position-relative"><img src={img} className="img-thumbnail" style={{ height:'80px', objectFit:'cover' }} /><button type="button" className="btn btn-danger btn-sm position-absolute top-0 end-0" onClick={() => removeImage(idx)}>×</button></div>))}</div></div>)}
                        <div className="alert alert-info">This livestock will be added to the public gallery and marked as available immediately.</div>
                        <div className="d-flex gap-2"><button type="submit" className="btn btn-primary">Add to Gallery</button><button type="button" className="btn btn-secondary" onClick={() => { setShowAddLivestockModal(false); setSelectedImages([]); }}>Cancel</button></div>
                      </form>
                    </Modal>
                  )}
            
                  {showEditLivestockModal && editingLivestock && (
                    <Modal isOpen={showEditLivestockModal} onClose={() => { setShowEditLivestockModal(false); setEditingLivestock(null); setSelectedImages([]); }} title="Edit Livestock" size="lg">
                      <form onSubmit={handleUpdateLivestock}>
                        <div className="row"><div className="col-md-6 mb-3"><label className="form-label">Livestock Type *</label><select className="form-control" name="editType" defaultValue={editingLivestock.type}><option value="cattle">Cattle</option><option value="goats">Goats</option><option value="sheep">Sheep</option><option value="poultry">Poultry</option></select></div><div className="col-md-6 mb-3"><label className="form-label">Count *</label><input type="number" className="form-control" name="editCount" defaultValue={editingLivestock.count} min="1" required /></div></div>
                        <div className="mb-3"><label className="form-label">Price (KSh) *</label><input type="number" className="form-control" name="editPrice" defaultValue={editingLivestock.price} min="1" required /></div>
                        <div className="row"><div className="col-md-6 mb-3"><label className="form-label">Description</label><textarea className="form-control" name="editDescription" rows="3" defaultValue={editingLivestock.description} /></div><div className="col-md-6 mb-3"><label className="form-label">Location</label><input type="text" className="form-control" name="editLocation" defaultValue={editingLivestock.location} /></div></div>
                        <div className="mb-3"><label className="form-label">Update Images</label><input type="file" className="form-control" multiple accept="image/*" onChange={handleImageUpload} disabled={imageUploading} /><small className="text-muted">Select new images to replace or add</small></div>
                        {selectedImages.length > 0 && (<div className="mt-3"><label>Current Images:</label><div className="row">{selectedImages.map((img, idx) => (<div key={idx} className="col-3 position-relative"><img src={img} className="img-thumbnail" style={{ height:'100px', objectFit:'cover' }} /><button type="button" className="btn btn-danger btn-sm position-absolute top-0 end-0" onClick={() => removeImage(idx)}>×</button></div>))}</div></div>)}
                        <div className="d-flex justify-content-end gap-2 mt-4"><button type="submit" className="btn btn-primary">Update Livestock</button><button type="button" className="btn btn-secondary" onClick={() => { setShowEditLivestockModal(false); setEditingLivestock(null); setSelectedImages([]); }}>Cancel</button></div>
                      </form>
                    </Modal>
                  )}
            
                  {showShareLinkModal && <ShareLinkModal isOpen={showShareLinkModal} onClose={() => setShowShareLinkModal(false)} shareLinkData={shareLinkData} />}
                  {showViewInvestorModal && selectedInvestor && (
                    <Modal isOpen={showViewInvestorModal} onClose={() => { setShowViewInvestorModal(false); setSelectedInvestor(null); }} title="Investor Details" size="lg">
                      <div className="row">
                        <div className="col-md-6"><p><strong>Name:</strong> {selectedInvestor.name}</p><p><strong>Phone:</strong> {selectedInvestor.phone}</p><p><strong>ID Number:</strong> {selectedInvestor.id_number}</p><p><strong>Email:</strong> {selectedInvestor.email || 'N/A'}</p></div>
                        <div className="col-md-6"><p><strong>Investment Amount:</strong> {fmt(selectedInvestor.investment_amount)}</p><p><strong>Investment Date:</strong> {formatDate(selectedInvestor.invested_date)}</p><p><strong>Total Returns Received:</strong> {fmt(selectedInvestor.total_returns_received)}</p><p><strong>Next Return Date:</strong> {formatDate(selectedInvestor.next_return_date)}</p><p><strong>Status:</strong> <span className={`badge ms-2 ${selectedInvestor.account_status === 'active' ? 'bg-success' : selectedInvestor.account_status === 'pending' ? 'bg-warning' : 'bg-secondary'}`}>{selectedInvestor.account_status?.toUpperCase()}</span></p></div>
                      </div>
                      {selectedInvestor.agreement_document && (<div className="mb-3"><strong>Agreement Details:</strong><div className="card mt-2"><div className="card-body">{selectedInvestor.agreement_document}</div></div></div>)}
                      <div className="d-flex gap-2 justify-content-end mt-4"><button className="btn btn-success" onClick={() => generateInvestorAgreementPDF(selectedInvestor)}>Download Agreement</button><button className="btn btn-secondary" onClick={() => { setShowViewInvestorModal(false); setSelectedInvestor(null); }}>Close</button></div>
                    </Modal>
                  )}
            
                  {showEditInvestorModal && editingInvestor && (
                    <Modal isOpen={showEditInvestorModal} onClose={() => { setShowEditInvestorModal(false); setEditingInvestor(null); }} title="Edit Investor" size="md">
                      <div className="mb-3"><label className="form-label">Full Name *</label><input type="text" className="form-control" value={updatedInvestor.name} onChange={e => setUpdatedInvestor({...updatedInvestor, name: e.target.value})} required /></div>
                      <div className="mb-3"><label className="form-label">Phone Number *</label><input type="tel" className="form-control" value={updatedInvestor.phone} onChange={e => setUpdatedInvestor({...updatedInvestor, phone: e.target.value})} required /></div>
                      <div className="mb-3"><label className="form-label">Email (Optional)</label><input type="email" className="form-control" value={updatedInvestor.email} onChange={e => setUpdatedInvestor({...updatedInvestor, email: e.target.value})} /></div>
                      <div className="mb-3"><label className="form-label">ID Number *</label><input type="text" className="form-control" value={updatedInvestor.id_number} disabled readOnly /></div>
                      <div className="mb-3"><label className="form-label">Notes</label><textarea className="form-control" value={updatedInvestor.notes} onChange={e => setUpdatedInvestor({...updatedInvestor, notes: e.target.value})} rows="3" /></div>
                      <div className="alert alert-warning">Note: Investment amount and dates cannot be changed.</div>
                      <div className="d-flex gap-2"><button className="btn btn-primary" onClick={handleUpdateInvestor}>Update Investor</button><button className="btn btn-secondary" onClick={() => { setShowEditInvestorModal(false); setEditingInvestor(null); }}>Cancel</button></div>
                    </Modal>
                  )}
                  {showActivateDeactivateModal && investorToToggle && (
                    <ConfirmationDialog isOpen={showActivateDeactivateModal} onClose={() => setShowActivateDeactivateModal(false)} onConfirm={confirmToggleAccountStatus} title={`${investorToToggle.account_status === 'active' ? 'Deactivate' : 'Activate'} Investor Account`} message={`Are you sure you want to ${investorToToggle.account_status === 'active' ? 'deactivate' : 'activate'} ${investorToToggle.name}'s account?`} confirmText={investorToToggle.account_status === 'active' ? 'Deactivate' : 'Activate'} confirmColor={investorToToggle.account_status === 'active' ? 'danger' : 'success'} />
                  )}
                  {showDeleteInvestorModal && investorToDelete && (
                    <ConfirmationDialog isOpen={showDeleteInvestorModal} onClose={() => setShowDeleteInvestorModal(false)} onConfirm={confirmDeleteInvestor} title="Delete Investor" message={`Are you sure you want to delete ${investorToDelete.name}'s account? This action will permanently remove all investor data.`} confirmText="Delete" confirmColor="danger" />
                  )}
            
                  {showProcessReturnModal && selectedInvestorForReturn && (
                    <Modal isOpen={showProcessReturnModal} onClose={() => setShowProcessReturnModal(false)} title={isTopupAdjustmentMode ? "Top Up/Adjust Investment" : "Process Investor Return"} size="md">
                      <div className="mb-3"><label className="form-label">Investor Name</label><input type="text" className="form-control" value={selectedInvestorForReturn.name} readOnly /></div>
                      <div className="mb-3"><label className="form-label">Total Investment</label><input type="text" className="form-control" value={fmt(selectedInvestorForReturn.investment_amount)} readOnly /></div>
                      <div className="mb-3"><div className="form-check form-check-inline"><input className="form-check-input" type="radio" name="processMode" checked={!isTopupAdjustmentMode} onChange={() => setIsTopupAdjustmentMode(false)} /><label>Process Return</label></div><div className="form-check form-check-inline"><input className="form-check-input" type="radio" name="processMode" checked={isTopupAdjustmentMode} onChange={() => setIsTopupAdjustmentMode(true)} /><label>Top Up / Adjust</label></div></div>
                      {!isTopupAdjustmentMode && (
                        <>
                          <div className="mb-3"><label className="form-label">Return Amount (KES) *</label><input type="number" className="form-control" value={returnAmount} onChange={e => setReturnAmount(e.target.value)} min="1" max={maxReturnAmount} step="0.01" required /><small className="text-muted">Maximum payable: {fmt(maxReturnAmount)}</small></div>
                          <div className="alert alert-info">Amounts above outstanding returns will be recorded as advance credit for future periods.</div>
                          {new Date() < new Date(selectedInvestorForReturn.next_return_date) && (<div className="alert alert-warning">Next return date is {formatDate(selectedInvestorForReturn.next_return_date)}. To process early return, check "Early Withdrawal" below.</div>)}
                          <div className="mb-3"><div className="form-check"><input className="form-check-input" type="checkbox" checked={isEarlyWithdrawal} onChange={(e) => { setIsEarlyWithdrawal(e.target.checked); if (e.target.checked) setReturnAmount((selectedInvestorForReturn.investment_amount * 0.40 * 0.85).toFixed(2)); else setReturnAmount((selectedInvestorForReturn.investment_amount * 0.40).toFixed(2)); }} /><label className="form-check-label">Early Withdrawal (15% fee applies – investor receives 85%)</label></div></div>
                          <div className="mb-3"><label className="form-label">Payment Method *</label><select className="form-control" value={returnMethod} onChange={e => setReturnMethod(e.target.value)}><option value="mpesa">M-Pesa</option><option value="bank">Bank Transfer</option><option value="cash">Cash</option></select></div>
                          {returnMethod === 'mpesa' && (<div className="mb-3"><label className="form-label">M-Pesa Reference *</label><input type="text" className="form-control" value={returnReference} onChange={e => setReturnReference(e.target.value)} required placeholder="Enter M-Pesa reference" style={{ textTransform:'uppercase' }} /></div>)}
                          <div className="mb-3"><label className="form-label">Notes</label><textarea className="form-control" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} rows="3" /></div>
                        </>
                      )}
                      {isTopupAdjustmentMode && (
                        <>
                          <div className="mb-3"><div className="form-check form-check-inline"><input className="form-check-input" type="radio" name="adjustmentType" checked={adjustmentType === "topup"} onChange={() => setAdjustmentType("topup")} /><label>Top Up</label></div><div className="form-check form-check-inline"><input className="form-check-input" type="radio" name="adjustmentType" checked={adjustmentType === "adjust"} onChange={() => setAdjustmentType("adjust")} /><label>Adjust</label></div></div>
                          {adjustmentType === "topup" ? (<div className="mb-3"><label className="form-label">Top-up Amount (KES) *</label><input type="number" className="form-control" value={adjustmentAmount} onChange={e => setAdjustmentAmount(e.target.value)} min="1" required /></div>) : (<div className="mb-3"><label className="form-label">New Investment Amount (KES) *</label><input type="number" className="form-control" value={adjustmentAmount} onChange={e => setAdjustmentAmount(e.target.value)} min="1" required /></div>)}
                          {adjustmentType === "topup" && (<><div className="mb-3"><label className="form-label">Payment Method *</label><select className="form-control" value={investorTopupMethod} onChange={e => setInvestorTopupMethod(e.target.value)}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank Transfer</option></select></div>{investorTopupMethod === 'mpesa' && (<div className="mb-3"><label className="form-label">M-Pesa Reference *</label><input type="text" className="form-control" value={investorTopupReference} onChange={e => setInvestorTopupReference(e.target.value)} required placeholder="Enter M-Pesa reference" style={{ textTransform:'uppercase' }} /></div>)}</>)}
                          <div className="mb-3"><label className="form-label">Notes</label><textarea className="form-control" value={investorTopupNotes} onChange={e => setInvestorTopupNotes(e.target.value)} rows="3" /></div>
                        </>
                      )}
                      <div className="alert alert-info">{!isTopupAdjustmentMode ? "Return amount is fixed at 40% of investment. Early withdrawals incur 15% fee." : adjustmentType === "topup" ? "Top-up will increase the investor's investment amount and affect future returns." : "Adjustment will change the investor's total investment amount."}</div>
                      <div className="d-flex gap-2"><button className="btn btn-primary" onClick={handleProcessAction}>{isTopupAdjustmentMode ? (adjustmentType === "topup" ? "Process Top Up" : "Adjust Investment") : "Process Return"}</button><button className="btn btn-secondary" onClick={() => setShowProcessReturnModal(false)}>Cancel</button></div>
                    </Modal>
                  )}
            
                  {showInvestorLoginModal && (
                    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor:'rgba(0,0,0,0.5)', zIndex:1050, position:'fixed', top:0, left:0, width:'100%', height:'100%' }}>
                      <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                          <div className="modal-header bg-primary text-white"><h5 className="modal-title">Investor Section Access</h5><button type="button" className="btn-close btn-close-white" onClick={() => { setShowInvestorLoginModal(false); setInvestorPassword(""); setDirectorSection("overview"); }}></button></div>
                          <div className="modal-body"><div className="text-center mb-4"><i className="fas fa-lock fa-3x text-primary mb-3"></i><h5>Additional Security Required</h5><p className="text-muted">Enter password to access investor section</p></div><form onSubmit={handleInvestorPasswordSubmit}><div className="mb-4"><label className="form-label"><strong>Password</strong></label><input type="password" className="form-control" value={investorPassword} onChange={e => setInvestorPassword(e.target.value)} placeholder="Enter password" required autoFocus style={{ height:'50px' }} /></div><div className="d-flex gap-2"><button type="submit" className="btn btn-primary flex-grow-1" style={{ height:'50px' }}>Unlock Investor Section</button><button type="button" className="btn btn-secondary" onClick={() => { setShowInvestorLoginModal(false); setInvestorPassword(""); setDirectorSection("overview"); }}>Cancel</button></div></form></div>
                        </div>
                      </div>
                    </div>
                  )}
            
                  {showDeleteConfirmation && (
                    <ConfirmationDialog isOpen={showDeleteConfirmation} onClose={() => setShowDeleteConfirmation(false)} onConfirm={handleDeleteLivestock} title="Delete Livestock" message="Are you sure you want to delete this livestock? This action cannot be undone." confirmText="Delete" confirmColor="danger" />
                  )}
            
                  {showShareModal && sharingLivestock && (
                    <Modal isOpen={showShareModal} onClose={() => { setShowShareModal(false); setSharingLivestock(null); setShareMessage(''); }} title="Share Livestock" size="md">
                      <div className="mb-3"><label className="form-label">Livestock</label><input type="text" className="form-control" value={sharingLivestock.title || 'Untitled'} readOnly /></div>
                      <div className="mb-3"><label className="form-label">Custom Message</label><textarea className="form-control" rows="3" placeholder="Enter a custom message..." value={shareMessage} onChange={e => setShareMessage(e.target.value)} maxLength="200" /><small className="text-muted">This message will replace the default title when shared.</small></div>
                      <div className="mb-3"><label className="form-label">Shareable Link</label><div className="input-group"><input type="text" className="form-control" id="shareLink" value={`${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`} readOnly /><button className="btn btn-outline-secondary" type="button" onClick={() => { const linkInput = document.getElementById('shareLink'); linkInput.select(); navigator.clipboard.writeText(linkInput.value); showToast.success('Link copied!'); }}><i className="fas fa-copy"></i></button></div></div>
                      <div className="mb-4"><label className="form-label">Share via</label><div className="d-flex flex-wrap gap-2"><button className="btn btn-success flex-fill" onClick={() => { const title = shareMessage.trim() || sharingLivestock.title; const msg = `Check out this livestock: ${title}\nPrice: ${fmt(sharingLivestock.price)}\nView details: ${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); }}><i className="fab fa-whatsapp me-2"></i> WhatsApp</button><button className="btn btn-info flex-fill" onClick={() => { const title = shareMessage.trim() || sharingLivestock.title; const text = `Check out this livestock: ${title} - ${fmt(sharingLivestock.price)}`; const url = `${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`; window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank'); }}><i className="fab fa-facebook me-2"></i> Facebook</button><button className="btn btn-danger flex-fill" onClick={() => { const copyText = `${shareMessage.trim() || sharingLivestock.title}\nPrice: ${fmt(sharingLivestock.price)}\nView: ${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`; navigator.clipboard.writeText(copyText); showToast.success("Copied to clipboard!"); }}><i className="fab fa-instagram me-2"></i> Instagram</button></div></div>
                      <div className="d-flex gap-2"><button type="button" className="btn btn-secondary" onClick={() => { setShowShareModal(false); setSharingLivestock(null); }}>Close</button></div>
                    </Modal>
                  )}
            
                  {showTopupModal && selectedClient && (
                    <Modal
                      isOpen={showTopupModal}
                      onClose={() => {
                        setShowTopupModal(false);
                        setSelectedClient(null);
                        setTopupAmount("");
                        setAdjustmentAmount("");
                        setTopupMethod("cash");
                        setTopupReference("");
                        setTopupNotes("");
                      }}
                      title={isTopupMode ? "Loan Top-up" : "Loan Adjustment"}
                      size="md"
                    >
                      <div className="mb-3">
                        <label className="form-label">Client Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={selectedClient.name || 'N/A'}
                          readOnly
                        />
                      </div>
                    
                      <div className="mb-3">
                        <label className="form-label">Current Loan Amount</label>
                        <input
                          type="text"
                          className="form-control"
                          value={fmt(selectedClient.current_principal || selectedClient.principal_amount || 0)}
                          readOnly
                        />
                      </div>
                    
                      <div className="mb-3">
                        <label className="form-label">Current Total to Pay</label>
                        <input
                          type="text"
                          className="form-control"
                          value={fmt(((selectedClient.current_principal || selectedClient.principal_amount || 0)) * 1.3)}
                          readOnly
                        />
                      </div>
                    
                      <div className="mb-3">
                        <div className="form-check form-check-inline">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="topupMode"
                            id="topupMode"
                            checked={isTopupMode}
                            onChange={() => setIsTopupMode(true)}
                          />
                          <label className="form-check-label" htmlFor="topupMode">
                            Top-up Loan
                          </label>
                        </div>
                        <div className="form-check form-check-inline">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="adjustmentMode"
                            id="adjustmentMode"
                            checked={!isTopupMode}
                            onChange={() => setIsTopupMode(false)}
                          />
                          <label className="form-check-label" htmlFor="adjustmentMode">
                            Adjust Loan
                          </label>
                        </div>
                      </div>
                    
                      {isTopupMode ? (
                        <div className="mb-3">
                          <label htmlFor="topupAmount" className="form-label">
                            Top-up Amount (KSh) <span className="text-danger">*</span>
                          </label>
                          <input
                            type="number"
                            className="form-control"
                            id="topupAmount"
                            value={topupAmount}
                            onChange={(e) => setTopupAmount(e.target.value)}
                            min="1"
                            placeholder="Enter top-up amount"
                            required
                          />
                        </div>
                      ) : (
                        <div className="mb-3">
                          <label htmlFor="adjustmentAmount" className="form-label">
                            New Loan Amount (KSh) <span className="text-danger">*</span>
                          </label>
                          <input
                            type="number"
                            className="form-control"
                            id="adjustmentAmount"
                            value={adjustmentAmount}
                            onChange={(e) => setAdjustmentAmount(e.target.value)}
                            min="1"
                            placeholder="Enter new loan amount"
                            required
                          />
                        </div>
                      )}
            
                      {(topupAmount > 0 || adjustmentAmount > 0) && (
                        <div className="alert alert-info">
                          <h6>Calculation Preview:</h6>
                          <p><strong>New Loan Amount:</strong> {fmt(
                            isTopupMode
                              ? (selectedClient.current_principal || selectedClient.principal_amount || 0) + parseFloat(topupAmount || 0)
                              : parseFloat(adjustmentAmount || selectedClient.current_principal || selectedClient.principal_amount || 0)
                          )}</p>
                          <p><strong>New Total to Pay:</strong> {fmt(
                            (isTopupMode
                              ? (selectedClient.current_principal || selectedClient.principal_amount || 0) + parseFloat(topupAmount || 0)
                              : parseFloat(adjustmentAmount || selectedClient.current_principal || selectedClient.principal_amount || 0)
                            ) * 1.3
                          )} <small>(including 30% interest)</small></p>
                        </div>
                      )}
            
                      <div className="mb-3">
                        <label htmlFor="topupMethod" className="form-label">
                          Disbursement Method <span className="text-danger">*</span>
                        </label>
                        <select
                          className="form-control"
                          id="topupMethod"
                          value={topupMethod}
                          onChange={(e) => setTopupMethod(e.target.value)}
                          required
                        >
                          <option value="cash">Cash</option>
                          <option value="mpesa">M-Pesa</option>
                        </select>
                      </div>
                    
                      {topupMethod === 'mpesa' && (
                        <div className="mb-3">
                          <label htmlFor="topupReference" className="form-label">
                            M-Pesa Reference Code <span className="text-danger">*</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="topupReference"
                            value={topupReference}
                            onChange={(e) => setTopupReference(e.target.value)}
                            placeholder="Enter M-Pesa reference (e.g., RB64AX25B1)"
                            style={{ textTransform: 'uppercase' }}
                            required
                          />
                        </div>
                      )}
            
                      <div className="mb-3">
                        <label htmlFor="topupNotes" className="form-label">
                          Notes
                        </label>
                        <textarea
                          className="form-control"
                          id="topupNotes"
                          value={topupNotes}
                          onChange={(e) => setTopupNotes(e.target.value)}
                          placeholder="Additional notes about this top-up or adjustment"
                          rows="3"
                        />
                      </div>
                    
                      <div className="alert alert-warning">
                        <i className="fas fa-exclamation-triangle me-2"></i>
                        This action will {isTopupMode ? 'increase' : 'modify'} the loan principal and recalculate the total amount with 30% interest.
                      </div>
                    
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-warning"
                          onClick={handleTopup}
                          disabled={(isTopupMode && !topupAmount) || (!isTopupMode && !adjustmentAmount)}
                        >
                          <i className="fas fa-edit me-2"></i>
                          Process {isTopupMode ? 'Top-up' : 'Adjustment'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setShowTopupModal(false);
                            setSelectedClient(null);
                            setTopupAmount("");
                            setAdjustmentAmount("");
                            setTopupMethod("cash");
                            setTopupReference("");
                            setTopupNotes("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </Modal>
                  )}
            
                  {showMpesaModal && selectedClient && (
                    <Modal isOpen={showMpesaModal} onClose={() => { setShowMpesaModal(false); setSelectedClient(null); setMpesaAmount(""); setPaymentStatus(''); }} title="Process M-Pesa Payment" size="md">
                      <div className="mb-3"><label className="form-label">Client Name</label><input type="text" className="form-control" value={selectedClient.name || 'N/A'} readOnly /></div>
                      <div className="mb-3"><label className="form-label">Phone Number</label><input type="text" className="form-control" value={selectedClient.phone || 'N/A'} readOnly /></div>
                      <div className="mb-3"><label className="form-label">Current Balance</label><input type="text" className="form-control fw-bold text-danger" value={fmt(selectedClient.balance || 0)} readOnly /></div>
                      <div className="mb-3"><label className="form-label"><strong>Payment Type</strong></label><div className="form-check"><input className="form-check-input" type="radio" name="mpesaPaymentType" checked={mpesaPaymentType === 'principal'} onChange={() => setMpesaPaymentType('principal')} /><label>Principal Payment</label></div><div className="form-check"><input className="form-check-input" type="radio" name="mpesaPaymentType" checked={mpesaPaymentType === 'interest'} onChange={() => setMpesaPaymentType('interest')} /><label>Interest Payment</label></div></div>
                      {mpesaPaymentType === 'interest' && (<div className="mb-3"><label className="form-label">Total Unpaid Interest</label><input type="text" className="form-control" value={fmt(mpesaUnpaidInterest)} readOnly /></div>)}
                      <div className="mb-3"><label className="form-label">Payment Amount (KSh) *</label><input type="number" className="form-control" value={mpesaAmount} onChange={e => setMpesaAmount(e.target.value)} min="1" max={mpesaPaymentType === 'principal' ? Math.floor(selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0) : Math.floor(mpesaUnpaidInterest)} required /><small className="text-muted">Maximum: {fmt(mpesaPaymentType === 'principal' ? (selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0) : mpesaUnpaidInterest)}</small></div>
                      <div className="alert alert-info">This will send an STK push prompt to the client's phone. The client needs to enter their M-Pesa PIN to complete the payment.</div>
                      <div className="d-flex gap-2"><button type="button" className="btn btn-success" onClick={handleMpesaPayment} disabled={sendingStk || !mpesaAmount}>{sendingStk ? <><span className="spinner-border spinner-border-sm me-2"></span>Sending...</> : <><i className="fas fa-mobile-alt me-2"></i>Send STK Push</>}</button><button type="button" className="btn btn-secondary" onClick={() => setShowMpesaModal(false)}>Cancel</button></div>
                    </Modal>
                  )}
            
                  {showPaymentModal && selectedClient && (
                    <Modal isOpen={showPaymentModal} onClose={() => { setShowPaymentModal(false); setSelectedClient(null); setMpesaReference(""); }} title="Process Payment" size="md">
                      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target); handlePayment({ amount: fd.get('amount'), method: fd.get('method'), notes: fd.get('notes') }); }}>
                        <div className="mb-3"><label className="form-label">Client Name</label><input type="text" className="form-control" value={selectedClient.name || 'N/A'} readOnly /></div>
                        <div className="mb-3"><label className="form-label">Phone Number</label><input type="text" className="form-control" value={selectedClient.phone || 'N/A'} readOnly /></div>
                        <div className="mb-3"><label className="form-label">Total Loan Amount</label><input type="text" className="form-control" value={fmt(selectedClient.borrowedAmount || 0)} readOnly /></div>
                        <div className="mb-3"><label className="form-label">Amount Already Paid</label><input type="text" className="form-control" value={fmt(selectedClient.amountPaid || 0)} readOnly /></div>
                        <div className="mb-3"><label className="form-label"><strong>Current Balance</strong></label><input type="text" className="form-control fw-bold text-danger" value={fmt(selectedClient.balance || 0)} readOnly /></div>
                        <div className="mb-3"><label className="form-label"><strong>Payment Type</strong></label><div className="form-check"><input className="form-check-input" type="radio" name="paymentTypeRadio" checked={paymentType === 'principal'} onChange={() => setPaymentType('principal')} /><label>Principal Payment</label></div><div className="form-check"><input className="form-check-input" type="radio" name="paymentTypeRadio" checked={paymentType === 'interest'} onChange={() => setPaymentType('interest')} /><label>Interest Payment</label></div></div>
                        <div className="mb-3"><label className="form-label">Payment Amount (KSh) *</label><input type="number" className="form-control" name="amount" min="1" max={paymentType === 'principal' ? Math.floor(selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0) : Math.floor(selectedClient.unpaidInterest || 0)} required /><small className="text-muted">Maximum: {fmt(paymentType === 'principal' ? (selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0) : (selectedClient.unpaidInterest || 0))}</small></div>
                        <div className="mb-3"><label className="form-label">Payment Method *</label><select className="form-control" name="method" required><option value="cash">Cash</option><option value="mpesa">M-Pesa (Manual Reference)</option></select></div>
                        <div className="mb-3" id="mpesaReferenceField" style={{ display:'none' }}><label className="form-label">M-Pesa Reference Code *</label><input type="text" className="form-control" name="mpesaReference" placeholder="Enter M-Pesa reference" style={{ textTransform:'uppercase' }} /></div>
                        <div className="alert alert-info">This payment will be recorded and update the client's balance.</div>
                        <div className="d-flex gap-2"><button type="submit" className="btn btn-success">Process Payment</button><button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancel</button></div>
                      </form>
                    </Modal>
                  )}
            
                  {showActionModal && selectedClient && (
                    <AdminTakeActionModal
                      client={selectedClient}
                      onClose={handleCloseModal}
                      onSendReminder={handleSendReminder}
                      onClaimOwnership={handleClaimOwnership}
                    />
                  )}
            
                  {showSmsModal && (
                    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor:'rgba(0,0,0,0.5)' }}>
                      <div className="modal-dialog modal-dialog-centered"><div className="modal-content"><div className="modal-header"><h5 className="modal-title">SMS Reminder</h5><button type="button" className="btn-close" onClick={() => setShowSmsModal(false)}></button></div><div className="modal-body"><div className="alert alert-info">SMS API coming soon. Copy the message below.</div><div className="mb-3"><label className="form-label">Recipient Phone:</label><input type="tel" className="form-control mb-3" value={smsPhone} onChange={e => setSmsPhone(e.target.value)} placeholder="+254712345678" /><label className="form-label">Message:</label><textarea className="form-control" value={smsMessage} onChange={e => setSmsMessage(e.target.value)} rows="5" /></div></div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowSmsModal(false)}>Cancel</button><button className="btn btn-outline-primary" onClick={() => { navigator.clipboard.writeText(smsMessage); showToast.success("Copied!"); }}>Copy Message</button><button className="btn btn-success" onClick={() => { const phone = smsPhone.trim(); if (!phone) { showToast.error("Enter phone number"); return; } window.location.href = `sms:${phone}?body=${encodeURIComponent(smsMessage)}`; }}>Open in SMS App</button></div></div></div>
                    </div>
                  )}
            
                  {showRenewalModal && renewalLoan && (
                    <Modal
                      isOpen={showRenewalModal}
                      onClose={() => {
                        setShowRenewalModal(false);
                        setRenewalLoan(null);
                        setRenewalType('renew');
                        setWaiverAmount(0);
                        setWaiverDuration(14);
                        setNewRenewalPrincipal(0);
                        setNewRenewalPlan('weekly');
                      }}
                      title="Loan Renewal / Waiver"
                      size="md"
                    >
                      {(() => {
                        const principal = Number(renewalLoan.current_principal || renewalLoan.currentPrincipal || renewalLoan.borrowedAmount || 0);
                        const isWeekly = renewalLoan.repayment_plan === 'weekly';
                        const totalBalance = isWeekly
                          ? principal + principal * 0.30
                          : principal + Number(renewalLoan.accrued_interest || 0);
                      
                        // Preview due date based on selected plan
                        const previewDueDate = new Date();
                        previewDueDate.setDate(previewDueDate.getDate() + (newRenewalPlan === 'daily' ? 14 : 7));
                        const interestRateDisplay = newRenewalPlan === 'daily' ? '4.5% per day (simple)' : '30% per week (compound)';
                      
                        return (
                          <>
                            <div className="mb-3">
                              <p><strong>Client:</strong> {renewalLoan.name}</p>
                              <p><strong>Current Balance:</strong> {fmt(totalBalance)}</p>
                              <hr />
                              <div className="btn-group w-100 mb-3">
                                <button
                                  type="button"
                                  className={`btn ${renewalType === 'renew' ? 'btn-primary' : 'btn-outline-primary'}`}
                                  onClick={() => setRenewalType('renew')}
                                >
                                  <i className="fas fa-sync-alt me-2"></i>Renewal
                                </button>
                                <button
                                  type="button"
                                  className={`btn ${renewalType === 'waive' ? 'btn-success' : 'btn-outline-success'}`}
                                  onClick={() => {
                                    setRenewalType('waive');
                                    setWaiverAmount(totalBalance);
                                  }}
                                >
                                  <i className="fas fa-hand-holding-heart me-2"></i>Waive
                                </button>
                              </div>
                            </div>
                                
                            {renewalType === 'renew' && (
                              <>
                                <div className="alert alert-warning">
                                  <i className="fas fa-file-pdf me-2"></i>
                                  Download and have the client sign the renewal agreement before confirming renewal.
                                </div>
                            
                                <div className="mb-3">
                                  <label className="form-label">New Principal Amount (KES)</label>
                                  <input
                                    type="number"
                                    className="form-control"
                                    value={newRenewalPrincipal}
                                    onChange={(e) => setNewRenewalPrincipal(parseFloat(e.target.value) || 0)}
                                    min="1"
                                    step="100"
                                    required
                                  />
                                  <small className="text-muted">Default: {fmt(totalBalance)}</small>
                                </div>
                            
                                <div className="mb-3">
                                  <label className="form-label">Repayment Plan</label>
                                  <select
                                    className="form-control"
                                    value={newRenewalPlan}
                                    onChange={(e) => setNewRenewalPlan(e.target.value)}
                                  >
                                    <option value="weekly">Weekly – 30% per week (compound)</option>
                                    <option value="daily">Daily – 4.5% per day (simple)</option>
                                  </select>
                                </div>
                            
                                <div className="alert alert-info">
                                  <strong>Preview:</strong><br/>
                                  Interest: {interestRateDisplay}<br/>
                                  Due date: {previewDueDate.toLocaleDateString()}
                                </div>
                            
                                <div className="d-flex flex-column gap-2">
                                  <button
                                    className="btn btn-primary w-100"
                                    onClick={async () => {
                                      try {
                                        await generateLoanRenewalAgreementAutoPDF(
                                          {
                                            name: renewalLoan.name,
                                            idNumber: renewalLoan.id_number,
                                            phone: renewalLoan.contacts,
                                            borrowedAmount: renewalLoan.principal_amount,
                                            expectedReturnDate: renewalLoan.disbursement_date,
                                            balance: totalBalance,
                                            repayment_plan: newRenewalPlan,
                                            new_principal: newRenewalPrincipal
                                          },
                                          newRenewalPrincipal,
                                          newRenewalPlan
                                        );
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
                                    className="btn btn-success w-100"
                                    onClick={async () => {
                                      if (newRenewalPrincipal <= 0) {
                                        showToast.error("Please enter a valid principal amount");
                                        return;
                                      }
                                      setProcessingRenewal(true);
                                      try {
                                        const response = await recoveryAPI.renewLoan(renewalLoan.id, {
                                          new_principal: newRenewalPrincipal,
                                          new_repayment_plan: newRenewalPlan
                                        });
                                        if (response.data.success) {
                                          showToast.success(`Loan renewed! New loan ID: ${response.data.new_loan.id}`);
                                          setShowRenewalModal(false);
                                          fetchData();        // refresh recovery data
                                          fetchDirectorClients(); // refresh client list if needed
                                        }
                                      } catch (error) {
                                        showToast.error(error.response?.data?.error || "Renewal failed");
                                      } finally {
                                        setProcessingRenewal(false);
                                      }
                                    }}
                                    disabled={processingRenewal}
                                  >
                                    {processingRenewal ? (
                                      <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
                                    ) : "Confirm Renewal"}
                                  </button>
                                </div>
                              </>
                            )}

                            {renewalType === 'waive' && (
                              <>
                                <div className="mb-3">
                                  <label className="form-label">Agreed Repayment Amount (KES)</label>
                                  <input
                                    type="number"
                                    className="form-control"
                                    value={waiverAmount}
                                    onChange={e => setWaiverAmount(parseFloat(e.target.value))}
                                    min="0"
                                    max={totalBalance}
                                    step="100"
                                    required
                                  />
                                  <small className="text-muted">Maximum: {fmt(totalBalance)}</small>
                                </div>
                                <div className="mb-3">
                                  <label className="form-label">Repayment Duration (days)</label>
                                  <input
                                    type="number"
                                    className="form-control"
                                    value={waiverDuration}
                                    onChange={e => setWaiverDuration(parseInt(e.target.value))}
                                    min="1"
                                    max="90"
                                    required
                                  />
                                  <small className="text-muted">Default 14 days</small>
                                </div>
                                <div className="alert alert-info">
                                  The agreed amount will become a new zero‑interest loan. The original loan will be marked as waived.
                                </div>
                                <div className="alert alert-warning">
                                  <i className="fas fa-file-pdf me-2"></i>
                                  Download and have the client sign the waiver agreement before confirming waive.
                                </div>
                                <div className="d-flex flex-column gap-2">
                                  <button
                                    className="btn btn-primary w-100"
                                    onClick={async () => {
                                      try {
                                        await generateLoanWaiverAgreementAutoPDF(
                                          {
                                            name: renewalLoan.name,
                                            idNumber: renewalLoan.id_number,
                                            phone: renewalLoan.contacts,
                                            borrowedAmount: renewalLoan.principal_amount,
                                            balance: totalBalance
                                          },
                                          waiverAmount,
                                          waiverDuration
                                        );
                                        showToast.success("Waiver agreement downloaded. Have client sign it.");
                                      } catch (err) {
                                        showToast.error("Failed to download waiver agreement");
                                      }
                                    }}
                                  >
                                    <i className="fas fa-download me-2"></i>Download Waiver Agreement
                                  </button>
                                  <button
                                    className="btn btn-success w-100"
                                    onClick={async () => {
                                      if (waiverAmount <= 0 || waiverAmount > totalBalance) {
                                        showToast.error("Please enter a valid agreed amount");
                                        return;
                                      }
                                      setWaiverProcessing(true);
                                      try {
                                        const response = await (recoveryAPI.waiveLoan
                                          ? recoveryAPI.waiveLoan(renewalLoan.id, waiverAmount, waiverDuration)
                                          : adminAPI.waiveLoan(renewalLoan.id, waiverAmount, waiverDuration)
                                        );
                                        if (response.data.success) {
                                          showToast.success(`Loan waived! New loan ID: ${response.data.new_loan.id}`);
                                          setShowRenewalModal(false);
                                          fetchData();
                                        }
                                      } catch (error) {
                                        showToast.error(error.response?.data?.error || "Waiver failed");
                                      } finally {
                                        setWaiverProcessing(false);
                                      }
                                    }}
                                    disabled={waiverProcessing}
                                  >
                                    {waiverProcessing ? (
                                      <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
                                    ) : "Confirm Waive"}
                                  </button>
                                </div>
                              </>
                            )}

                            <div className="mt-3">
                              <button className="btn btn-secondary w-100" onClick={() => setShowRenewalModal(false)}>Cancel</button>
                            </div>
                          </>
                        );
                      })()}
                    </Modal>
                  )}
                </>
              ) : (
                // ---------- OTHER ROLES (valuer, accountant, head_of_it) ----------
                !showUtilities ? (
                  <>
                    {/* digital clock */}
                    <div className="d-none d-md-flex justify-content-center mb-3">
                      <div className="digital-clock">
                        <div className="clock-date"><i className="fas fa-calendar-alt me-2"></i>{formatClockDate(currentDateTime)}</div>
                        <div className="clock-time"><i className="fas fa-clock me-2"></i>{formatClockTime(currentDateTime)}</div>
                      </div>
                    </div>
                    <div className="d-md-none text-center pb-2">
                      <div className="mobile-clock">
                        <span><i className="fas fa-calendar-alt me-2"></i>{formatClockDate(currentDateTime)}</span>
                        <span className="mx-1"></span>
                        <span><i className="fas fa-clock me-2"></i>{formatClockTime(currentDateTime)}</span>
                      </div>
                    </div>
                                
                    {/* RECOVERY MODULE (tables) – only shown when directorSection === 'recovery' */}
                    {directorSection === 'recovery' && (
                      <>
                        {/* Branch filter tabs – now inside the recovery block */}
                        <div className="d-flex flex-wrap gap-3 mb-3">
                          <button
                            className={`btn ${branchFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setBranchFilter('all')}
                          >
                            <i className="fas fa-globe me-1"></i> All
                          </button>
                          <button
                            className={`btn ${branchFilter === 'isinya' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setBranchFilter('isinya')}
                          >
                            <i className="fas fa-building me-1"></i> Isinya (Kap North Ward)
                          </button>
                          <button
                            className={`btn ${branchFilter === 'emarti' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setBranchFilter('emarti')}
                          >
                            <i className="fas fa-store me-1"></i> Emarti Branch (Imaroro Ward)
                          </button>
                        </div>
                    
                        {/* search card */}
                        <div className="card mb-4 shadow-sm">
                          <div className="card-body">
                            <div className="row g-3 align-items-end">
                              <div className="col-md-3">
                                <label className="form-label small fw-bold"><i className="fas fa-search me-1"></i> Search</label>
                                <input type="text" className="form-control" placeholder="Name, Collateral, ID, Contact" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                              </div>
                              <div className="col-md-2">
                                <label className="form-label small fw-bold"><i className="fas fa-calendar-week me-1"></i> Payment Plan</label>
                                <select className="form-select" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                                  <option value="all">All</option>
                                  <option value="weekly">Weekly</option>
                                  <option value="daily">Daily</option>
                                  <option value="waived">Waived</option>
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
                                  <button className="btn btn-outline-secondary" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                                    {sortOrder === 'asc' ? <i className="fas fa-arrow-up"></i> : <i className="fas fa-arrow-down"></i>}
                                  </button>
                                </div>
                              </div>
                            </div>
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
                          
                        {/* Day tables */}
                        {Object.keys(filteredData).length === 0 && (
                          <div className="text-center py-5">
                            <i className="fas fa-filter fa-3x text-muted mb-3"></i>
                            <h5>No loans match your filters</h5>
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
                                        <th>Location</th>
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
                                          <tr key={loan.id}>
                                            <td>
                                              <div>{loan.name}</div>
                                              <span className="badge me-1" style={{ backgroundColor: '#fff3cd', color: '#856404' }}>
                                                {loan.interest_rate === 0 ? 'Waived' : (loan.repayment_plan === 'daily' ? 'Daily' : 'Weekly')}
                                              </span>
                                              {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
                                            </td>
                                            <td>{loan.collateral}</td>
                                            <td>{loan.location}</td>
                                            <td>{loan.id_number}</td>
                                            <td>{loan.contacts}</td>
                                            <td>{fmtDate(loan.disbursement_date)}</td>
                                            <td>
                                              {loan.is_waiver && loan.original_principal ? fmt(loan.original_principal) : fmt(loan.principal_amount)}
                                            </td>
                                            <td>{fmt(loan.current_principal)}</td>
                                            <td>{loan.interest_rate === 0 ? 'waived' : fmt(loan.interest)}</td>
                                            <td className="text-danger fw-bold">{fmt(loan.accrued_interest)}</td>
                                            <td>Week {loan.week}</td>
                                            <td>
                                              <div className="btn-group btn-group-sm">
                                                {['director','secretary','client_relations_officer','head_of_it','deputy_director','hr_manager'].includes(userRole) && (
                                                  <button className="btn btn-outline-primary" onClick={() => { setSelectedLoan(loan); setShowPaymentModal(true); }} title="process payment">
                                                    <i className="fas fa-money-bill-wave"></i>
                                                  </button>
                                                )}
                                                <button className="btn btn-outline-success" onClick={() => window.location.href = `tel:${loan.contacts}`} title="Send prompt">
                                                  <i className="fas fa-phone"></i>
                                                </button>
                                                <button className="btn btn-outline-info position-relative" onClick={() => { setSelectedLoan(loan); setShowCommentBox(true); }} title="leave a comment">
                                                  <i className="fas fa-comment"></i>
                                                  {commentUnreads[loan.id] > 0 && (
                                                    <span className="badge bg-danger rounded-pill" style={{ position:'absolute', top:'-8px', right:'-8px' }}>
                                                      {commentUnreads[loan.id]}
                                                    </span>
                                                  )}
                                                </button>
                                                <button className="btn btn-outline-danger btn-sm" onClick={() => handleRecoveryTakeAction(loan)} title="send reminder or claim ownership">
                                                  <i className="fas fa-bolt"></i>
                                                </button>
                                                <button className="btn btn-outline-info btn-sm" onClick={() => handleDownloadInvoice(loan)} title="Download Invoice">
                                                  <i className="fas fa-file-invoice"></i>
                                                </button>
                                                {['director','secretary','client_relations_officer','head_of_it','deputy_director','hr_manager'].includes(userRole) && loan.days_left <= 0 && (
                                                  <button className="btn btn-outline-warning btn-sm" onClick={() => openRenewalModal(loan)} title="Renew or waive loan">
                                                    <i className="fas fa-sync-alt"></i>
                                                  </button>
                                                )}
                                                {['director','secretary','client_relations_officer','head_of_it','deputy_director','hr_manager'].includes(userRole) && (
                                                  <button className="btn btn-outline-warning" onClick={() => openTopupModal(loan)} title="Process top-up or adjust loan">
                                                    <i className="fas fa-edit"></i>
                                                  </button>
                                                )}
                                                {['secretary', 'client_relations_officer', 'director', 'hr_manager'].includes(userRole) && (
                                                  <button
                                                    className="btn btn-outline-danger btn-sm"
                                                    onClick={() => {
                                                      setFlagLoanToConfirm(loan.id);
                                                      setFlagLoanName(loan.name);
                                                      setShowFlagConfirmModal(true);
                                                    }}
                                                    title="Flag as defaulter – moves to valuer"
                                                  >
                                                    <i className="fas fa-flag"></i>
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
                                            <td colSpan="6">Day Totals</td>
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
                        {Object.keys(filteredData).length > 0 && (
                          (() => {
                            const t = overallTotals();
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
                                      <p className="mb-1 text-muted fw-bold">Total Owed (Current Principal + Accrued Interest)</p>
                                      <h3 className="text-primary">{fmt(t.curPrincipal + t.accrued)}</h3>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </>
                    )}

                    {/* Loan Reports Section for director and admin */}
                    {directorSection === 'loan-reports' && <UnifiedReportsTabs />}
          
                    {/* Valuer Reports Section */}
                    {directorSection === 'reports' && <ValuerPanel />}
                  </>
                ) : (
                  <UtilitiesPanel userRole={userRole} restrictedMode={true} />
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== GLOBAL MODALS (chat, comment, action, renewal, settings) ========== */}          
      <ChatList
        isOpen={showChatList}
        onClose={() => setShowChatList(false)}
        onSelectUser={handleSelectUser}
        onlineUsers={onlineUsers}
      />

      {openChatWindows.map((cu, i) => (
        <ChatWindow
          key={cu.id}
          user={cu}
          onClose={() => setOpenChatWindows(prev => prev.filter(w => w.id !== cu.id))}
          onNewMessage={fetchUnreadCount}
          style={getChatStyle(i)}
          globalSocket={socket}          
          onlineUsers={onlineUsers} 
        />
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

      {/* ACTION MODAL (Admin version) – used in Director Overview*/}
      {showActionModal && selectedClient && (
        <AdminTakeActionModal
          client={selectedClient}
          onClose={handleCloseModal}
          onSendReminder={handleSendReminder}
          onClaimOwnership={handleClaimOwnership}
        />
      )}

      {/* RENEWAL / WAIVER MODAL */}
      {showRenewalModal && renewalLoan && (
        <Modal
          isOpen={showRenewalModal}
          onClose={() => {
            setShowRenewalModal(false);
            setRenewalLoan(null);
            setRenewalType('renew');
            setWaiverAmount(0);
            setWaiverDuration(14);
            setNewRenewalPrincipal(0);
            setNewRenewalPlan('weekly');
          }}
          title="Loan Renewal / Waiver"
          size="md"
        >
          {(() => {
            const principal = Number(renewalLoan.current_principal || renewalLoan.currentPrincipal || renewalLoan.borrowedAmount || 0);
            const isWeekly = renewalLoan.repayment_plan === 'weekly';
            const totalBalance = isWeekly
              ? principal + principal * 0.30
              : principal + Number(renewalLoan.accrued_interest || 0);
          
            // Preview due date based on selected plan
            const previewDueDate = new Date();
            previewDueDate.setDate(previewDueDate.getDate() + (newRenewalPlan === 'daily' ? 14 : 7));
            const interestRateDisplay = newRenewalPlan === 'daily' ? '4.5% per day (simple)' : '30% per week (compound)';
          
            return (
              <>
                <div className="mb-3">
                  <p><strong>Client:</strong> {renewalLoan.name}</p>
                  <p><strong>Current Balance:</strong> {fmt(totalBalance)}</p>
                  <hr />
                  <div className="btn-group w-100 mb-3">
                    <button
                      type="button"
                      className={`btn ${renewalType === 'renew' ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setRenewalType('renew')}
                    >
                      <i className="fas fa-sync-alt me-2"></i>Renewal
                    </button>
                    <button
                      type="button"
                      className={`btn ${renewalType === 'waive' ? 'btn-success' : 'btn-outline-success'}`}
                      onClick={() => {
                        setRenewalType('waive');
                        setWaiverAmount(totalBalance);
                      }}
                    >
                      <i className="fas fa-hand-holding-heart me-2"></i>Waive
                    </button>
                  </div>
                </div>
                    
                {renewalType === 'renew' && (
                  <>
                    <div className="alert alert-warning">
                      <i className="fas fa-file-pdf me-2"></i>
                      Download and have the client sign the renewal agreement before confirming renewal.
                    </div>
                
                    <div className="mb-3">
                      <label className="form-label">New Principal Amount (KES)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={newRenewalPrincipal}
                        onChange={(e) => setNewRenewalPrincipal(parseFloat(e.target.value) || 0)}
                        min="1"
                        step="100"
                        required
                      />
                      <small className="text-muted">Default: {fmt(totalBalance)}</small>
                    </div>
                
                    <div className="mb-3">
                      <label className="form-label">Repayment Plan</label>
                      <select
                        className="form-control"
                        value={newRenewalPlan}
                        onChange={(e) => setNewRenewalPlan(e.target.value)}
                      >
                        <option value="weekly">Weekly – 30% per week (compound)</option>
                        <option value="daily">Daily – 4.5% per day (simple)</option>
                      </select>
                    </div>
                
                    <div className="alert alert-info">
                      <strong>Preview:</strong><br/>
                      Interest: {interestRateDisplay}<br/>
                      Due date: {previewDueDate.toLocaleDateString()}
                    </div>
                
                    <div className="d-flex flex-column gap-2">
                      <button
                        className="btn btn-primary w-100"
                        onClick={async () => {
                          try {
                            await generateLoanRenewalAgreementAutoPDF(
                              {
                                name: renewalLoan.name,
                                idNumber: renewalLoan.id_number,
                                phone: renewalLoan.contacts,
                                borrowedAmount: renewalLoan.principal_amount,
                                expectedReturnDate: renewalLoan.disbursement_date,
                                balance: totalBalance,
                                repayment_plan: newRenewalPlan,
                                new_principal: newRenewalPrincipal
                              },
                              newRenewalPrincipal,
                              newRenewalPlan
                            );
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
                        className="btn btn-success w-100"
                        onClick={async () => {
                          if (newRenewalPrincipal <= 0) {
                            showToast.error("Please enter a valid principal amount");
                            return;
                          }
                          setProcessingRenewal(true);
                          try {
                            const response = await recoveryAPI.renewLoan(renewalLoan.id, {
                              new_principal: newRenewalPrincipal,
                              new_repayment_plan: newRenewalPlan
                            });
                            if (response.data.success) {
                              showToast.success(`Loan renewed! New loan ID: ${response.data.new_loan.id}`);
                              setShowRenewalModal(false);
                              fetchData();        // refresh recovery data
                              fetchDirectorClients(); // refresh client list if needed
                            }
                          } catch (error) {
                            showToast.error(error.response?.data?.error || "Renewal failed");
                          } finally {
                            setProcessingRenewal(false);
                          }
                        }}
                        disabled={processingRenewal}
                      >
                        {processingRenewal ? (
                          <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
                        ) : "Confirm Renewal"}
                      </button>
                    </div>
                  </>
                )}

                {renewalType === 'waive' && (
                  <>
                    <div className="mb-3">
                      <label className="form-label">Agreed Repayment Amount (KES)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={waiverAmount}
                        onChange={e => setWaiverAmount(parseFloat(e.target.value))}
                        min="0"
                        max={totalBalance}
                        step="100"
                        required
                      />
                      <small className="text-muted">Maximum: {fmt(totalBalance)}</small>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Repayment Duration (days)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={waiverDuration}
                        onChange={e => setWaiverDuration(parseInt(e.target.value))}
                        min="1"
                        max="90"
                        required
                      />
                      <small className="text-muted">Default 14 days</small>
                    </div>
                    <div className="alert alert-info">
                      The agreed amount will become a new zero‑interest loan. The original loan will be marked as waived.
                    </div>
                    <div className="alert alert-warning">
                      <i className="fas fa-file-pdf me-2"></i>
                      Download and have the client sign the waiver agreement before confirming waive.
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <button
                        className="btn btn-primary w-100"
                        onClick={async () => {
                          try {
                            await generateLoanWaiverAgreementAutoPDF(
                              {
                                name: renewalLoan.name,
                                idNumber: renewalLoan.id_number,
                                phone: renewalLoan.contacts,
                                borrowedAmount: renewalLoan.principal_amount,
                                balance: totalBalance
                              },
                              waiverAmount,
                              waiverDuration
                            );
                            showToast.success("Waiver agreement downloaded. Have client sign it.");
                          } catch (err) {
                            showToast.error("Failed to download waiver agreement");
                          }
                        }}
                      >
                        <i className="fas fa-download me-2"></i>Download Waiver Agreement
                      </button>
                      <button
                        className="btn btn-success w-100"
                        onClick={async () => {
                          if (waiverAmount <= 0 || waiverAmount > totalBalance) {
                            showToast.error("Please enter a valid agreed amount");
                            return;
                          }
                          setWaiverProcessing(true);
                          try {
                            const response = await (recoveryAPI.waiveLoan
                              ? recoveryAPI.waiveLoan(renewalLoan.id, waiverAmount, waiverDuration)
                              : adminAPI.waiveLoan(renewalLoan.id, waiverAmount, waiverDuration)
                            );
                            if (response.data.success) {
                              showToast.success(`Loan waived! New loan ID: ${response.data.new_loan.id}`);
                              setShowRenewalModal(false);
                              fetchData();
                            }
                          } catch (error) {
                            showToast.error(error.response?.data?.error || "Waiver failed");
                          } finally {
                            setWaiverProcessing(false);
                          }
                        }}
                        disabled={waiverProcessing}
                      >
                        {waiverProcessing ? (
                          <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
                        ) : "Confirm Waive"}
                      </button>
                    </div>
                  </>
                )}

                <div className="mt-3">
                  <button className="btn btn-secondary w-100" onClick={() => setShowRenewalModal(false)}>Cancel</button>
                </div>
              </>
            );
          })()}
        </Modal>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Account Settings" size="md">
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
                  required minLength="3"
                  placeholder="Enter new username"
                />
                <small className="text-muted">Minimum 3 characters</small>
              </div>
              <div className="mb-3">
                <label className="form-label">Current Password</label>
                <div className="input-group">
                  <input
                    type={showUsernameCurrentPass ? 'text' : 'password'}
                    className="form-control"
                    value={usernameForm.currentPassword}
                    onChange={(e) => setUsernameForm({ ...usernameForm, currentPassword: e.target.value })}
                    required
                  />
                  <button className="btn btn-outline-secondary" type="button" onClick={() => setShowUsernameCurrentPass(!showUsernameCurrentPass)}>
                    <i className={`fas fa-${showUsernameCurrentPass ? 'eye-slash' : 'eye'}`} />
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={usernameLoading}>
                {usernameLoading ? "Updating..." : "Update Username"}
              </button>
            </form>
          </div>
      
          <hr />
      
          <div className="mb-4">
            <h6 className="mb-3 fw-bold fs-5 text-center">Change Password</h6>
            <form onSubmit={handlePasswordChange}>
              <div className="mb-3">
                <label className="form-label">Current Password</label>
                <div className="input-group">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    className="form-control"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    required
                  />
                  <button className="btn btn-outline-secondary" type="button" onClick={() => setShowCurrentPass(!showCurrentPass)}>
                    <i className={`fas fa-${showCurrentPass ? 'eye-slash' : 'eye'}`} />
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <div className="input-group">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    className="form-control"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    required minLength="6"
                  />
                  <button className="btn btn-outline-secondary" type="button" onClick={() => setShowNewPass(!showNewPass)}>
                    <i className={`fas fa-${showNewPass ? 'eye-slash' : 'eye'}`} />
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <div className="input-group">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    className="form-control"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    required
                  />
                  <button className="btn btn-outline-secondary" type="button" onClick={() => setShowConfirmPass(!showConfirmPass)}>
                    <i className={`fas fa-${showConfirmPass ? 'eye-slash' : 'eye'}`} />
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-warning" disabled={passwordLoading}>
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>
      
          <hr />
      
          <div className="mt-3">
            <h6 className="fw-bold fs-5 text-center mb-3">
              <i className="fas fa-fingerprint me-2 text-primary" />
              Biometric Login
            </h6>
            {!window.PublicKeyCredential ? (
              <div className="alert alert-warning mb-0">
                <i className="fas fa-exclamation-triangle me-2" />
                Your browser does not support biometric authentication.
              </div>
            ) : user?.webauthn_credential_id ? (
              <div className="d-flex align-items-center justify-content-between p-3 rounded" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div>
                  <p className="mb-1 text-success fw-semibold">
                    <i className="fas fa-check-circle me-2" />
                    Biometrics Enabled
                  </p>
                  <small>You can log in with fingerprint or Face ID.</small>
                </div>
                <button className="btn btn-sm btn-outline-danger ms-3" onClick={disableBiometrics}>
                  <i className="fas fa-times me-1" />Disable
                </button>
              </div>
            ) : (
              <div className="d-flex align-items-center justify-content-between p-3 rounded" style={{ background: '#fafafa', border: '1px solid #e5e7eb' }}>
                <div>
                  <p className="mb-1 fw-semibold">Enable Biometric Login</p>
                  <small>Use fingerprint or Face ID to log in without typing a password.</small>
                </div>
                <button className="btn btn-sm btn-primary ms-3" onClick={enrollBiometrics}>
                  <i className="fas fa-fingerprint me-1" />Enable
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* RECOVERY ACTION MODAL*/}
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

      {showTopupModal && selectedClient && (
      <Modal
        isOpen={showTopupModal}
        onClose={() => {
          setShowTopupModal(false);
          setSelectedClient(null);
          setTopupAmount("");
          setAdjustmentAmount("");
          setTopupMethod("cash");
          setTopupReference("");
          setTopupNotes("");
        }}
        title={isTopupMode ? "Loan Top-up" : "Loan Adjustment"}
        size="md"
      >
        <div className="mb-3">
          <label className="form-label">Client Name</label>
          <input
            type="text"
            className="form-control"
            value={selectedClient.name || 'N/A'}
            readOnly
          />
        </div>
      
        <div className="mb-3">
          <label className="form-label">Current Loan Amount</label>
          <input
            type="text"
            className="form-control"
            value={fmt(selectedClient.current_principal || selectedClient.principal_amount || 0)}
            readOnly
          />
        </div>
      
        <div className="mb-3">
          <label className="form-label">Current Total to Pay</label>
          <input
            type="text"
            className="form-control"
            value={fmt(((selectedClient.current_principal || selectedClient.principal_amount || 0)) * 1.3)}
            readOnly
          />
        </div>
      
        <div className="mb-3">
          <div className="form-check form-check-inline">
            <input
              className="form-check-input"
              type="radio"
              name="topupMode"
              id="topupMode"
              checked={isTopupMode}
              onChange={() => setIsTopupMode(true)}
            />
            <label className="form-check-label" htmlFor="topupMode">
              Top-up Loan
            </label>
          </div>
          <div className="form-check form-check-inline">
            <input
              className="form-check-input"
              type="radio"
              name="adjustmentMode"
              id="adjustmentMode"
              checked={!isTopupMode}
              onChange={() => setIsTopupMode(false)}
            />
            <label className="form-check-label" htmlFor="adjustmentMode">
              Adjust Loan
            </label>
          </div>
        </div>
      
        {isTopupMode ? (
          <div className="mb-3">
            <label htmlFor="topupAmount" className="form-label">
              Top-up Amount (KSh) <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              className="form-control"
              id="topupAmount"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              min="1"
              placeholder="Enter top-up amount"
              required
            />
          </div>
        ) : (
          <div className="mb-3">
            <label htmlFor="adjustmentAmount" className="form-label">
              New Loan Amount (KSh) <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              className="form-control"
              id="adjustmentAmount"
              value={adjustmentAmount}
              onChange={(e) => setAdjustmentAmount(e.target.value)}
              min="1"
              placeholder="Enter new loan amount"
              required
            />
          </div>
        )}

        {(topupAmount > 0 || adjustmentAmount > 0) && (
          <div className="alert alert-info">
            <h6>Calculation Preview:</h6>
            <p><strong>New Loan Amount:</strong> {fmt(
              isTopupMode
                ? (selectedClient.current_principal || selectedClient.principal_amount || 0) + parseFloat(topupAmount || 0)
                : parseFloat(adjustmentAmount || selectedClient.current_principal || selectedClient.principal_amount || 0)
            )}</p>
            <p><strong>New Total to Pay:</strong> {fmt(
              (isTopupMode
                ? (selectedClient.current_principal || selectedClient.principal_amount || 0) + parseFloat(topupAmount || 0)
                : parseFloat(adjustmentAmount || selectedClient.current_principal || selectedClient.principal_amount || 0)
              ) * 1.3
            )} <small>(including 30% interest)</small></p>
          </div>
        )}

        <div className="mb-3">
          <label htmlFor="topupMethod" className="form-label">
            Disbursement Method <span className="text-danger">*</span>
          </label>
          <select
            className="form-control"
            id="topupMethod"
            value={topupMethod}
            onChange={(e) => setTopupMethod(e.target.value)}
            required
          >
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
          </select>
        </div>
      
        {topupMethod === 'mpesa' && (
          <div className="mb-3">
            <label htmlFor="topupReference" className="form-label">
              M-Pesa Reference Code <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control"
              id="topupReference"
              value={topupReference}
              onChange={(e) => setTopupReference(e.target.value)}
              placeholder="Enter M-Pesa reference (e.g., RB64AX25B1)"
              style={{ textTransform: 'uppercase' }}
              required
            />
          </div>
        )}

        <div className="mb-3">
          <label htmlFor="topupNotes" className="form-label">
            Notes
          </label>
          <textarea
            className="form-control"
            id="topupNotes"
            value={topupNotes}
            onChange={(e) => setTopupNotes(e.target.value)}
            placeholder="Additional notes about this top-up or adjustment"
            rows="3"
          />
        </div>
      
        <div className="alert alert-warning">
          <i className="fas fa-exclamation-triangle me-2"></i>
          This action will {isTopupMode ? 'increase' : 'modify'} the loan principal and recalculate the total amount with 30% interest.
        </div>
      
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-warning"
            onClick={handleTopup}
            disabled={(isTopupMode && !topupAmount) || (!isTopupMode && !adjustmentAmount)}
          >
            <i className="fas fa-edit me-2"></i>
            Process {isTopupMode ? 'Top-up' : 'Adjustment'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setShowTopupModal(false);
              setSelectedClient(null);
              setTopupAmount("");
              setAdjustmentAmount("");
              setTopupMethod("cash");
              setTopupReference("");
              setTopupNotes("");
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>
      )}

      <ConfirmationDialog
        isOpen={showFlagConfirmModal}
        onClose={() => {
          setShowFlagConfirmModal(false);
          setFlagLoanToConfirm(null);
          setFlagLoanName('');
        }}
        onConfirm={handleConfirmFlag}
        title="Confirm Flag for Valuer"
        message={`Are you sure you want to flag "${flagLoanName}" for valuer? Their records will be moved to the valuer's report.`}
        confirmText="Yes, Flag Client"
        confirmColor="danger"
      />
      

    </div>
    </CallProvider>
  );
}

export default RecoveryModule;