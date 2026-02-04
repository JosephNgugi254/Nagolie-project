"use client"

import { useState, useEffect, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { adminAPI, paymentAPI } from "../services/api"
import AdminSidebar from "../components/admin/AdminSidebar"
import AdminCard from "../components/admin/AdminCard"
import AdminTable from "../components/admin/AdminTable"
import TakeActionModal from "../components/admin/TakeActionModal"
import Modal from "../components/common/Modal"
import ConfirmationDialog from "../components/common/ConfirmationDialog"
import ImageCarousel from "../components/common/ImageCarousel"
import Toast, { showToast } from "../components/common/Toast"
import { generateTransactionReceipt, generateClientStatement,generateLoanAgreementPDF,generateInvestorAgreementPDF, generateInvestorStatementPDF, generateInvestorTransactionReceipt } from "../components/admin/ReceiptPDF";
import ShareLinkModal from "../components/admin/ShareLinkModal"
import LoanApprovalModal from "../components/admin/LoanApprovalModal"

function AdminPanel() {
  const { user, userRole, isAuthenticated, logout, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeSection, setActiveSection] = useState("overview")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const [dashboardData, setDashboardData] = useState({
    total_clients: 0,
    total_lent: 0,
    total_received: 0,
    total_revenue: 0,
    total_principal_paid: 0,  // NEW
    available_funds: 0,  // NEW
    due_today: [],
    overdue: []
  })

  // Payment Stats - NEW
  const [paymentStats, setPaymentStats] = useState({
    payment_stats: [],
    total_principal_collected: 0,
    currently_lent: 0,
    available_for_lending: 0,
    revenue_collected: 0
  })

  const [paymentStatsLoading, setPaymentStatsLoading] = useState(false)
  const [paymentStatsSearch, setPaymentStatsSearch] = useState("")
  const [paymentStatsStatus, setPaymentStatsStatus] = useState("all")

  // Investor account creation link state variables
  const [showShareLinkModal, setShowShareLinkModal] = useState(false)
  const [shareLinkData, setShareLinkData] = useState({
    link: '',
    investorName: '',
    investorEmail: '',
    investorPhone: ''
  })
  const [showViewInvestorModal, setShowViewInvestorModal] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false)

  // Handle Download Investor Agreement
  const handleDownloadInvestorAgreement = async (investor) => {
    try {
      // Note: Make sure to import the function at the top of your file
      // import { generateInvestorAgreementPDF } from "../components/admin/ReceiptPDF";

      if (!investor) {
        showToast.error("No investor selected");
        return;
      }

      await generateInvestorAgreementPDF(investor);
      showToast.success("Investor agreement downloaded successfully!");
    } catch (error) {
      console.error("Error generating investor agreement:", error);
      showToast.error("Failed to download investor agreement");
    }
  };

  // Payment Type Selection
  const [paymentType, setPaymentType] = useState('principal')
  const [mpesaPaymentType, setMpesaPaymentType] = useState('principal')

  const [showActionModal, setShowActionModal] = useState(false)
  const [mpesaReference, setMpesaReference] = useState("")

  // SMS modal state
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsPhone, setSmsPhone] = useState('');

  // Loading states
  const [loading, setLoading] = useState(true)
  const [livestockLoading, setLivestockLoading] = useState(false)
  const [approvedLoansLoading, setApprovedLoansLoading] = useState(false)
  const [applicationsLoading, setApplicationsLoading] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(false)
  const [transactionsLoading, setTransactionsLoading] = useState(false)

  // Data state variables 
  const [livestock, setLivestock] = useState([])
  const [applications, setApplications] = useState([])
  const [clients, setClients] = useState([])
  const [transactions, setTransactions] = useState([])
  const [approvedLoans, setApprovedLoans] = useState([])

  // state variable for filtering in applications
  const [pendingSearch, setPendingSearch] = useState("")
  const [pendingDate, setPendingDate] = useState("")
  const [approvedSearch, setApprovedSearch] = useState("")
  const [approvedDate, setApprovedDate] = useState("")

  const [showProcessReturnModal, setShowProcessReturnModal] = useState(false)
  const [selectedInvestorForReturn, setSelectedInvestorForReturn] = useState(null)
  const [returnAmount, setReturnAmount] = useState("")
  const [returnMethod, setReturnMethod] = useState("mpesa")
  const [returnReference, setReturnReference] = useState("")
  const [returnNotes, setReturnNotes] = useState("")
  const [isTopupAdjustmentMode, setIsTopupAdjustmentMode] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState("topup") // "topup" or "adjust"
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [isEarlyWithdrawal, setIsEarlyWithdrawal] = useState(false);


  // Investor tabs and transactions state
  const [investorTab, setInvestorTab] = useState('investors')
  const [investorTransactions, setInvestorTransactions] = useState([])
  const [investorTransactionsLoading, setInvestorTransactionsLoading] = useState(false)
  const [investorTransactionSearch, setInvestorTransactionSearch] = useState("")
  const [investorTransactionDate, setInvestorTransactionDate] = useState("")
  const [investorsError, setInvestorsError] = useState(null);


  const fetchInvestorTransactions = useCallback(async () => {
    setInvestorTransactionsLoading(true)
    try {
      console.log("Fetching investor transactions...")
      const response = await adminAPI.getInvestorTransactions()
      console.log("Investor transactions response:", response.data)

      // Sort transactions by date (newest first)
      const sortedTransactions = (response.data || []).sort((a, b) => {
        const dateA = new Date(a.created_at || a.date || a.return_date || 0)
        const dateB = new Date(b.created_at || b.date || b.return_date || 0)
        return dateB - dateA
      })

      setInvestorTransactions(sortedTransactions)
    } catch (error) {
      console.error("Failed to fetch investor transactions:", error)
      showToast.error("Failed to load investor transactions: " + (error.response?.data?.error || error.message))
      setInvestorTransactions([])
    } finally {
      setInvestorTransactionsLoading(false)
    }
  }, [])

  const [showInvestorLoginModal, setShowInvestorLoginModal] = useState(false);
  const [investorPassword, setInvestorPassword] = useState("");
  const [isInvestorSectionAuthenticated, setIsInvestorSectionAuthenticated] = useState(false);

  useEffect(() => {
    // Close sidebar when investor login modal opens on mobile
    if (showInvestorLoginModal && window.innerWidth <= 991.98) {
      setSidebarOpen(false);
    }
  }, [showInvestorLoginModal]);
    
  const handleInvestorSectionClick = () => {
    // First, always close the sidebar on mobile
    if (window.innerWidth <= 991.98) {
      setSidebarOpen(false);
    }

    // If already authenticated, just navigate to investors section
    if (isInvestorSectionAuthenticated) {
      setActiveSection("investors");
      navigate("/admin/investors");
      return;
    }

    // Show PIN modal for authentication
    setShowInvestorLoginModal(true);
  };

  // Replace the existing handleInvestorPinSubmit function with this:
const handleInvestorPasswordSubmit = (e) => {
  e.preventDefault();  
  const correctPassword = "n@g0l13";    
    if (investorPassword === correctPassword) {
      setIsInvestorSectionAuthenticated(true);
      setShowInvestorLoginModal(false);
      setInvestorPassword("");
    
      // Navigate to investor section
      setActiveSection("investors");
      navigate("/admin/investors");

      // Ensure sidebar is closed on mobile
      if (window.innerWidth <= 991.98) {
        setSidebarOpen(false);
      }

      showToast.success("Investor section unlocked");
    } else {
      showToast.error("Invalid password. Please try again.");
      setInvestorPassword("");
    }
  };

  const handleInvestorSectionLogout = () => {
    setIsInvestorSectionAuthenticated(false);

    if (activeSection === "investors") {
      setActiveSection("overview");
      navigate("/admin");
    }

    showToast.info("Investor section locked");
  };

  //state variables for creating investor
  const [investors, setInvestors] = useState([])
  const [investorsLoading, setInvestorsLoading] = useState(false)
  const [investorSearch, setInvestorSearch] = useState("")
  const [investorFilter, setInvestorFilter] = useState("")
  const [showAddInvestorModal, setShowAddInvestorModal] = useState(false)
  const [newInvestor, setNewInvestor] = useState({
    name: "",
    phone: "",
    id_number: "",
    email: "",
    investment_amount: "",
    password: ""
  })

  //state variables for editing investor
  const [showEditInvestorModal, setShowEditInvestorModal] = useState(false)
  const [editingInvestor, setEditingInvestor] = useState(null)
  const [showActivateDeactivateModal, setShowActivateDeactivateModal] = useState(false)
  const [investorToToggle, setInvestorToToggle] = useState(null)
  const [showDeleteInvestorModal, setShowDeleteInvestorModal] = useState(false)
  const [investorToDelete, setInvestorToDelete] = useState(null)
  const [updatedInvestor, setUpdatedInvestor] = useState({
    name: "",
    phone: "",
    email: "",
    id_number: "",
    notes: ""
  })

  const handleEditInvestor = (investor) => {
    setEditingInvestor(investor)
    setUpdatedInvestor({
      name: investor.name,
      phone: investor.phone,
      email: investor.email || '',
      id_number: investor.id_number,
      notes: investor.notes || ''
    })
    setShowEditInvestorModal(true)
  }

  const handleUpdateInvestor = async () => {
    try {
      const response = await adminAPI.updateInvestor(editingInvestor.id, updatedInvestor)

      if (response.data.success) {
        showToast.success("Investor updated successfully!")
        setShowEditInvestorModal(false)
        fetchInvestors()
      }
    } catch (error) {
      console.error("Error updating investor:", error)
      showToast.error(error.response?.data?.error || "Failed to update investor")
    }
  }

  const handleToggleAccountStatus = (investor) => {
    setInvestorToToggle(investor)
    setShowActivateDeactivateModal(true)
  }

  const confirmToggleAccountStatus = async () => {
    try {
      const newStatus = investorToToggle.account_status === 'active' ? 'inactive' : 'active'
      const response = await adminAPI.updateInvestor(investorToToggle.id, {
        account_status: newStatus
      })

      if (response.data.success) {
        showToast.success(`Investor account ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`)
        setShowActivateDeactivateModal(false)
        setInvestorToToggle(null)
        fetchInvestors()
      }
    } catch (error) {
      console.error("Error toggling account status:", error)
      showToast.error(error.response?.data?.error || "Failed to update account status")
    }
  }

  const handleDeleteInvestor = (investor) => {
    setInvestorToDelete(investor)
    setShowDeleteInvestorModal(true)
  }

  const confirmDeleteInvestor = async () => {
    try {
      const response = await adminAPI.deleteInvestor(investorToDelete.id)

      if (response.data.success) {
        showToast.success("Investor deleted successfully!")
        setShowDeleteInvestorModal(false)
        setInvestorToDelete(null)
        fetchInvestors()
      }
    } catch (error) {
      console.error("Error deleting investor:", error)
      showToast.error(error.response?.data?.error || "Failed to delete investor")
    }
  }

  const calculateReturnAmount = async (investor) => {
    try {
      const response = await adminAPI.calculateInvestorReturn(investor.id);

      if (response.data.success) {
        return {
          calculatedAmount: response.data.calculated_return,
          lentAmount: response.data.lent_in_period,
          totalLent: response.data.total_lent_amount,
          periodDays: response.data.period_days,
          canProcess: response.data.can_process_return
        };
      }
    } catch (error) {
      console.error("Error calculating return amount:", error);
    }

    return null;
  };

  const [investorTopupMethod, setInvestorTopupMethod] = useState("cash");
  const [investorTopupReference, setInvestorTopupReference] = useState("");
  const [investorTopupNotes, setInvestorTopupNotes] = useState("");

  const handleProcessReturn = async (investor) => {
    // Calculate 40% return based on investment amount
    const expectedAmount = investor.investment_amount * 0.40;
    
    setSelectedInvestorForReturn(investor);
    setReturnAmount(expectedAmount.toFixed(2));
    setReturnMethod("mpesa");
    setReturnReference("");
    setReturnNotes("");
    setIsTopupAdjustmentMode(false); // Start in return mode
    setAdjustmentType("topup");
    setAdjustmentAmount("");
    setInvestorTopupMethod("cash");
    setInvestorTopupReference("");
    setInvestorTopupNotes("");
    setIsEarlyWithdrawal(false);
    setShowProcessReturnModal(true);
    
    // Show info about next return date
    const currentDate = new Date();
    const nextReturnDate = new Date(investor.next_return_date);
    const canProcessNormally = currentDate >= nextReturnDate;
    
    if (canProcessNormally) {
      showToast.info(
        `Next return date has been reached. Processing normal 40% return.`,
        5000
      );
    } else {
      showToast.warning(
        `Next return date is ${formatDate(investor.next_return_date)}. Early withdrawal option available.`,
        5000
      );
    }
  };

  const handleProcessAction = async () => {
    try {
      if (!selectedInvestorForReturn) {
        showToast.error("No investor selected");
        return;
      }
  
      // If we're in topup/adjustment mode
      if (isTopupAdjustmentMode) {
        if (!adjustmentAmount || parseFloat(adjustmentAmount) <= 0) {
          showToast.error("Please enter a valid amount");
          return;
        }
  
        // Validate M-Pesa reference if needed
        if (adjustmentType === 'topup' && investorTopupMethod === 'mpesa' && !investorTopupReference) {
          showToast.error("Please enter M-Pesa reference for M-Pesa payment");
          return;
        }
  
        const data = {
          adjustment_type: adjustmentType,
          amount: parseFloat(adjustmentAmount),
          notes: investorTopupNotes,
          ...(adjustmentType === 'topup' && {
            payment_method: investorTopupMethod,
            mpesa_reference: investorTopupMethod === 'mpesa' ? investorTopupReference : null
          })
        };
  
        const response = await adminAPI.adjustInvestorInvestment(selectedInvestorForReturn.id, data);
        
        if (response.data.success) {
          showToast.success(`Investment ${adjustmentType === 'topup' ? 'topped up' : 'adjusted'} successfully`);
          setShowProcessReturnModal(false);
          fetchInvestors(); // Refresh the list
          fetchDashboardData(); // Update dashboard
        }
      } 
      // If we're in return processing mode
      else {
        // Validate return amount
        if (!returnAmount || parseFloat(returnAmount) <= 0) {
          showToast.error("Please enter a valid return amount");
          return;
        }
  
        // Check if it's early withdrawal and validate
        const currentDate = new Date();
        const nextReturnDate = new Date(selectedInvestorForReturn.next_return_date);
        
        // If it's early withdrawal (before next return date)
        const isEarly = currentDate < nextReturnDate || isEarlyWithdrawal;
        
        if (isEarly && !isEarlyWithdrawal) {
          showToast.error("Cannot process return before next return date. Please check 'Early Withdrawal' option if investor requests early return.");
          return;
        }
  
        // Validate M-Pesa reference if needed
        if (returnMethod === 'mpesa' && !returnReference) {
          showToast.error("Please enter M-Pesa reference for M-Pesa payment");
          return;
        }
  
        const data = {
          payment_method: returnMethod,
          mpesa_receipt: returnMethod === 'mpesa' ? returnReference : null,
          notes: returnNotes,
          is_early_withdrawal: isEarly
        };
  
        const response = await adminAPI.processInvestorReturn(selectedInvestorForReturn.id, data);
        
        if (response.data.success) {
          showToast.success(`Return processed successfully! ${isEarly ? '(Early withdrawal with 15% fee applied)' : ''}`);
          setShowProcessReturnModal(false);
          fetchInvestors(); // Refresh the list
          fetchDashboardData(); // Update dashboard
        }
      }
    } catch (error) {
      console.error("Error processing action:", error);
      showToast.error(error.response?.data?.error || "Failed to process action");
    }
  };

  const fetchInvestors = useCallback(async () => {
    setInvestorsLoading(true);
    setInvestorsError(null); // Now this will work since we declared it
    
    try {
      console.log("Starting to fetch investors...");

      // First, verify we have authentication
      const adminToken = localStorage.getItem("admin_token");

      if (!adminToken) {
        console.warn("No admin token found in localStorage");
        setInvestorsError("Your session has expired. Please login again.");
        showToast.error("Your session has expired. Please login again.");
        navigate("/admin/login");
        return;
      }

      // Fetch investors
      console.log("Fetching investors from API...");
      const response = await adminAPI.getInvestors();

      console.log("Investors API response received:", {
        status: response.status,
        hasData: !!response.data,
      });

      if (Array.isArray(response.data)) {
        console.log(`Setting ${response.data.length} investors`);
        setInvestors(response.data);
      } else if (response.data && response.data.investors) {
        console.log(`Setting ${response.data.investors.length} investors from object`);
        setInvestors(response.data.investors);
      } else {
        console.warn("Unexpected response format:", response.data);

        // Try to extract investors from any format
        const data = response.data || {};
        let investorsList = [];

        if (data.data && Array.isArray(data.data)) {
          investorsList = data.data;
        } else if (data.results && Array.isArray(data.results)) {
          investorsList = data.results;
        } else if (Array.isArray(data)) {
          investorsList = data;
        } else if (typeof data === 'object') {
          // Try to find any array property
          const arrayProperties = Object.values(data).filter(value => Array.isArray(value));
          if (arrayProperties.length > 0) {
            investorsList = arrayProperties[0];
          }
        }

        console.log("Extracted investors list:", investorsList.length);
        setInvestors(investorsList);
      }

    } catch (error) {
      console.error("Failed to fetch investors:", error);

      // Store the error for UI display
      setInvestorsError(error.message);

      // Handle different error types
      if (error.response?.status === 401) {
        console.log("Authentication failed (401)");
        setInvestorsError("Your session has expired. Please login again.");
        showToast.error("Your session has expired. Please login again.");

        // Clear tokens
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_user");

        navigate("/admin/login");
      } else if (error.response?.status === 500) {
        console.log("Server error (500)");
        setInvestorsError("Server error occurred. Please check backend server logs.");
        showToast.error("Server error occurred. Please check backend server logs.", 8000);
      } else if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
        console.log("Network error");
        setInvestorsError("Network error. Please check your internet connection.");
        showToast.error("Network error. Please check your internet connection and ensure the backend server is running.");
      } else {
        console.log("Other error");
        setInvestorsError(error.message || 'Unknown error');
        showToast.error(`Failed to load investors: ${error.message || 'Unknown error'}`);
      }

      // Set empty array on error
      setInvestors([]);
    } finally {
      console.log("Finished fetching investors, setting loading to false");
      setInvestorsLoading(false);
    }
  }, [navigate]);

  const handleGenerateShareLink = async (investor) => {
    console.log("Generating share link for investor:", investor)
    
    // Check if investor is pending
    if (investor.account_status !== 'pending') {
      showToast.error("Cannot generate link for investor with active/inactive account")
      return
    }

    setGeneratingLink(true)
    try {
      console.log("Calling createInvestorAccountLink API for investor ID:", investor.id)
      const response = await adminAPI.createInvestorAccountLink(investor.id)
      console.log("API Response:", response.data)

      if (response.data.success) {
        const shareData = {
          link: response.data.link,
          investorName: investor.name,
          investorEmail: investor.email || '',
          investorPhone: investor.phone,
          temporaryPassword: response.data.temporary_password || response.data.temporaryPassword || 'Check notes'
        }

        console.log("Setting shareLinkData:", shareData)

        setShareLinkData(shareData)
        setShowShareLinkModal(true)
        showToast.success("Account creation link generated!")
      } else {
        showToast.error(response.data.error || "Failed to generate link")
      }
    } catch (error) {
      console.error("Error generating share link:", error)
      console.error("Error response:", error.response?.data)
      showToast.error(error.response?.data?.error || "Failed to generate share link")
    } finally {
      setGeneratingLink(false)
    }
  }

  const filterPendingApplications = useCallback(() => {
    let filtered = applications.filter(app => app.status === 'pending')

    // Search filter (name, phone, livestock type)
    if (pendingSearch) {
      const searchTerm = pendingSearch.toLowerCase()
      filtered = filtered.filter(app => 
        app.name?.toLowerCase().includes(searchTerm) ||
        app.phone?.toLowerCase().includes(searchTerm) ||
        app.livestockType?.toLowerCase().includes(searchTerm) ||
        app.idNumber?.toLowerCase().includes(searchTerm)
      )
    }

    // Date filter (application date)
    if (pendingDate) {
      filtered = filtered.filter(app => {
        if (!app.date) return false
        const appDate = new Date(app.date).toISOString().split('T')[0]
        return appDate === pendingDate
      })
    }

    return filtered
  }, [applications, pendingSearch, pendingDate])

  const filterApprovedLoans = useCallback(() => {
    let filtered = [...approvedLoans]

    // Search filter (name, phone, livestock type, ID number)
    if (approvedSearch) {
      const searchTerm = approvedSearch.toLowerCase()
      filtered = filtered.filter(loan => 
        loan.name?.toLowerCase().includes(searchTerm) ||
        loan.phone?.toLowerCase().includes(searchTerm) ||
        loan.livestockType?.toLowerCase().includes(searchTerm) ||
        loan.idNumber?.toLowerCase().includes(searchTerm)
      )
    }

    // Date filter (approval date)
    if (approvedDate) {
      filtered = filtered.filter(loan => {
        if (!loan.date) return false
        const loanDate = new Date(loan.date).toISOString().split('T')[0]
        return loanDate === approvedDate
      })
    }

    return filtered
  }, [approvedLoans, approvedSearch, approvedDate])

  // Get filtered data
  const filteredPendingApplications = filterPendingApplications()
  const filteredApprovedLoans = filterApprovedLoans()

  //state variable for top up and editing loan amount
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [topupAmount, setTopupAmount] = useState("")
  const [topupMethod, setTopupMethod] = useState("cash")
  const [topupReference, setTopupReference] = useState("")
  const [topupNotes, setTopupNotes] = useState("")
  const [isTopupMode, setIsTopupMode] = useState(true) // true for topup, false for adjustment

  const openTopupModal = (client) => {
    console.log("Opening top-up modal for client:", client)
    setSelectedClient(client)
    setTopupAmount("")
    setAdjustmentAmount(client.borrowedAmount?.toString() || "")
    setTopupMethod("cash")
    setTopupReference("")
    setTopupNotes("")
    setIsTopupMode(true) // Default to top-up mode
    setShowTopupModal(true)
  }

  
  const handleTopup = async () => {
    if (!selectedClient?.loan_id) {
      showToast.error("Error: No active loan found for this client")
      return
    }

    let amount = 0
    if (isTopupMode) {
      // Top-up mode
      amount = parseFloat(topupAmount)
      if (isNaN(amount) || amount <= 0) {
        showToast.error("Please enter a valid top-up amount")
        return
      }
    } else {
      // Adjustment mode
      amount = parseFloat(adjustmentAmount)
      if (isNaN(amount) || amount <= 0) {
        showToast.error("Please enter a valid loan amount")
        return
      }
      // For adjustment, we send the new total principal amount
      amount = amount - selectedClient.borrowedAmount
    }

    if (topupMethod === 'mpesa' && !topupReference.trim()) {
      showToast.error("Please enter M-Pesa reference code for M-Pesa disbursement")
      return
    }

    try {
      const response = await adminAPI.processTopup(selectedClient.loan_id, {
        topup_amount: isTopupMode ? amount : 0,
        adjustment_amount: !isTopupMode ? (parseFloat(adjustmentAmount) || selectedClient.borrowedAmount) : 0,
        disbursement_method: topupMethod,
        mpesa_reference: topupMethod === 'mpesa' ? topupReference.toUpperCase().trim() : '',
        notes: topupNotes || `${isTopupMode ? 'Top-up' : 'Adjustment'} processed for ${selectedClient.name}`
      })

      if (response.data.success) {
        showToast.success(`Loan ${isTopupMode ? 'top-up' : 'adjustment'} processed successfully!`)
        setShowTopupModal(false)
        setSelectedClient(null)

        // Reset form
        setTopupAmount("")
        setAdjustmentAmount("")
        setTopupMethod("cash")
        setTopupReference("")
        setTopupNotes("")

        // Refresh all data
        await Promise.all([
          fetchDashboardData(),
          fetchClients(),
          fetchTransactions()
        ])
      }
    } catch (error) {
      console.error('Top-up processing error:', error)
      const errorMsg = error.response?.data?.error || error.message
      showToast.error(`Failed to process ${isTopupMode ? 'top-up' : 'adjustment'}: ${errorMsg}`)
    }
  }

  // Add to state variables section
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [applicationToApprove, setApplicationToApprove] = useState(null)
  const [approvingLoan, setApprovingLoan] = useState(false)

  // MPESA stk state variable 
  const [showMpesaModal, setShowMpesaModal] = useState(false)
  const [mpesaAmount, setMpesaAmount] = useState("")
  const [sendingStk, setSendingStk] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('');

  //state variables for sharing livestock
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingLivestock, setSharingLivestock] = useState(null);
  const [shareMessage, setShareMessage] = useState('');

  const openShareModal = (livestock) => {
    console.log('Opening share modal for livestock:', livestock);
    setSharingLivestock(livestock);
    setShowShareModal(true);
  };


  const openMpesaModal = (client) => {
    console.log("Opening M-Pesa modal for client:", client)
    setSelectedClient(client)
    setMpesaAmount("")
    setMpesaPaymentType('principal')  // NEW - Add this line
    setShowMpesaModal(true)
  }

  const formatPhoneNumber = (phone) => {
    // Convert 07..., 01..., or 7.../1... to 2547.../2541...
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      // Handles 07... and 01...
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
      // Handles 7... and 1...
      cleaned = '254' + cleaned;
    }
    return cleaned;
  };

  // Improved M-Pesa payment handler
  const handleMpesaPayment = async () => {
    if (!selectedClient?.loan_id || !mpesaAmount) {
      showToast.error("Please enter a valid payment amount")
      return
    }

    const paymentAmount = parseInt(mpesaAmount, 10)
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      showToast.error("Please enter a valid whole number amount")
      return
    }

    //  Validate based on payment type
    const currentPrincipal = selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0
    const expectedInterest = currentPrincipal * 0.30

    if (mpesaPaymentType === 'interest') {
      if (paymentAmount > expectedInterest) {
        showToast.error(`Interest payment cannot exceed ${formatCurrency(expectedInterest)}`)
        return
      }
    } else if (mpesaPaymentType === 'principal') {
      if (paymentAmount > currentPrincipal) {
        showToast.error(`Principal payment cannot exceed ${formatCurrency(currentPrincipal)}`)
        return
      }
    }

    setSendingStk(true)

    try {
      const formattedPhone = formatPhoneNumber(selectedClient.phone);

      const response = await paymentAPI.processMpesaPayment({
        loan_id: selectedClient.loan_id,
        amount: paymentAmount,
        phone_number: formattedPhone,
        payment_type: mpesaPaymentType  
      })

      console.log("STK Push response:", response.data)

      if (response.data.success) {
        showToast.success(`Payment prompt sent to ${selectedClient.name}. Waiting for payment confirmation...`, 5000)

        const checkoutRequestId = response.data.checkout_request_id;

        // Start enhanced status checking
        checkPaymentStatus(checkoutRequestId);

      } else {
        showToast.error("Failed to send payment prompt. Please try again.")
        setSendingStk(false)
      }
    } catch (error) {
      console.error('STK Push error:', error)
      const errorMsg = error.response?.data?.error || error.message
      showToast.error(`Failed to process M-Pesa payment: ${errorMsg}`)
      setSendingStk(false)
    }
  }

  // In AdminPanel.jsx - Smart polling with rate limit handling
  const checkPaymentStatus = async (checkoutRequestId, maxAttempts = 12) => {
    let attempts = 0;
    let isCompleted = false;
    let baseDelay = 8000; // Start with 8 seconds
    let currentDelay = baseDelay;
  
    setSendingStk(false);
  
    const pollStatus = async () => {
      if (isCompleted) return { completed: true, success: true };
    
      attempts++;
      console.log(`Checking payment status (attempt ${attempts}), delay: ${currentDelay}ms`);
    
      try {
        const statusResponse = await paymentAPI.checkMpesaStatus({
          checkout_request_id: checkoutRequestId
        });
      
        console.log('Payment status response:', statusResponse.data);
      
        if (statusResponse.data.success) {
          const statusData = statusResponse.data.status;
          const resultCode = statusData?.ResultCode;
        
          console.log('Payment status result code:', resultCode);
        
          if (resultCode === '0') {
            // Payment successful
            showToast.success('M-Pesa payment completed successfully!');
            isCompleted = true;
          
            // Refresh all relevant data
            await Promise.all([
              fetchDashboardData(),
              fetchClients(),
              fetchTransactions()
            ]);
          
            return { completed: true, success: true };
          } else if (['1032', '1', '17', '26', '1031', '1037'].includes(resultCode)) {
            // Payment cancelled, failed, or timed out
            const errorMsg = statusData?.ResultDesc || 'Payment was cancelled or failed';
            showToast.error(`Payment failed: ${errorMsg}`);
            isCompleted = true;
            return { completed: true, success: false };
          } else {
            // Still processing - increase delay for next attempt
            currentDelay = Math.min(currentDelay * 1.5, 30000); // Max 30 seconds
            if (attempts % 2 === 0) {
              showToast.info(`Waiting for payment confirmation... (${attempts}/${maxAttempts})`, 3000);
            }
            return { completed: false, success: false };
          }
        } else {
          // Handle rate limiting and other errors
          const errorMsg = statusResponse.data.error || 'Failed to check status';
          console.log('Status check API error:', errorMsg);
          
          // If rate limited, use the suggested retry time or increase delay significantly
          if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
            const retryAfter = statusResponse.data.retry_after || 30;
            currentDelay = retryAfter * 1000; // Convert to milliseconds
            showToast.info(`M-Pesa service busy. Waiting ${retryAfter} seconds...`, 4000);
          } else if (errorMsg.includes('access token')) {
            // Access token issues - wait longer
            currentDelay = 15000;
            if (attempts > 3) {
              showToast.error('M-Pesa service temporarily unavailable. Payment will be processed when service resumes.');
              return { completed: true, success: false };
            }
          } else {
            // Other errors - moderate increase
            currentDelay = Math.min(currentDelay * 1.3, 20000);
          }
          
          return { completed: false, success: false };
        }
      } catch (error) {
        console.error('Error checking status:', error);
        // Network errors - moderate increase
        currentDelay = Math.min(currentDelay * 1.3, 20000);
        if (attempts % 3 === 0) {
          showToast.info('Network issue, retrying...', 2000);
        }
        return { completed: false, success: false };
      }
    };
  
    // Initial delay before first check
    await new Promise(resolve => setTimeout(resolve, 10000));
  
    const pollWithBackoff = async () => {
      const result = await pollStatus();
    
      if (!result.completed && attempts < maxAttempts) {
        console.log(`Scheduling next check in ${currentDelay}ms`);
        setTimeout(pollWithBackoff, currentDelay);
      } else if (attempts >= maxAttempts && !result.completed) {
        showToast.info('Payment status check completed. If payment was made, it will be reflected in transactions shortly.');
        handlePollingCompletion();
      } else if (result.completed) {
        handlePollingCompletion();
      }
    };
  
    const handlePollingCompletion = () => {
      setShowMpesaModal(false);
      setSelectedClient(null);
      setMpesaAmount("");
    
      // Final refresh
      setTimeout(() => {
        Promise.all([
          fetchDashboardData(),
          fetchClients(),
          fetchTransactions()
        ]);
      }, 2000);
    };
  
    // Start polling
    pollWithBackoff();
  };
  
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [showApplicationModal, setShowApplicationModal] = useState(false)
  const [showAddLivestockModal, setShowAddLivestockModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  

  // Add these to your existing state variables
  const [applicationsTab, setApplicationsTab] = useState('pending');
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // Add this useEffectto handle dynamic field display
  useEffect(() => {
    const handleMethodChange = () => {
      const methodField = document.getElementById('paymentMethod');
      const referenceField = document.getElementById('mpesaReferenceField');

      if (methodField && referenceField) {
        referenceField.style.display = methodField.value === 'mpesa' ? 'block' : 'none';
      }
    };

    // Add event listener to payment method dropdown
    const methodField = document.getElementById('paymentMethod');
    if (methodField) {
      methodField.addEventListener('change', handleMethodChange);
    }

    return () => {
      if (methodField) {
        methodField.removeEventListener('change', handleMethodChange);
      }
    };
  }, [showPaymentModal]);

  // edit livestock in gallery state variables
  const [showEditLivestockModal, setShowEditLivestockModal] = useState(false)
  const [editingLivestock, setEditingLivestock] = useState(null)
  const [selectedImages, setSelectedImages] = useState([])

  // confirmation dialog state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [livestockToDelete, setLivestockToDelete] = useState(null)

  //search filters state variables
  const [clientSearch, setClientSearch] = useState("")
  const [clientFilter, setClientFilter] = useState("")
  const [clientDate, setClientDate] = useState("")
  const [transactionSearch, setTransactionSearch] = useState("")
  const [transactionDate, setTransactionDate] = useState("")

  const filterClients = useCallback(() => {
    let filtered = [...clients]

    // Search filter (name, phone, ID number)
    if (clientSearch) {
      const searchTerm = clientSearch.toLowerCase()
      filtered = filtered.filter(client => 
        client.name?.toLowerCase().includes(searchTerm) ||
        client.phone?.toLowerCase().includes(searchTerm) ||
        client.idNumber?.toLowerCase().includes(searchTerm)
      )
    }

    // Status filter
    if (clientFilter) {
      switch (clientFilter) {
        case "due-today":
          filtered = filtered.filter(client => {
            const daysLeft = client.daysLeft || 0;
            return daysLeft === 0;
          })
          break
        case "overdue":
          filtered = filtered.filter(client => {
            const daysLeft = client.daysLeft || 0;
            return daysLeft < 0;
          })
          break
        case "completed":
          // A loan is completed only when BOTH principal and interest are fully paid
          filtered = filtered.filter(client => {
            const currentPrincipal = client.currentPrincipal || client.borrowedAmount || 0;
            const balance = client.balance || 0;
            return currentPrincipal <= 0 && balance <= 0;
          })
          break
        case "active":
          // A client is active if they still owe ANYTHING (principal OR interest)
          filtered = filtered.filter(client => {
            const currentPrincipal = client.currentPrincipal || client.borrowedAmount || 0;
            const balance = client.balance || 0;
            return currentPrincipal > 0 || balance > 0;
          })
          break
        default:
          // "all" - no additional filtering
          break
      }
    }

    // Date filter (expected return date)
    if (clientDate) {
      filtered = filtered.filter(client => {
        if (!client.expectedReturnDate) return false
        const clientDateFormatted = new Date(client.expectedReturnDate).toISOString().split('T')[0]
        return clientDateFormatted === clientDate
      })
    }

    return filtered
  }, [clients, clientSearch, clientFilter, clientDate])

  const filterTransactions = useCallback(() => {
    let filtered = [...transactions]

    // Search filter (client name)
    if (transactionSearch) {
      const searchTerm = transactionSearch.toLowerCase()
      filtered = filtered.filter(transaction => 
        transaction.clientName?.toLowerCase().includes(searchTerm)
      )
    }

    // Date filter
    if (transactionDate) {
      filtered = filtered.filter(transaction => {
        if (!transaction.date) return false
        const transDate = new Date(transaction.date).toISOString().split('T')[0]
        return transDate === transactionDate
      })
    }

    return filtered
  }, [transactions, transactionSearch, transactionDate])

  const filterInvestorTransactions = useCallback(() => {
    let filtered = [...investorTransactions]

    // Search filter (investor name)
    if (investorTransactionSearch) {
      const searchTerm = investorTransactionSearch.toLowerCase()
      filtered = filtered.filter(transaction => 
        transaction.investor_name?.toLowerCase().includes(searchTerm)
      )
    }

    // Date filter
    if (investorTransactionDate) {
      filtered = filtered.filter(transaction => {
        if (!transaction.date && !transaction.return_date && !transaction.created_at) return false

        const transDate = new Date(
          transaction.date || transaction.return_date || transaction.created_at
        ).toISOString().split('T')[0]

        return transDate === investorTransactionDate
      })
    }

    return filtered
  }, [investorTransactions, investorTransactionSearch, investorTransactionDate])

  const filterInvestors = useCallback(() => {
    let filtered = [...investors]

    // Search filter
    if (investorSearch) {
      const searchTerm = investorSearch.toLowerCase()
      filtered = filtered.filter(investor => 
        investor.name?.toLowerCase().includes(searchTerm) ||
        investor.phone?.toLowerCase().includes(searchTerm) ||
        investor.id_number?.toLowerCase().includes(searchTerm)
      )
    }

    // Status filter
    if (investorFilter) {
      filtered = filtered.filter(investor => investor.account_status === investorFilter)
    }

    return filtered
  }, [investors, investorSearch, investorFilter])

  // Get filtered data
  const filteredInvestors = filterInvestors()

  // Get filtered data
  const filteredInvestorTransactions = filterInvestorTransactions()

  // Get filtered data
  const filteredClients = filterClients()
  const filteredTransactions = filterTransactions()

  // Redirect to login if not authenticated as admin
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated()) {
        navigate("/login");
      } else if (userRole === 'investor') { // Check userRole
        // If investor is logged in, they shouldn't access admin panel
        navigate("/investor");
      }
      // Admin users can stay
    }
  }, [isAuthenticated, userRole, authLoading, navigate]);

  //use effect for section selection in admin panel
  useEffect(() => {
    const path = location.pathname;
    let section = "overview";
    if (path.includes("/admin/clients")) {
      section = "clients";
    } else if (path.includes("/admin/transactions")) {
      section = "transactions";
    } else if (path.includes("/admin/gallery")) {
      section = "gallery";
    } else if (path.includes("/admin/applications")) {
      section = "applications";
    } else if (path.includes("/admin/payment-stats")) {
      section = "payment-stats";
    } else if (path.includes("/admin/investors")) { 
      section = "investors";

      // Check authentication for investor section
      if (isInvestorSectionAuthenticated) { // REMOVED: && investorSessionExpires
        // Session is still valid, proceed
        setActiveSection(section);
        fetchInvestors();
      } else {
        // Not authenticated, show PIN modal
        setShowInvestorLoginModal(true);
        setActiveSection("overview"); // Fallback to overview
        navigate("/admin");
      }
      return; // Don't set active section here
    }

    setActiveSection(section);

    // Fetch data for the detected section
    if (section === "payment-stats") {
      fetchPaymentStats();
    } else if (section === "investors") { 
      fetchInvestors();
    }
  }, [location.pathname, isInvestorSectionAuthenticated]); 


  // Generate temporary password for new investor
  // Remove the old generateTemporaryPassword function and replace it with:
const generateTemporaryPassword = (name, id) => {
  if (!name || name.trim().length === 0) {
    return '';
  }
  
  // For new investors, we'll let the backend generate the password
  // This function is just for display in the form
  const cleanName = name.toLowerCase().replace(/[^a-z]/g, '');
  const namePart = cleanName.substring(0, 3);
  const randomNum = Math.floor(100 + Math.random() * 900); // 100-999
  
  // Format: inv{id}_{name}{randomNum} (backend will generate similar)
  return `inv?${namePart}${randomNum}`;
};

  
  const testApiConnection = async () => {
    try {
      console.log("Testing API connection...")
      
      // Check authentication first
      if (!isAuthenticated()) {
        console.log("User is not authenticated, skipping API test");
        return false;
      }
      
      // Check token
      const token = sessionStorage.getItem("admin_token") || localStorage.getItem("admin_token")
      if (!token) {
        console.log("No token found, skipping API test");
        return false;
      }
      
      console.log("Stored admin token exists, testing connection...")
    
      // Use adminAPI instead of direct fetch
      const response = await adminAPI.test()
      console.log("Test endpoint response data:", response.data)
      return true
    } catch (error) {
      console.error("API connection test failed:", error)
      
      // If it's a 401, clear tokens and redirect
      if (error.response?.status === 401) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_user");
        sessionStorage.removeItem("admin_token");
        sessionStorage.removeItem("admin_user");
      }
      
      return false
    }
  }

  const fetchApprovedLoans = useCallback(async () => {
    setApprovedLoansLoading(true)
    try {
      console.log("Fetching approved loans...");
      const response = await adminAPI.getApprovedLoans();
      console.log("Approved loans response:", response.data);
      setApprovedLoans(response.data || []);
    } catch (error) {
      console.error("Failed to fetch approved loans:", error);
      if (error.response?.status === 401) {
        navigate("/admin/login");
        return;
      }
      setApprovedLoans([]);
      // Don't show error if it's just a timeout and we have some data
      if (approvedLoans.length === 0) {
        showToast.error("Failed to load approved loans: " + (error.response?.data?.error || error.message));
      }
    } finally {
      setApprovedLoansLoading(false)
    }
  }, [navigate, approvedLoans.length]);

  // Staggered data loading implementation(MAIN DATA INITIALIZATION)
  useEffect(() => {
    const initializeData = async () => {
      if (isAuthenticated) {
        console.log("User is authenticated, initializing data...")
        const connectionOk = await testApiConnection()
        if (connectionOk) {
          console.log("API connection successful, fetching data...")
          try {
            // Load critical data first
            await fetchDashboardData()
            await fetchClients()
            await fetchPaymentStats() 
            await fetchApplications()
            await fetchInvestors()

            // Then load heavier datasets with delay
            setTimeout(() => {
              fetchLivestock()
              fetchApprovedLoans()
              fetchTransactions()
            }, 1000)

          } catch (error) {
            console.error("Error fetching data:", error)
            showToast.error("Failed to load data from server")
          }
        } else {
          console.error("API connection failed, data not loaded")
          showToast.error("Unable to connect to server. Please check if the backend is running.")
        }
      }
    }

    initializeData()
  }, [isAuthenticated])

  const fetchDashboardData = useCallback(async () => {
    try {
      console.log("Fetching dashboard data...")
      const response = await adminAPI.getDashboard()
      console.log("Dashboard response:", response.data)
      
      if (response.data) {
        setDashboardData(response.data)
      } else {
        throw new Error('No data received from server')
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error)
      // Check if it's an authentication issue
      if (error.response?.status === 401) {
        console.log("Authentication failed, redirecting...")
        navigate("/admin/login")
        return
      }
      setDashboardData({
        total_clients: 0,
        total_lent: 0,
        total_received: 0,
        total_revenue: 0,
        due_today: [],
        overdue: []
      })
      showToast.error("Failed to load dashboard data: " + (error.response?.data?.error || error.message))
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const fetchLivestock = useCallback(async () => {
    setLivestockLoading(true)
    try {
      console.log("Fetching livestock...")
      const response = await adminAPI.getLivestock()
      console.log("Livestock response:", response.data)
      
      // Ensure it's always an array
      const data = Array.isArray(response.data) ? response.data : []
      setLivestock(data)
    } catch (error) {
      console.error("Failed to fetch livestock:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      // Always set empty array on error to prevent .map() crashes
      setLivestock([])
      
      // Only show toast if no data loaded yet
      if (livestock.length === 0) {
        showToast.error("Failed to load livestock data: " + (error.response?.data?.error || error.message));
      }
    } finally {
      setLivestockLoading(false)
    }
  }, [navigate, livestock.length])  // Note: Remove livestock.length from deps if causing infinite loops

  const fetchApplications = useCallback(async () => {
    setApplicationsLoading(true)
    try {
      console.log("Fetching applications...")
      const response = await adminAPI.getApplications()
      console.log("Applications response:", response.data)
      setApplications(response.data || [])
    } catch (error) {
      console.error("Failed to fetch applications:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setApplications([])
      showToast.error("Failed to load applications: " + (error.response?.data?.error || error.message))
    } finally {
      setApplicationsLoading(false)
    }
  }, [navigate])

  const fetchClients = useCallback(async () => {
    setClientsLoading(true)
    try {
      console.log("Fetching clients...")
      const response = await adminAPI.getClients()
      console.log("Clients response:", response.data)
      setClients(response.data || [])
    } catch (error) {
      console.error("Failed to fetch clients:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setClients([])
      showToast.error("Failed to load clients: " + (error.response?.data?.error || error.message))
    } finally {
      setClientsLoading(false)
    }
  }, [navigate])

  const fetchTransactions = useCallback(async () => {
    setTransactionsLoading(true)
    try {
      console.log("Fetching transactions...")
      const response = await adminAPI.getTransactions()
      console.log("Transactions response:", response.data)

      const sortedTransactions = (response.data || []).sort((a, b) => {
        const dateA = new Date(a.createdAt || a.date || a.created_at || 0);
        const dateB = new Date(b.createdAt || b.date || b.created_at || 0);
        return dateB - dateA;
      });

      setTransactions(sortedTransactions)
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setTransactions([])
      showToast.error("Failed to load transactions: " + (error.response?.data?.error || error.message))
    } finally {
      setTransactionsLoading(false)
    }
  }, [navigate])

  const fetchPaymentStats = useCallback(async () => {
    setPaymentStatsLoading(true)
    try {
      console.log("Fetching payment stats...")
      const response = await adminAPI.getPaymentStats()
      console.log("Payment stats response:", response.data)
      setPaymentStats(response.data || {
        payment_stats: [],
        total_principal_collected: 0,
        currently_lent: 0,
        available_for_lending: 0,
        revenue_collected: 0 
      })
    } catch (error) {
      console.error("Failed to fetch payment stats:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setPaymentStats({
        payment_stats: [],
        total_principal_collected: 0,
        currently_lent: 0,
        available_for_lending: 0,
        revenue_collected: 0 
      })
      showToast.error("Failed to load payment statistics")
    } finally {
      setPaymentStatsLoading(false)
    }
  }, [navigate])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
    }).format(Number(amount) || 0)
  }

  const formatDate = (date) => {
    // Handle null/undefined dates and multiple date field names
    const dateToFormat = date || null;
    
    if (!dateToFormat) {
      return 'N/A';
    }
    
    try {
      // Handle both string dates and Date objects
      const dateObj = new Date(dateToFormat);
      
      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        return 'N/A';
      }
      
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(dateObj);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSectionChange = (section) => {
    // Close sidebar on mobile when any section is clicked
    setSidebarOpen(false);

    // If trying to access investor section, check authentication first
    if (section === "investors") {
      handleInvestorSectionClick(); // This will check auth and show modal if needed
      return; // Don't proceed with normal section change
    }

    // For all other sections, proceed normally
    setActiveSection(section);

    // Fetch payment stats when navigating to that section
    if (section === "payment-stats") {
      fetchPaymentStats();
    }

    if (section === "overview") {
      navigate("/admin");
    } else {
      navigate(`/admin/${section}`);
    }
  };

  const formatAgreementData = (agreement) => {
    if (!agreement) return null;
    
    try {
      // If it's already an object, use it; otherwise parse it
      const data = typeof agreement === 'string' ? JSON.parse(agreement) : agreement;

      return (
        <div className="agreement-details">
          <div className="agreement-section mb-3">
            <h6 className="text-primary mb-2">Investor Information</h6>
            <div className="row">
              <div className="col-md-6">
                <p><strong>Name:</strong> {data.investor_name}</p>
                <p><strong>ID Number:</strong> {data.investor_id}</p>
                <p><strong>Phone:</strong> {data.phone}</p>
              </div>
              <div className="col-md-6">
                <p><strong>Email:</strong> {data.email}</p>
                <p><strong>Investment Date:</strong> {formatDate(data.date)}</p>
              </div>
            </div>
          </div>

          <div className="agreement-section mb-3">
            <h6 className="text-primary mb-2">Investment Details</h6>
            <div className="row">
              <div className="col-md-6">
                <p><strong>Investment Amount:</strong> {formatCurrency(data.investment_amount)}</p>
                <p><strong>Return Percentage:</strong> {data.return_percentage || '40%'}</p>
              </div>
              <div className="col-md-6">
                <p><strong>Expected Return:</strong> {formatCurrency(data.return_amount || data.investment_amount * 0.40)}</p>
                <p><strong>Return Period:</strong> {data.expected_return_period || '5 weeks for first return, then every 4 weeks thereafter'}</p>
              </div>
            </div>
          </div>

          {data.agreement_terms && (
            <div className="agreement-section mb-3">
              <h6 className="text-primary mb-2">Agreement Terms</h6>
              <ul className="list-group list-group-flush">
                {data.agreement_terms.map((term, index) => (
                  <li key={index} className="list-group-item py-2 px-0 border-0">
                    <i className="fas fa-check text-success me-2"></i>
                    {term}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="agreement-section">
            <h6 className="text-primary mb-2">Additional Information</h6>
            <div className="row">
              {data.early_withdrawal_fee && (
                <div className="col-md-6">
                  <p><strong>Early Withdrawal Fee:</strong> {data.early_withdrawal_fee}</p>
                </div>
              )}
              {data.early_withdrawal_receivable && (
                <div className="col-md-6">
                  <p><strong>Early Withdrawal Receivable:</strong> {data.early_withdrawal_receivable}</p>
                </div>
              )}
            </div>
            {data.agreement_date && (
              <p className="text-muted mt-3">
                <small>Agreement signed on: {formatDate(data.agreement_date)}</small>
              </p>
            )}
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error formatting agreement:', error);
      return (
        <div className="alert alert-warning">
          Unable to format agreement details. Showing raw data.
        </div>
      );
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      handleInvestorSectionLogout();
      // Clear any pending requests or timeouts first
      setLoading(true);

      const result = await logout()
      if (result.success) {
        showToast.success("Logged out successfully")

        // Navigate immediately without waiting for cleanup
        navigate("/")

        // Clear any state that might trigger re-renders
        setDashboardData({
          total_clients: 0,
          total_lent: 0,
          total_received: 0,
          total_revenue: 0,
          total_principal_paid: 0,
          available_funds: 0,
          due_today: [],
          overdue: []
        });

        // Reset all other state variables
        setLivestock([]);
        setApplications([]);
        setClients([]);
        setTransactions([]);
        setApprovedLoans([]);
        setInvestors([]);

        // Reset investor section authentication
        setIsInvestorSectionAuthenticated(false); // ADD THIS LINE
      }
    } catch (error) {
      console.error("Logout error:", error)
      showToast.error("Logout failed")
      navigate("/")
    } finally {
      setLoading(false);
    }
  }, [logout, navigate])

  const handleApplicationAction = async (applicationId, action, fundingData = null) => {
    try {
      if (action === "approve") {
        if (!fundingData) {
          // Open approval modal instead of directly approving
          const application = applications.find(app => app.id === applicationId)
          if (application) {
            setApplicationToApprove(application)
            setShowApprovalModal(true)
          }
          return
        }

        // Approve with funding data
        setApprovingLoan(true)
        await adminAPI.approveApplication(applicationId, fundingData)
        showToast.success("Loan approved successfully!")
      } else if (action === "reject") {
        await adminAPI.rejectApplication(applicationId)
        showToast.info("Loan application rejected.")
      }

      // Refresh data
      await Promise.all([
        fetchApplications(),
        fetchClients(),
        fetchDashboardData()
      ])

      setShowApplicationModal(false)
      setShowApprovalModal(false)
      setApplicationToApprove(null)
    } catch (error) {
      console.error(`Failed to ${action} application:`, error)
      showToast.error(`Failed to ${action} application: ${error.response?.data?.error || error.message}`)
    } finally {
      setApprovingLoan(false)
    }
  }

  const openPaymentModal = (client) => {
    console.log("Opening payment modal for client:", client)
    setSelectedClient(client)
    setShowPaymentModal(true)
  }

  const handlePayment = async (paymentData) => {
  try {
    console.log("Processing payment with data:", paymentData)
  
    if (!selectedClient?.loan_id) {
      showToast.error("Error: No active loan found for this client")
      return
    }
  
    const paymentAmount = parseFloat(paymentData.amount)
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      showToast.error("Invalid payment amount")
      return
    }
  
    // Calculate expected interest and current principal
    const currentPrincipal = selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0
    const expectedInterest = currentPrincipal * 0.30
  
    // Validate amount based on payment type
    if (paymentType === 'interest') {
      // Calculate based on current principal, not original
      const currentPrincipal = selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0
      const expectedInterest = currentPrincipal * 0.30
    
      // Check if interest was already paid for this period
      const lastInterestPayment = selectedClient.lastInterestPayment
      if (lastInterestPayment) {
          const lastPaymentDate = new Date(lastInterestPayment)
          const today = new Date()
          const daysSinceLastPayment = Math.floor((today - lastPaymentDate) / (1000 * 60 * 60 * 24))
         
          if (daysSinceLastPayment < 7 && selectedClient.interestPaid >= expectedInterest) {
              showToast.error(`Interest for this period has already been paid. Next interest payment available in ${7 - daysSinceLastPayment} days.`)
              return
          }
      }
     
      if (paymentAmount > expectedInterest) {
          showToast.error(`Interest payment cannot exceed ${formatCurrency(expectedInterest)}`)
          return
      }
    } else if (paymentType === 'principal') {
      if (paymentAmount > currentPrincipal) {
        showToast.error(`Principal payment cannot exceed ${formatCurrency(currentPrincipal)}`)
        return
      }
    }
  
    let response
  
    if (paymentData.method === 'cash') {
      response = await paymentAPI.processCashPayment({
        loan_id: selectedClient.loan_id,
        amount: paymentAmount,
        payment_type: paymentType,
        notes: paymentData.notes || `Cash ${paymentType} payment of KSh ${paymentAmount}`
      })
    } else if (paymentData.method === 'mpesa') {
      if (!mpesaReference.trim()) {
        showToast.error("Please enter M-Pesa reference code")
        return
      }
    
      response = await paymentAPI.processMpesaManual({
        loan_id: selectedClient.loan_id,
        amount: paymentAmount,
        payment_type: paymentType,
        mpesa_reference: mpesaReference.toUpperCase().trim(),
        notes: paymentData.notes || `M-Pesa ${paymentType} payment of KSh ${paymentAmount}`
      })
    }
  
    console.log("Payment response:", response.data)
  
    if (response.data.success) {
      const loanData = response.data.loan
      const interestPaid = loanData.interest_paid || 0;
      const totalInterestDue = (selectedClient.borrowedAmount || 0) * 0.30;
      const interestRemaining = totalInterestDue - interestPaid;
      
      showToast.success(
        `${paymentType.charAt(0).toUpperCase() + paymentType.slice(1)} payment processed!\n` +
        `Current Principal: ${formatCurrency(loanData.current_principal)}\n` +
        `Interest Remaining: ${formatCurrency(interestRemaining)}\n` +
        `New Balance: ${formatCurrency(loanData.balance)}`
      )
      setShowPaymentModal(false)
      setSelectedClient(null)
      setMpesaReference("")
      setPaymentType('principal')  // Reset
    
      // Refresh all data including payment stats
      await Promise.all([
        fetchDashboardData(),
        fetchClients(),
        fetchTransactions(),
        fetchPaymentStats()
      ])
    }
  } catch (error) {
    console.error('Payment processing error:', error)
    const errorMsg = error.response?.data?.error || error.message
    showToast.error(`Failed to process payment: ${errorMsg}`)
  }
}

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
      // Validate client object
      if (!client) {
        throw new Error('Client information is missing');
      }

      if (!client.client_name && !client.name) {
        throw new Error('Client name is required');
      }

      if (!client.phone) {
        throw new Error('Client phone number is required');
      }

      if (typeof client.balance === 'undefined') {
        throw new Error('Client balance information is missing');
      }

      // Generate professional reminder message
     const messageText = `Hello ${client.client_name || client.name}, this is a reminder from NAGOLIE ENTERPRISES LTD that your loan of KSh ${client.balance} is due today. Kindly pay to avoid any inconvenience. Please make your payment via: 
     Paybill: 247247
     Account: 651259
Thank you for choosing us.`;

      // Format phone number - ensure it has +254 prefix
      let phoneNumber = client.phone.toString().trim();

      if (!phoneNumber) {
        throw new Error('Phone number is empty');
      }

      // Remove any spaces or special characters
      phoneNumber = phoneNumber.replace(/\s+/g, '').replace(/[-\s()]/g, '');

      if (!phoneNumber.startsWith('+')) {
        if (phoneNumber.startsWith('0')) {
          phoneNumber = '+254' + phoneNumber.substring(1);
        } else if (phoneNumber.startsWith('254')) {
          phoneNumber = '+' + phoneNumber;
        } else {
          throw new Error('Invalid phone number format. Please use 07XXX, 2547XXX, or +2547XXX format');
        }
      }

      // Validate the final phone number format
      const phoneRegex = /^\+254[17]\d{8}$/;
      if (!phoneRegex.test(phoneNumber)) {
        throw new Error('Invalid phone number. Kenyan numbers should be +254 followed by 10 digits starting with 1 or 7');
      }

      // Validate message generation
      if (!messageText || messageText.length < 10) {
        throw new Error('Generated message is too short or invalid');
      }

      // Set states
      setSmsMessage(messageText);
      setSmsPhone(phoneNumber);
      setShowSmsModal(true);
      handleCloseModal(); // Close the TakeActionModal

    } catch (error) {
      console.error('Error in handleSendReminder:', error);

      // Show appropriate error message to user
      if (error.message.includes('phone number')) {
        showToast.error(`Phone number error: ${error.message}`);
      } else if (error.message.includes('name')) {
        showToast.error(`Client information error: ${error.message}`);
      } else if (error.message.includes('balance')) {
        showToast.error(`Loan information error: ${error.message}`);
      } else {
        showToast.error(`Failed to prepare SMS: ${error.message}`);
      }

      // Optional: Log to analytics or monitoring service
      // logError('handleSendReminder', error, { clientId: client?.id });
    }
  };

  const handleClaimOwnership = async (client) => {
    try {
      console.log('Claiming ownership for:', client.client_name || client.name);
    
      // Frontend validation - check if client is overdue
      if (client.daysLeft >= 0 && !client.days_overdue) {
        showToast.error('Loan is not overdue and cannot be claimed');
        return;
      }
    
      const response = await adminAPI.claimOwnership({
        client_id: client.client_id || client.id,
        loan_id: client.loan_id || client.id
      });
    
      if (response.data.success) {
        showToast.success(response.data.message || 'Livestock ownership claimed successfully!');
        handleCloseModal();
        
        // Refresh all relevant data to reflect changes
        await Promise.all([
          fetchDashboardData(),
          fetchClients(),
          fetchLivestock(), // This will update the gallery with the claimed livestock
          fetchTransactions()
        ]);
      } else {
        throw new Error(response.data.error || 'Failed to claim ownership');
      }
    } catch (error) {
      console.error('Error claiming ownership:', error);
      showToast.error(error.response?.data?.error || 'Error claiming ownership. Please try again.');
    }
  };

  const handleAddLivestock = async (livestockData) => {
    try {
      console.log('Adding livestock:', livestockData);

      // Use adminAPI instead of direct fetch
      const response = await adminAPI.addLivestock({
        type: livestockData.type,
        count: parseInt(livestockData.count),
        price: parseFloat(livestockData.price),
        description: livestockData.description || 'Available for purchase',  // Added
        location: livestockData.location || 'Isinya, Kajiado',  // Added
        images: livestockData.images || []
      });

      console.log('Livestock added successfully:', response.data);
      showToast.success('Livestock added successfully!');
      setShowAddLivestockModal(false);
      fetchLivestock(); // Refresh the list
      return response.data;

    } catch (error) {
      console.error('Error adding livestock:', error);
      showToast.error(`Failed to add livestock: ${error.response?.data?.error || error.message}`);
      throw error;
    }
  };

  const handleEditLivestock = (livestockItem) => {
    console.log('Editing livestock:', livestockItem)

    // Parse the location field
    let initialDescription = (livestockItem.livestock_type?.charAt(0).toUpperCase() + livestockItem.livestock_type?.slice(1)) + ' available for purchase';
    let initialLocation = 'Isinya, Kajiado';

    if (livestockItem.location) {
      // Check if it contains a pipe character
      if (livestockItem.location.includes('|')) {
        // Split by pipe, but keep all parts
        const parts = livestockItem.location.split('|');
        console.log('Split parts:', parts);

        if (parts.length >= 2) {
          // First part is description, everything after first pipe is location
          initialDescription = parts[0].trim();
          // Join all remaining parts as location (in case location contains pipes)
          initialLocation = parts.slice(1).join('|').trim();
        } else if (parts.length === 1) {
          // Only one part - could be description or location
          const part = parts[0].trim();
          // Check if it looks like a description
          if (isDescription(part)) {
            initialDescription = part;
          } else {
            initialLocation = part;
          }
        }
      } else {
        // No pipe separator - check if it's a description or location
        if (isDescription(livestockItem.location)) {
          initialDescription = livestockItem.location.trim();
        } else {
          initialLocation = livestockItem.location.trim();
        }
      }
    }

    // For admin view, use the description from the item if available
    if (livestockItem.description && livestockItem.description !== 'Available for purchase') {
      initialDescription = livestockItem.description;
    }

    console.log('Parsed values - Description:', initialDescription, 'Location:', initialLocation);

    setEditingLivestock({
      ...livestockItem,
      description: initialDescription,
      location: initialLocation
    });

    setSelectedImages(livestockItem.images || [])
    setShowEditLivestockModal(true)
  }

// Helper function to determine if a string looks like a description
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

  const handleUpdateLivestock = async (e) => {
    e.preventDefault()
    if (!editingLivestock) return
    
    try {
      const formData = new FormData(e.target)
      const updatedData = {
        type: formData.get('editType'),
        count: parseInt(formData.get('editCount')),
        price: parseFloat(formData.get('editPrice')),
        description: formData.get('editDescription'),
        location: formData.get('editLocation'), // Make sure this is included
        images: selectedImages
      }
    
      console.log('Updating livestock with data:', updatedData)
    
      // Use adminAPI instead of direct fetch
      const response = await adminAPI.updateLivestock(editingLivestock.id, updatedData)
    
      if (response.data.success) {
        showToast.success('Livestock updated successfully!')
        setShowEditLivestockModal(false)
        setEditingLivestock(null)
        setSelectedImages([])
        fetchLivestock()
      } else {
        showToast.error(`Failed to update livestock: ${response.data.error}`)
      }
    } catch (error) {
      console.error('Error updating livestock:', error)
      showToast.error(`Failed to update livestock: ${error.response?.data?.error || error.message}`)
    }
  }

  const handleDeleteLivestock = async () => {
    if (!livestockToDelete) return

    try {
      // Use adminAPI instead of direct fetch
      const response = await adminAPI.deleteLivestock(livestockToDelete)

      if (response.data.success) {
        showToast.success('Livestock deleted successfully!');
        fetchLivestock();
      } else {
        showToast.error(`Failed to delete livestock: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Error deleting livestock:', error);
      showToast.error(`Failed to delete livestock: ${error.response?.data?.error || error.message}`);
    } finally {
      setShowDeleteConfirmation(false)
      setLivestockToDelete(null)
    }
  };  

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    const newImages = []
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        newImages.push(e.target.result)
        if (newImages.length === files.length) {
          setSelectedImages(prev => [...prev, ...newImages])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index))
  }
  
  const confirmDeleteLivestock = (livestockId) => {
    setLivestockToDelete(livestockId)
    setShowDeleteConfirmation(true)
  }
   

  const pendingApplicationsCount = applications.filter(app => app.status === "pending").length

  if (authLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  
  const formatTransactionType = (type, paymentType) => {
    if (!type) return 'N/A';
    
    const typeLower = type.toLowerCase();
    const paymentTypeLower = paymentType ? paymentType.toLowerCase() : '';
    
    // Handle payment types specifically
    if (typeLower === 'payment') {
      if (paymentTypeLower === 'principal') return 'Principal Payment';
      if (paymentTypeLower === 'interest') return 'Interest Payment';
      return 'Payment';
    }

    const typeMap = {
      'topup': 'Loan Top-up',
      'adjustment': 'Loan Adjustment',
      'payment': 'Payment',
      'disbursement': 'Disbursement',
      'claim': 'Claim',
      'investor_topup': 'Investor Top-up',
      'investor_adjustment_up': 'Investment Increase',
      'investor_adjustment_down': 'Investment Decrease',
      'investor_return': 'Investor Return',
      'initial_investment': 'Initial Investment'
    };

    return typeMap[typeLower] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getTransactionBadgeColor = (type) => {
    const typeLower = (type || '').toLowerCase();

    switch(typeLower) {
      case 'disbursement':
        return 'bg-primary';
      case 'topup':
      case 'adjustment':
        return 'bg-info';
      case 'claim':
        return 'bg-danger';
      case 'investor_topup':
      case 'investor_adjustment_up':
      case 'initial_investment':
        return 'bg-success';
      case 'investor_adjustment_down':
        return 'bg-warning';
      case 'investor_return':
        return 'bg-secondary';
      case 'payment':
      default:
        return 'bg-success';
    }
  };

  return (
    <div>
      <Toast />
      
      {/* Navigation */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container-fluid">
          <a className="navbar-brand d-flex align-items-center" href="#">
            <img src="/logo.png" alt="Nagolie Enterprises" height="30" className="me-2" />
            <span>Admin Dashboard</span>
          </a>

          <div className="navbar-nav ms-auto align-items-center flex-row">
            <span className="navbar-text me-3 d-none d-lg-block">Welcome, Admin</span>
            
            <button className="sidebar-toggle d-lg-none ms-3" onClick={toggleSidebar}>
              <i className="fas fa-bars"></i>
            </button>

            <button className="btn btn-outline-light btn-sm d-none d-lg-block" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt me-1"></i>Logout
            </button>
          </div>
        </div>
      </nav>

      <div className={`sidebar-backdrop ${sidebarOpen ? "show" : ""}`} onClick={toggleSidebar}></div>

      <div className="container-fluid">
        <div className="row">
          <div className={`col-md-3 col-lg-2 sidebar ${sidebarOpen ? "show" : ""}`}>
            <AdminSidebar
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
              pendingApplications={pendingApplicationsCount}
              onLogout={handleLogout}
              isMobile={sidebarOpen}
            />
          </div>

          <div className="col-md-9 col-lg-10 main-content">

            {/* Overview Section */}
            {activeSection === "overview" && (
              <div id="overview-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Dashboard Overview</h2>
                  <div className="text-muted">
                    <i className="fas fa-calendar me-1"></i>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="mt-2">Loading dashboard data...</p>
                  </div>
                ) : (
                  <>
                    
                    <div className="row mb-4">
                      <div className="col-md-3 mb-3">
                        <AdminCard
                          title="Total Clients"
                          value={dashboardData.total_clients}
                          icon="fa-users"
                          color="primary"
                        />
                      </div>
                      <div className="col-md-3 mb-3">
                        <AdminCard
                          title="Money Lent"
                          value={formatCurrency(dashboardData.total_lent)}
                          icon="fa-hand-holding-usd"
                          color="success"
                        />
                      </div>
                      <div className="col-md-3 mb-3">
                        <AdminCard
                          title="Money Received"
                          value={formatCurrency(dashboardData.total_received)}
                          icon="fa-coins"
                          color="info"
                        />
                      </div>
                      <div className="col-md-3 mb-3">
                        <AdminCard
                          title="Available Funds"
                          value={formatCurrency(paymentStats.available_for_lending)}
                          icon="fa-wallet"
                          color="warning"
                        />
                      </div>
                    </div>

                    {/* Due Today Section */}
                    <div className="row mb-4">
                      <div className="col-12">
                        <div className="card shadow">
                          <div className="card-header bg-warning text-white">
                            <h6 className="m-0 font-weight-bold">
                              <i className="fas fa-clock me-2"></i>
                              Due Today ({dashboardData.due_today.length})
                            </h6>
                          </div>
                          <div className="card-body">
                            {dashboardData.due_today.length === 0 ? (
                              <p className="text-muted">No loans due today</p>
                            ) : (
                              dashboardData.due_today.map((client) => (
                                <div key={client.id} className="due-client-card alert alert-warning">
                                  <div className="client-info">
                                    <h6 className="fw-bold mb-1">{client.client_name}</h6>
                                    <p className="mb-1">
                                      <strong>KES {client.balance?.toLocaleString()}</strong> remaining
                                    </p>
                                    <small className="text-muted">
                                      <i className="fas fa-phone me-1"></i>
                                      {client.phone}
                                    </small>
                                  </div>
                                  <div className="client-actions">
                                    <button
                                      className="btn btn-primary btn-sm btn-action"
                                      onClick={() => handleTakeAction(client)}
                                    >
                                      <i className="fas fa-bolt"></i>
                                      Take Action
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                          
                    {/* Overdue Section */}
                    <div className="row">
                      <div className="col-12">
                        <div className="card shadow">
                          <div className="card-header bg-danger text-white">
                            <h6 className="m-0 font-weight-bold">
                              <i className="fas fa-exclamation-triangle me-2"></i>
                              Overdue ({dashboardData.overdue.length})
                            </h6>
                          </div>
                          <div className="card-body">
                            {dashboardData.overdue.length === 0 ? (
                              <p className="text-muted">No overdue loans</p>
                            ) : (
                              dashboardData.overdue.map((client) => (
                                <div key={client.id} className="overdue-client-card alert alert-danger">
                                  <div className="client-info">
                                    <h6 className="fw-bold mb-1">{client.client_name}</h6>
                                    <p className="mb-1">
                                      <strong>KES {client.balance?.toLocaleString()}</strong> remaining
                                    </p>
                                    <small className="text-muted">
                                      <i className="fas fa-phone me-1"></i>
                                      {client.phone}
                                      <span className="ms-2 badge bg-dark">
                                        {client.days_overdue} days overdue
                                      </span>
                                    </small>
                                  </div>
                                  <div className="client-actions">
                                    <button
                                      className="btn btn-primary btn-sm btn-action"
                                      onClick={() => handleTakeAction(client)}
                                    >
                                      <i className="fas fa-bolt"></i>
                                      Take Action
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Clients Section */}
            {activeSection === "clients" && (
              <div id="clients-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Client Management</h2>
                  <div className="d-flex gap-2">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Search clients..." 
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                    <select 
                      className="form-select"
                      value={clientFilter}
                      onChange={(e) => setClientFilter(e.target.value)}
                    >
                      <option value="">All Clients</option>
                      <option value="active">Active Loans</option>
                      <option value="due-today">Due Today</option>
                      <option value="overdue">Overdue</option>
                      <option value="completed">Completed</option>
                    </select>
                    <input 
                      type="date" 
                      className="form-control" 
                      placeholder="Due Date"
                      value={clientDate}
                      onChange={(e) => setClientDate(e.target.value)}
                    />
                  </div>
                </div>
            

                <div className="card">
                  <div className="card-body">
                    {filteredClients.length === 0 ? (
                      <div className="text-center py-5">
                        <i className="fas fa-users fa-3x text-muted mb-3"></i>
                        <h5 className="text-muted">
                          {clients.length === 0 ? "No Clients Found" : "No Clients Match Your Filters"}
                        </h5>
                        <p className="text-muted">
                          {clients.length === 0 
                            ? "No active clients in the system yet." 
                            : "Try adjusting your search or filter criteria."}
                        </p>
                      </div>
                    ) : (
                      <AdminTable
                        columns={[
                          { header: "Name", field: "name" },
                          { header: "Phone", field: "phone" },
                          { header: "ID Number", field: "idNumber" },
                          { header: "Borrowed Date", field: "borrowedDate", render: (row) => formatDate(row.borrowedDate) },
                          { header: "Amount Borrowed", field: "borrowedAmount", render: (row) => formatCurrency(row.borrowedAmount) },
                          { header: "Expected Return", field: "expectedReturnDate", render: (row) => formatDate(row.expectedReturnDate) },
                          { header: "Amount Paid", field: "amountPaid", render: (row) => formatCurrency(row.amountPaid) },
                          { header: "Balance", field: "balance", render: (row) => formatCurrency(row.balance) },
                          { 
                            header: "Status", 
                            field: "status",
                            render: (row) => {
                              const currentPrincipal = row.currentPrincipal || row.borrowedAmount || 0;
                              const balance = row.balance || 0;
                              const days = row.daysLeft || 0;
                              
                              let status = "active";
                              let className = "badge ";
                              let text = "";
                              
                              if (currentPrincipal <= 0 && balance <= 0) {
                                status = "completed";
                                className += "bg-secondary";
                                text = "Completed";
                              } else if (days < 0) {
                                status = "overdue";
                                className += "bg-danger";
                                text = `${Math.abs(days)} days overdue`;
                              } else if (days === 0) {
                                status = "due-today";
                                className += "bg-warning";
                                text = "Due today";
                              } else if (currentPrincipal <= 0 && balance > 0) {
                                status = "interest-only";
                                className += "bg-info";
                                text = "Interest only";
                              } else {
                                status = "active";
                                className += "bg-success";
                                text = `${days} days left`;
                              }
                              
                              return <span className={className}>{text}</span>;
                            }
                          },
                          {
                            header: "Actions",
                            render: (row) => (
                              <div className="btn-group btn-group-sm">
                                {/* Process Payment (cash) */}
                                <button 
                                  className="btn btn-outline-primary" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPaymentModal(row);
                                  }}
                                  title="Process Cash Payment"
                                >
                                  <i className="fas fa-money-bill-wave"></i>
                                </button>
                                {/* Process M-Pesa Payment */}
                                <button 
                                  className="btn btn-outline-success" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMpesaModal(row);
                                  }}
                                  title="Process M-Pesa Payment"
                                >
                                  <i className="fas fa-mobile-alt"></i>
                                </button>
                                {/* NEW: Top-up/Adjust Loan */}
                                <button 
                                  className="btn btn-outline-warning" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTopupModal(row);
                                  }}
                                  title="Top-up/Adjust Loan"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                {/* Download Receipt */}
                                <button 
                                  className="btn btn-outline-info" 
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await generateClientStatement(row, transactions);
                                      showToast.success("Client statement downloaded!");
                                    } catch (error) {
                                      console.error("Error generating client statement:", error);
                                      showToast.error("Failed to download client statement");
                                    }
                                  }}
                                  title="Download Receipt"
                                >
                                  <i className="fas fa-download"></i>
                                </button>
                              </div>
                            ),
                          },
                        ]}
                        data={filteredClients}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Transactions Section */}
            {activeSection === "transactions" && (
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
                    {filteredTransactions.length === 0 ? (
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
                          { header: "Date", field: "date", render: (row) => formatDate(row.createdAt || row.date || row.created_at) },
                          { header: "Client", field: "clientName" },
                          { 
                            header: "Type", 
                            field: "type",
                            render: (row) => {
                              const paymentType = row.payment_type || row.paymentType || '';
                              const displayType = formatTransactionType(row.type, paymentType);
                              const badgeClass = getTransactionBadgeColor(row.type);

                              return <span className={`badge ${badgeClass}`}>{displayType}</span>;
                            }
                          },
                          { header: "Amount", field: "amount", render: (row) => formatCurrency(row.amount) },
                          { 
                            header: "Method", 
                            field: "method",
                            render: (row) => (
                              <span className={`badge ${row.method === "mpesa" ? "bg-info" : "bg-secondary"}`}>
                                {row.method.toUpperCase()}
                              </span>
                            )
                          },
                          { 
                            header: "Status", 
                            field: "status",
                            render: (row) => (
                              <span className="badge bg-success">{row.status}</span>
                            )
                          },
                          {
                            header: "Actions",
                            render: (row) => (
                              <button 
                                className="btn btn-sm btn-outline-info"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await generateTransactionReceipt(row);
                                    showToast.success(`Transaction receipt for ${row.clientName} downloaded!`);
                                  } catch (error) {
                                    console.error("Error generating transaction receipt:", error);
                                    showToast.error("Failed to download transaction receipt");
                                  }
                                }}
                                title="Download Receipt"
                              >
                                <i className="fas fa-download"></i>
                              </button>
                            ),
                          },
                        ]}
                        data={filteredTransactions}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Livestock Gallery Section */}
            {activeSection === "gallery" && (
              <div id="gallery-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Livestock Gallery Management</h2>
                  <button className="btn btn-primary" onClick={() => setShowAddLivestockModal(true)}>
                    <i className="fas fa-plus me-1"></i>Add Livestock
                  </button>
                </div>
            
                {livestockLoading ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading livestock...</span>
                    </div>
                    <p className="mt-2">Loading livestock data...</p>
                  </div>
                ) : (
                  <>
                    {livestock.length === 0 ? (
                      <div className="card">
                        <div className="card-body text-center py-5">
                          <i className="fas fa-images fa-3x text-muted mb-3"></i>
                          <h5 className="text-muted">No Livestock in Gallery</h5>
                          <p className="text-muted">Get started by adding livestock to your gallery.</p>
                          <button className="btn btn-primary mt-3" onClick={() => setShowAddLivestockModal(true)}>
                            <i className="fas fa-plus me-2"></i>Add Your First Livestock
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="row" id="adminGallery">
                        {livestock.map((item) => (
                          <div key={item.id} className="col-md-6 col-lg-4 gallery-item mb-4">
                            <div className="card gallery-card h-100">
                              {/* Image Carousel */}
                              <ImageCarousel images={item.images} title={item.title} />

                              <div className="card-body d-flex flex-column">
                                <h5 className="card-title">{item.title}</h5>
                                <p className="card-text flex-grow-1">{item.description}</p>
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                  <span className="h6 text-primary">{formatCurrency(item.price)}</span>
                                  <span className={`badge ${
                                    item.daysRemaining > 1 ? 'bg-warning' : 
                                    item.daysRemaining === 1 ? 'bg-info' : 
                                    'bg-success'
                                  }`}>
                                    {item.availableInfo}
                                  </span>
                                </div>
                                
                                {/* Add ownership display */}
                                {item.ownership_type === 'investor' && item.investor_name && (
                                  <small className="text-muted mb-2">
                                    <i className="fas fa-user-tie me-1"></i>Owned by Investor: {item.investor_name}
                                  </small>
                                )}
                                {item.ownership_type === 'company' && !item.isAdminAdded && (
                                  <small className="text-muted mb-2">
                                    <i className="fas fa-hand-holding-usd me-1"></i>Loan Collateral (Company Owned)
                                  </small>
                                )}
                                {item.isAdminAdded && (
                                  <small className="text-muted mb-2">
                                    <i className="fas fa-user-tie me-1"></i>Admin Added
                                  </small>
                                )}

                                <div className="mt-auto">
                                  <button 
                                    className="btn btn-sm btn-outline-primary me-2"
                                    onClick={() => handleEditLivestock(item)}
                                  >
                                    <i className="fas fa-edit"></i> Edit
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-outline-info me-2"  // NEW: Share button
                                    onClick={() => openShareModal(item)}
                                  >
                                    <i className="fas fa-share-alt"></i> Share
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => confirmDeleteLivestock(item.id)}
                                  >
                                    <i className="fas fa-trash"></i> Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Applications Section */}
            {activeSection === "applications" && (
              <div id="applications-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Loan Applications</h2>
                </div>
            
                {/* Tab Navigation */}
                <ul className="nav nav-tabs mb-4" id="applicationsTab" role="tablist">
                  <li className="nav-item" role="presentation">
                    <button 
                      className={`nav-link ${applicationsTab === 'pending' ? 'active' : ''}`}
                      onClick={() => setApplicationsTab('pending')}
                      type="button"
                    >
                      Pending Applications
                      {applications.filter(app => app.status === "pending").length > 0 && (
                        <span className="badge bg-warning ms-2">
                          {applications.filter(app => app.status === "pending").length}
                        </span>
                      )}
                    </button>
                  </li>
                  <li className="nav-item" role="presentation">
                    <button 
                      className={`nav-link ${applicationsTab === 'approved' ? 'active' : ''}`}
                      onClick={() => setApplicationsTab('approved')}
                      type="button"
                    >
                      Approved Loans
                      <span className="badge bg-success ms-2">{approvedLoans.length}</span>
                    </button>
                  </li>
                </ul>
                    
                {applicationsLoading ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading applications...</span>
                    </div>
                    <p className="mt-2">Loading applications...</p>
                  </div>
                ) : (
                  <>
                    {/* Search and Filter Section - Pending Applications */}
                    {applicationsTab === 'pending' && (
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
                    )}

                    {/* Search and Filter Section - Approved Loans */}
                    {applicationsTab === 'approved' && (
                      <div className="search-filter-row mb-4">
                        <div>
                          <label className="form-label small text-muted mb-1">Search Loans</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Search by name, phone, livestock..." 
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
                    )}

                    {/* Pending Applications Tab */}
                    {applicationsTab === 'pending' && (
                      <div className="card">
                        <div className="card-body">
                          {filteredPendingApplications.length === 0 ? (
                            <div className="text-center py-5">
                              <i className="fas fa-file-alt fa-3x text-muted mb-3"></i>
                              <h5 className="text-muted">
                                {applications.filter(app => app.status === 'pending').length === 0 
                                  ? "No Pending Applications" 
                                  : "No Applications Match Your Filters"}
                              </h5>
                              <p className="text-muted">
                                {applications.filter(app => app.status === 'pending').length === 0 
                                  ? "No pending loan applications at the moment." 
                                  : "Try adjusting your search or date criteria."}
                              </p>
                            </div>
                          ) : (
                            <AdminTable
                              columns={[
                                { header: "Date", field: "date", render: (row) => formatDate(row.date) },
                                { header: "Name", field: "name" },
                                { header: "Phone", field: "phone" },
                                { header: "Amount", field: "loanAmount", render: (row) => formatCurrency(row.loanAmount) },
                                { header: "Livestock", field: "livestock", render: (row) => `${row.livestockCount || ''} ${row.livestockType || ''}` },
                                { 
                                  header: "Status", 
                                  field: "status",
                                  render: (row) => (
                                    <span className={`badge ${row.status === "pending" ? "bg-warning" : row.status === "active" ? "bg-success" : "bg-danger"}`}>
                                      {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                                    </span>
                                  )
                                },
                                {
                                  header: "Actions",
                                  render: (row) => (
                                    <div className="btn-group btn-group-sm">
                                      <button 
                                        className="btn btn-outline-success" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleApplicationAction(row.id, "approve");
                                        }}
                                        disabled={row.status !== 'pending'}
                                        title="Approve"
                                      >
                                        <i className="fas fa-check"></i>
                                      </button>
                                      <button 
                                        className="btn btn-outline-danger" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleApplicationAction(row.id, "reject");
                                        }}
                                        disabled={row.status !== 'pending'}
                                        title="Reject"
                                      >
                                        <i className="fas fa-times"></i>
                                      </button>
                                      <button 
                                        className="btn btn-outline-info" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedApplication(row)
                                          setShowApplicationModal(true)
                                        }}
                                        title="View Details"
                                      >
                                        <i className="fas fa-eye"></i>
                                      </button>
                                    </div>
                                  ),
                                },
                              ]}
                              data={filteredPendingApplications}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Approved Loans Tab */}
                    {applicationsTab === 'approved' && (
                      <>                  
                                     
                        {approvedLoansLoading ? (
                          <div className="text-center py-5">
                            <div className="spinner-border text-primary" role="status">
                              <span className="visually-hidden">Loading approved loans...</span>
                            </div>
                            <p className="mt-2">Loading approved loans...</p>
                          </div>
                        ) : (
                          <div className="card">
                            <div className="card-body">
                              {filteredApprovedLoans.length === 0 ? (
                                <div className="text-center py-5">
                                  <i className="fas fa-file-contract fa-3x text-muted mb-3"></i>
                                  <h5 className="text-muted">
                                    {approvedLoans.length === 0 
                                      ? "No Approved Loans" 
                                      : "No Loans Match Your Filters"}
                                  </h5>
                                  <p className="text-muted">
                                    {approvedLoans.length === 0 
                                      ? "No approved loans found." 
                                      : "Try adjusting your search or date criteria."}
                                  </p>
                                </div>
                              ) : (
                                <AdminTable
                                  columns={[
                                    { header: "Approved Date", field: "date", render: (row) => formatDate(row.date) },
                                    { header: "Name", field: "name" },
                                    { header: "Phone", field: "phone" },
                                    { header: "ID Number", field: "idNumber" },
                                    { header: "Loan Amount", field: "loanAmount", render: (row) => formatCurrency(row.loanAmount) },
                                    { header: "Livestock", field: "livestock", render: (row) => `${row.livestockCount || ''} ${row.livestockType || ''}` },
                                    { header: "Location", field: "location" },
                                    {
                                      header: "Actions",
                                      render: (row) => (
                                        <div className="btn-group btn-group-sm">
                                          {/* <button 
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
                                          </button> */}
                                          <button 
                                            className="btn btn-outline-info" 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedApplication(row)
                                              setShowApplicationModal(true)
                                            }}
                                            title="View Details"
                                          >
                                            <i className="fas fa-eye"></i>
                                          </button>
                                          <button 
                                            className="btn btn-outline-success" 
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              try {
                                                await generateLoanAgreementPDF(row);
                                                showToast.success("Loan agreement downloaded successfully!");
                                              } catch (error) {
                                                console.error("Error generating loan agreement:", error);
                                                showToast.error("Failed to download loan agreement");
                                              }
                                            }}
                                            title="Download Agreement"
                                          >
                                            <i className="fas fa-download"></i>
                                          </button>
                                        </div>
                                      ),
                                    },
                                  ]}
                                  data={filteredApprovedLoans}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Payment Stats Section - NEW */}
            {activeSection === "payment-stats" && (
              <div id="payment-stats-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Payment Statistics</h2>
                  <div className="d-flex gap-2">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Search by name or phone..." 
                      value={paymentStatsSearch}
                      onChange={(e) => setPaymentStatsSearch(e.target.value)}
                    />
                    <select 
                      className="form-select"
                      value={paymentStatsStatus}
                      onChange={(e) => setPaymentStatsStatus(e.target.value)}
                    >
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
            
                {/* Summary Cards */}
                <div className="row mb-4">
                  <div className="col-md-3 mb-3">
                    <AdminCard
                      title="Total Principal Collected"
                      value={formatCurrency(paymentStats.total_principal_collected)}
                      icon="fa-coins"
                      color="success"
                    />
                  </div>
                  <div className="col-md-3 mb-3">
                    <AdminCard
                      title="Currently Lent"
                      value={formatCurrency(paymentStats.currently_lent)}
                      icon="fa-hand-holding-usd"
                      color="info"
                    />
                  </div>
                  <div className="col-md-3 mb-3">
                    <AdminCard
                      title="Available for Lending"
                      value={formatCurrency(paymentStats.available_for_lending)}
                      icon="fa-piggy-bank"
                      color="primary"
                    />
                  </div>
                  {/* NEW: Revenue Collected Card */}
                  <div className="col-md-3 mb-3">
                    <AdminCard
                      title="Revenue Collected"
                      value={formatCurrency(paymentStats.revenue_collected || 0)}
                      icon="fa-chart-line"
                      color="warning"
                    />
                  </div>
                </div>
            
                <div className="card">
                  <div className="card-body">
                    {paymentStatsLoading ? (
                      <div className="text-center py-5">
                        <div className="spinner-border text-primary" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="mt-2">Loading payment statistics...</p>
                      </div>
                    ) : (
                      <>
                        {paymentStats.payment_stats
                          .filter(stat => {
                            // Apply filters
                            if (paymentStatsSearch) {
                              const searchTerm = paymentStatsSearch.toLowerCase()
                              if (!stat.name?.toLowerCase().includes(searchTerm) &&
                                  !stat.phone?.toLowerCase().includes(searchTerm)) {
                                return false
                              }
                            }
                            if (paymentStatsStatus !== 'all') {
                              if (paymentStatsStatus === 'active' && stat.status !== 'active') return false
                              if (paymentStatsStatus === 'completed' && stat.status !== 'completed') return false
                            }
                            return true
                          }).length === 0 ? (
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
                          <AdminTable
                            columns={[
                              { header: "Name", field: "name" },
                              { header: "Phone", field: "phone" },
                              { header: "Borrowed Date", field: "borrowed_date", render: (row) => formatDate(row.borrowed_date) },
                              { header: "Amount Borrowed", field: "borrowed_amount", render: (row) => formatCurrency(row.borrowed_amount) },
                              { header: "Principal Paid", field: "principal_paid", render: (row) => formatCurrency(row.principal_paid) },
                              { header: "Current Principal", field: "current_principal", render: (row) => formatCurrency(row.current_principal) },
                              { 
                                header: "Interest Paid", 
                                field: "interest_paid", 
                                render: (row) => (
                                  <span className="text-warning fw-bold">
                                    {formatCurrency(row.interest_paid)}
                                  </span>
                                )
                              },
                              { 
                                header: "Status", 
                                field: "status",
                                render: (row) => (
                                  <span className={`badge ${row.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                                    {row.status.toUpperCase()}
                                  </span>
                                )
                              },
                            ]}
                            data={paymentStats.payment_stats.filter(stat => {
                              if (paymentStatsSearch) {
                                const searchTerm = paymentStatsSearch.toLowerCase()
                                if (!stat.name?.toLowerCase().includes(searchTerm) &&
                                    !stat.phone?.toLowerCase().includes(searchTerm)) {
                                  return false
                                }
                              }
                              if (paymentStatsStatus !== 'all') {
                                if (paymentStatsStatus === 'active' && stat.status !== 'active') return false
                                if (paymentStatsStatus === 'completed' && stat.status !== 'completed') return false
                              }
                              return true
                            })}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ================= INVESTORS SECTION ================= */}
            {activeSection === "investors" && (
              <div id="investors-section" className="content-section">
              
                {/* ================= HEADER WITH LOCK STATE ================= */}
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Investor Management</h2>
            
                  {isInvestorSectionAuthenticated ? (
                    <div className="d-flex align-items-center gap-2">
                                        
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={handleInvestorSectionLogout}
                      >
                        <i className="fas fa-lock me-1"></i>
                        Lock Section
                      </button>
                  
                      <button
                        className="btn btn-primary"
                        onClick={() => setShowAddInvestorModal(true)}
                      >
                        <i className="fas fa-plus me-1"></i>
                        Add Investor
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowInvestorLoginModal(true)}
                    >
                      <i className="fas fa-unlock me-1"></i>
                      Unlock Investor Section
                    </button>
                  )}
                </div>
                
                {/* ================= LOCKED STATE ================= */}
                {!isInvestorSectionAuthenticated ? (
                  <div className="text-center py-5">
                    <i className="fas fa-lock fa-3x text-muted mb-3"></i>
                    <h5 className="text-muted">Investor Section Locked</h5>
                    <p className="text-muted">
                      Click "Unlock Investor Section" to access investor management
                    </p>
                  </div>
                ) : (
                  <>
                    
                    {/* ================= TAB NAVIGATION ================= */}
                    <ul className="nav nav-tabs mb-4" id="investorsTab">
                      <li className="nav-item">
                        <button
                          className={`nav-link ${investorTab === "investors" ? "active" : ""}`}
                          onClick={() => {
                            setInvestorTab("investors");
                            fetchInvestors();
                          }}
                        >
                          <i className="fas fa-users me-1"></i>
                          <span className="investors-tab-text-long">Investors</span>
                          <span className="investors-tab-text-short">Investors</span>
                          <span className="badge bg-info ms-1">
                            {investors.length}
                          </span>
                        </button>
                      </li>
                        
                      <li className="nav-item">
                        <button
                          className={`nav-link ${investorTab === "transactions" ? "active" : ""}`}
                          onClick={() => {
                            setInvestorTab("transactions");
                            fetchInvestorTransactions();
                          }}
                        >
                          <i className="fas fa-exchange-alt me-1"></i>
                          <span className="investors-tab-text-long">Transactions</span>
                          <span className="investors-tab-text-short">Transactions</span>
                          <span className="badge bg-success ms-1">
                            {investorTransactions.length}
                          </span>
                        </button>
                      </li>
                    </ul>
                        
                    {/* ================= INVESTORS TAB ================= */}
                    {investorTab === "investors" && (
                      <>
                        <div className="search-filter-row mb-4">
                          <div>
                            <label className="form-label small text-muted mb-1">
                              Search Investors
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Search by name, phone, ID..."
                              value={investorSearch}
                              onChange={(e) => setInvestorSearch(e.target.value)}
                            />
                          </div>
                    
                          <div>
                            <label className="form-label small text-muted mb-1">
                              Filter by Status
                            </label>
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
                    
                        <AdminTable
                          columns={[
                            { header: "Name", field: "name" },
                            { header: "Phone", field: "phone" },
                            { header: "ID Number", field: "id_number" },
                            { header: "Email", field: "email" },
                            {
                              header: "Investment Amount",
                              render: (row) =>
                                formatCurrency(row.investment_amount),
                            },
                            {
                              header: "Investment Date",
                              render: (row) =>
                                formatDate(row.invested_date),
                            },
                            {
                              header: "Next Return",
                              render: (row) => {
                                const nextDate = new Date(row.next_return_date);
                                const today = new Date();
                                const daysDiff = Math.ceil(
                                  (nextDate - today) / (1000 * 60 * 60 * 24)
                                );
                              
                                let badgeClass = "bg-success";
                                if (daysDiff <= 0) badgeClass = "bg-danger";
                                else if (daysDiff <= 2) badgeClass = "bg-warning";
                              
                                return (
                                  <span className={`badge ${badgeClass}`}>
                                    {formatDate(row.next_return_date)}
                                    {daysDiff <= 0 && " (Due)"}
                                  </span>
                                );
                              },
                            },
                            {
                              header: "Total Returns",
                              render: (row) =>
                                formatCurrency(row.total_returns_received),
                            },
                            {
                              header: "Status",
                              render: (row) => (
                                <span
                                  className={`badge ${
                                    row.account_status === "active"
                                      ? "bg-success"
                                      : row.account_status === "pending"
                                      ? "bg-warning"
                                      : "bg-secondary"
                                  }`}
                                >
                                  {row.account_status?.toUpperCase()}
                                </span>
                              ),
                            },
                            {
                              header: "Actions",
                              render: (row) => (
                                <div className="btn-group btn-group-sm">
                                  <button
                                    className="btn btn-outline-info"
                                    onClick={() => {
                                      setSelectedInvestor(row);
                                      setShowViewInvestorModal(true);
                                    }}
                                  >
                                    <i className="fas fa-eye"></i>
                                  </button>
                                  
                                  <button
                                    className="btn btn-outline-warning"
                                    onClick={() => handleEditInvestor(row)}
                                  >
                                    <i className="fas fa-edit"></i>
                                  </button>
                                  
                                  {row.account_status === "pending" && (
                                    <button
                                      className="btn btn-outline-success"
                                      onClick={() =>
                                        handleGenerateShareLink(row)
                                      }
                                      disabled={generatingLink}
                                    >
                                      <i className="fas fa-share-alt"></i>
                                    </button>
                                  )}

                                  {row.account_status === "active" && (
                                    <>
                                      <button
                                        className="btn btn-outline-primary"
                                        onClick={() =>
                                          handleProcessReturn(row)
                                        }
                                      >
                                        <i className="fas fa-money-bill-wave"></i>
                                      </button>
                                      
                                      <button
                                        className="btn btn-outline-secondary"
                                        onClick={() =>
                                          generateInvestorStatementPDF(
                                            row,
                                            investorTransactions
                                          )
                                        }
                                      >
                                        <i className="fas fa-file-alt"></i>
                                      </button>
                                    </>
                                  )}

                                  <button
                                    className={`btn btn-outline-${
                                      row.account_status === "active"
                                        ? "danger"
                                        : "success"
                                    }`}
                                    onClick={() =>
                                      handleToggleAccountStatus(row)
                                    }
                                  >
                                    <i
                                      className={`fas fa-${
                                        row.account_status === "active"
                                          ? "ban"
                                          : "check"
                                      }`}
                                    ></i>
                                  </button>
                                    
                                  <button
                                    className="btn btn-outline-danger"
                                    onClick={() => handleDeleteInvestor(row)}
                                  >
                                    <i className="fas fa-trash"></i>
                                  </button>
                                </div>
                              ),
                            },
                          ]}
                          data={filteredInvestors}
                        />
                      </>
                    )}

                    {/* ================= TRANSACTIONS TAB ================= */}
                    {investorTab === "transactions" && (
                      <AdminTable
                        columns={[
                          {
                            header: "Date",
                            render: (row) =>
                              formatDate(
                                row.date ||
                                  row.return_date ||
                                  row.created_at
                              ),
                          },
                          { header: "Investor", field: "investor_name" },
                          {
                            header: "Type",
                            render: (row) => {
                              const type = (row.type || "").toLowerCase();
                              const map = {
                                return: "bg-success",
                                topup: "bg-info",
                                adjustment: "bg-warning",
                                disbursement: "bg-primary",
                              };
                              const key =
                                Object.keys(map).find((k) =>
                                  type.includes(k)
                                ) || "disbursement";
                              
                              return (
                                <span className={`badge ${map[key]}`}>
                                  {row.type}
                                </span>
                              );
                            },
                          },
                          {
                            header: "Amount",
                            render: (row) =>
                              formatCurrency(row.amount),
                          },
                          {
                            header: "Method",
                            render: (row) => (
                              <span className="badge bg-secondary">
                                {row.method?.toUpperCase() || "CASH"}
                              </span>
                            ),
                          },
                          { header: "Reference", field: "mpesa_receipt" },
                          {
                            header: "Actions",
                            render: (row) => (
                              <button 
                                className="btn btn-sm btn-outline-info"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await generateInvestorTransactionReceipt(row);
                                    showToast.success(`Transaction receipt for ${row.investor_name} downloaded!`);
                                  } catch (error) {
                                    console.error("Error generating transaction receipt:", error);
                                    showToast.error("Failed to download transaction receipt");
                                  }
                                }}
                                title="Download Receipt"
                              >
                                <i className="fas fa-download"></i>
                              </button>
                            ),
                          },
                        ]}
                        data={filteredInvestorTransactions}
                      />
                    )}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Take Action Modal */}
      {showActionModal && selectedClient && (
        <TakeActionModal
          client={selectedClient}
          onClose={handleCloseModal}
          onSendReminder={handleSendReminder}
          onClaimOwnership={handleClaimOwnership}
        />
      )}

      {/* Application Details Modal */}
      {showApplicationModal && selectedApplication && (
        <Modal
          isOpen={showApplicationModal}
          onClose={() => setShowApplicationModal(false)}
          title="Application Details"
          size="lg"
        >
          <div className="row">
            <div className="col-md-6">
              <p><strong>Name:</strong> {selectedApplication.name || 'N/A'}</p>
              <p><strong>Phone:</strong> {selectedApplication.phone || 'N/A'}</p>
              <p><strong>ID Number:</strong> {selectedApplication.idNumber || 'N/A'}</p>
              <p><strong>Loan Amount:</strong> {formatCurrency(selectedApplication.loanAmount)}</p>
              <p><strong>Livestock:</strong> {selectedApplication.livestockCount || 'N/A'} {selectedApplication.livestockType || 'N/A'}</p>
              <p><strong>Estimated Value:</strong> {formatCurrency(selectedApplication.estimatedValue)}</p>
              <p><strong>Location:</strong> {selectedApplication.location || 'N/A'}</p>
              <p><strong>Additional Info:</strong> {selectedApplication.additionalInfo || "None"}</p>
              {selectedApplication.status === 'active' && (
                <p><strong>Approval Date:</strong> {formatDate(selectedApplication.date)}</p>
              )}
            </div>
            <div className="col-md-6">
              <strong>Photos:</strong>
              <div className="row mt-2">
                {selectedApplication.photos && selectedApplication.photos.length > 0 ? (
                  selectedApplication.photos.map((photo, index) => (
                    <div key={index} className="col-6 mb-2">
                      <img 
                        src={photo} 
                        alt={`Livestock photo ${index + 1}`} 
                        className="img-fluid rounded cursor-pointer"
                        style={{ 
                          cursor: 'pointer', 
                          height: '120px', 
                          width: '100%', 
                          objectFit: 'cover',
                          transition: 'transform 0.2s'
                        }}
                        onClick={() => {
                          setSelectedImage(photo);
                          setShowImageModal(true);
                        }}
                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                      />
                    </div>
                  ))
                ) : (
                  <div className="col-12">
                    <p className="text-muted">No photos provided</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          {selectedApplication.status === "pending" && (
            <div className="mt-4 d-flex gap-2">
              <button
                className="btn btn-success"
                onClick={() => handleApplicationAction(selectedApplication.id, "approve")}
              >
                <i className="fas fa-check me-2"></i>Approve
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleApplicationAction(selectedApplication.id, "reject")}
              >
                <i className="fas fa-times me-2"></i>Reject
              </button>
            </div>
          )}
          {selectedApplication.status === "active" && (
            <div className="mt-4 d-flex gap-2">
              <button
                className="btn btn-success"
                onClick={async () => {
                  try {
                    await generateLoanAgreementPDF(selectedApplication);
                    showToast.success("Loan agreement downloaded successfully!");
                  } catch (error) {
                    console.error("Error generating loan agreement:", error);
                    showToast.error("Failed to download loan agreement");
                  }
                }}
              >
                <i className="fas fa-download me-2"></i>Download Agreement
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Image Zoom Modal */}
      {showImageModal && selectedImage && (
        <Modal
          isOpen={showImageModal}
          onClose={() => {
            setShowImageModal(false);
            setSelectedImage(null);
          }}
          title="Livestock Photo"
          size="lg"
        >
          <div className="text-center">
            <img 
              src={selectedImage} 
              alt="Livestock" 
              className="img-fluid rounded"
              style={{ maxHeight: '70vh', width: 'auto' }}
            />
          </div>
          <div className="mt-3 text-center">
            <button 
              className="btn btn-secondary"
              onClick={() => {
                setShowImageModal(false);
                setSelectedImage(null);
              }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Add Livestock Modal */}
      {showAddLivestockModal && (
        <Modal
          isOpen={showAddLivestockModal}
          onClose={() => setShowAddLivestockModal(false)}
          title="Add Livestock to Gallery"
          size="lg"
        >
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
          
            try {
              await handleAddLivestock({
                type: formData.get('type'),
                count: parseInt(formData.get('count')),
                price: parseFloat(formData.get('price')),
                description: formData.get('description') || 'Available for purchase',
                location: formData.get('location') || 'Isinya, Kajiado',
                images: selectedImages
              });
              setSelectedImages([]); // Reset images after successful submission
            } catch (error) {
              console.error('Error in form submission:', error);
            }
          }}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockType" className="form-label">Livestock Type *</label>
                <select
                  className="form-control"
                  id="livestockType"
                  name="type"
                  required
                  style={{
                    width: '100%',
                    fontSize: '16px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    backgroundSize: '16px',
                    paddingRight: '40px'
                  }}
                >
                  <option value="cattle">Cattle</option>
                  <option value="goats">Goats</option>
                  <option value="sheep">Sheep</option>
                  <option value="poultry">Poultry</option>
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockCount" className="form-label">Count *</label>
                <input
                  type="number"
                  className="form-control"
                  id="livestockCount"
                  name="count"
                  min="1"
                  placeholder="Enter number of livestock"
                  required
                />
              </div>
            </div>
                
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockPrice" className="form-label">Price (KSh) *</label>
                <input
                  type="number"
                  className="form-control"
                  id="livestockPrice"
                  name="price"
                  min="1"
                  required
                />
              </div>
            </div>
                
            {/* Description and Location Fields */}
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockDescription" className="form-label">Description</label>
                <textarea
                  className="form-control"
                  id="livestockDescription"
                  name="description"
                  placeholder="Brief description (e.g., Healthy cow with good milk production)"
                  rows="3"
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockLocation" className="form-label">Location</label>
                <input
                  type="text"
                  className="form-control"
                  id="livestockLocation"
                  name="location"
                  placeholder="Location (e.g., Isinya, Kajiado)"
                  defaultValue="Isinya, Kajiado"
                />
              </div>
            </div>
                
            {/* Image Upload Section */}
            <div className="mb-3">
              <label htmlFor="livestockImages" className="form-label">Upload Images</label>
              <input
                type="file"
                className="form-control"
                id="livestockImages"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
              />
              <small className="text-muted">You can select multiple images</small>
                
              {/* Image Preview */}
              {selectedImages.length > 0 && (
                <div className="mt-3">
                  <label className="form-label">Image Previews:</label>
                  <div className="row">
                    {selectedImages.map((image, index) => (
                      <div key={index} className="col-3 mb-2 position-relative">
                        <img
                          src={image}
                          alt={`Preview ${index + 1}`}
                          className="img-thumbnail"
                          style={{ width: '100%', height: '80px', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm position-absolute top-0 end-0"
                          onClick={() => removeImage(index)}
                          style={{ transform: 'translate(50%, -50%)' }}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              This livestock will be added to the public gallery and marked as available immediately.
            </div>
            
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary">
                Add to Gallery
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowAddLivestockModal(false);
                  setSelectedImages([]);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Livestock Modal */}
      {showEditLivestockModal && editingLivestock && (
        <Modal
          isOpen={showEditLivestockModal}
          onClose={() => {
            setShowEditLivestockModal(false);
            setEditingLivestock(null);
            setSelectedImages([]);
          }}
          title="Edit Livestock"
          size="lg"
        >
          <form onSubmit={handleUpdateLivestock}>
            {/* Parse stored location field: "Description | Location" */}
            {(() => {
              const storedLocation = editingLivestock.location || '';
              let initialDescription = 'Available for purchase';
              let initialLocation = 'Isinya, Kajiado';
            
              if (storedLocation.includes('|')) {
                const parts = storedLocation.split('|');
                if (parts.length >= 2) {
                  initialDescription = parts[0].trim();
                  initialLocation = parts.slice(1).join('|').trim(); // In case location has |
                } else {
                  initialLocation = storedLocation.trim();
                }
              } else if (storedLocation.trim() && storedLocation.trim() !== 'Isinya, Kajiado') {
                // Fallback: if no | separator, assume it's location only
                initialLocation = storedLocation.trim();
              }
            
              // For admin view, description might come separately — use it if available
              if (editingLivestock.description && editingLivestock.description !== 'Available for purchase') {
                initialDescription = editingLivestock.description;
              }
            
              return (
                <>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label htmlFor="editType" className="form-label">Livestock Type *</label>
                      <select
                        className="form-control"
                        id="editType"
                        name="editType"
                        defaultValue={editingLivestock.type || ''}
                        required
                        style={{
                          width: '100%',
                          fontSize: '16px',
                          padding: '12px',
                          borderRadius: '8px',
                          backgroundColor: 'white',
                          border: '1px solid #ddd',
                          appearance: 'none',
                          WebkitAppearance: 'none',
                          MozAppearance: 'none',
                          backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 12px center',
                          backgroundSize: '16px',
                          paddingRight: '40px'
                        }}
                      >
                        <option value="cattle">Cattle</option>
                        <option value="goats">Goats</option>
                        <option value="sheep">Sheep</option>
                        <option value="poultry">Poultry</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label htmlFor="editCount" className="form-label">Count *</label>
                      <input
                        type="number"
                        className="form-control"
                        id="editCount"
                        name="editCount"
                        min="1"
                        defaultValue={editingLivestock.count}
                        required
                      />
                    </div>
                  </div>
                      
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label htmlFor="editPrice" className="form-label">Price (KSh) *</label>
                      <input
                        type="number"
                        className="form-control"
                        id="editPrice"
                        name="editPrice"
                        min="1"
                        defaultValue={editingLivestock.price}
                        required
                      />
                    </div>
                  </div>
                      
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label htmlFor="editDescription" className="form-label">Description</label>
                      <textarea
                        className="form-control"
                        id="editDescription"
                        name="editDescription"
                        placeholder="e.g. Healthy bulls ready for sale"
                        rows="3"
                        defaultValue={initialDescription}
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label htmlFor="editLocation" className="form-label">Location</label>
                      <input
                        type="text"
                        className="form-control"
                        id="editLocation"
                        name="editLocation"
                        placeholder="e.g. Isinya, Kajiado"
                        defaultValue={initialLocation}
                      />
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Image Upload Section */}
            <div className="mb-3">
              <label htmlFor="editLivestockImages" className="form-label">Update Images</label>
              <input
                type="file"
                className="form-control"
                id="editLivestockImages"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
              />
              <small className="text-muted">Select new images to replace or add</small>
          
              {/* Preview current + newly selected images */}
              {selectedImages.length > 0 && (
                <div className="mt-3">
                  <label className="form-label">Current Images:</label>
                  <div className="row g-2">
                    {selectedImages.map((image, index) => (
                      <div key={index} className="col-3 position-relative">
                        <img
                          src={image}
                          alt={`Image ${index + 1}`}
                          className="img-thumbnail"
                          style={{ width: '100%', height: '100px', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm position-absolute top-0 end-0"
                          onClick={() => removeImage(index)}
                          style={{ transform: 'translate(50%, -50%)', borderRadius: '50%' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowEditLivestockModal(false);
                  setEditingLivestock(null);
                  setSelectedImages([]);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Update Livestock
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Payment Modal(CASH & MPESA MANUAL) */}
      {showPaymentModal && selectedClient && (
        <Modal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false)
            setSelectedClient(null)
            setMpesaReference("") // Reset on close
          }}
          title="Process Payment"
          size="md"
        >
          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            const method = formData.get('method')

            handlePayment({
              amount: formData.get('amount'),
              method: method,
              notes: method === 'cash' 
                ? `Cash payment received for ${selectedClient.name}`
                : `M-Pesa payment received for ${selectedClient.name}`
            })
          }}>
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
              <label className="form-label">Phone Number</label>
              <input 
                type="text" 
                className="form-control" 
                value={selectedClient.phone || 'N/A'} 
                readOnly 
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Total Loan Amount</label>
              <input 
                type="text" 
                className="form-control" 
                value={formatCurrency(selectedClient.borrowedAmount || 0)} 
                readOnly 
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Amount Already Paid</label>
              <input 
                type="text" 
                className="form-control" 
                value={formatCurrency(selectedClient.amountPaid || 0)} 
                readOnly 
              />
            </div>

            <div className="mb-3">
              <label className="form-label"><strong>Current Balance</strong></label>
              <input 
                type="text" 
                className="form-control fw-bold text-danger" 
                value={formatCurrency(selectedClient.balance || 0)} 
                readOnly 
              />
            </div>

            {/* Payment Type Selection - NEW */}
            <div className="mb-3">
              <label className="form-label"><strong>Payment Type</strong> <span className="text-danger">*</span></label>
              <div className="form-check">
                <input 
                  className="form-check-input" 
                  type="radio" 
                  name="paymentTypeRadio" 
                  id="principalPayment" 
                  checked={paymentType === 'principal'}
                  onChange={() => setPaymentType('principal')}
                />
                <label className="form-check-label" htmlFor="principalPayment">
                  Principal Payment (Reduces loan amount)
                </label>
              </div>
              <div className="form-check">
                <input 
                  className="form-check-input" 
                  type="radio" 
                  name="paymentTypeRadio" 
                  id="interestPayment" 
                  checked={paymentType === 'interest'}
                  onChange={() => setPaymentType('interest')}
                />
                <label className="form-check-label" htmlFor="interestPayment">
                  Interest Payment (Extends due date by 7 days)
                </label>
              </div>
            </div>
                    
            {/* Show different info based on payment type */}
            {paymentType === 'principal' ? (
              <div className="mb-3">
                <label className="form-label">Current Principal Amount</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={formatCurrency(selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0)} 
                  readOnly 
                />
              </div>
            ) : (
              <div className="mb-3">
                <label className="form-label">Expected Interest (30%)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={formatCurrency((selectedClient.currentPrincipal || selectedClient.borrowedAmount || 0) * 0.30)} 
                  readOnly 
                />
              </div>
            )}

            <div className="mb-3">
              <label htmlFor="paymentAmount" className="form-label">
                Payment Amount (KSh) <span className="text-danger">*</span>
              </label>
              <input 
                type="number" 
                className="form-control" 
                id="paymentAmount" 
                name="amount"                 
                min="1"
                max={Math.floor(selectedClient.balance || 0)}
                placeholder="Enter amount"
                required 
              />
              <small className="text-muted">
                Maximum: {formatCurrency(Math.floor(selectedClient.balance || 0))}
              </small>
            </div>

            <div className="mb-3">
              <label htmlFor="paymentMethod" className="form-label">
                Payment Method <span className="text-danger">*</span>
              </label>
              <select 
                className="form-control" 
                id="paymentMethod" 
                name="method" 
                required
                onChange={(e) => {
                  // Reset reference when method changes
                  if (e.target.value === 'cash') {
                    setMpesaReference("")
                  }
                }}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa (Manual Reference)</option>
              </select>
            </div>
              
            {/* M-Pesa Reference Input - Only show when M-Pesa is selected */}
            <div className="mb-3" id="mpesaReferenceField" style={{
              display: document.getElementById('paymentMethod')?.value === 'mpesa' ? 'block' : 'none'
            }}>
              <label htmlFor="mpesaReference" className="form-label">
                M-Pesa Reference Code <span className="text-danger">*</span>
              </label>
              <input 
                type="text" 
                className="form-control" 
                id="mpesaReference" 
                value={mpesaReference}
                onChange={(e) => setMpesaReference(e.target.value)}
                placeholder="Enter M-Pesa reference (e.g., RB64AX25B1)"
                style={{ textTransform: 'uppercase' }}
                required={document.getElementById('paymentMethod')?.value === 'mpesa'}
              />
              <small className="text-muted">
                Enter the M-Pesa transaction reference code from the client's payment
              </small>
            </div>

            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              {document.getElementById('paymentMethod')?.value === 'mpesa' 
                ? "This payment will be recorded as M-Pesa transaction with the provided reference code."
                : "This payment will be recorded immediately and update the client's balance."
              }
            </div>
            
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-success">
                <i className="fas fa-check me-2"></i>
                {document.getElementById('paymentMethod')?.value === 'mpesa' 
                  ? "Process M-Pesa Payment" 
                  : "Process Payment"
                }
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowPaymentModal(false)
                  setSelectedClient(null)
                  setMpesaReference("")
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* M-Pesa Payment Modal */}
      {showMpesaModal && selectedClient && (
      <Modal
        isOpen={showMpesaModal}
        onClose={() => {
          setShowMpesaModal(false)
          setSelectedClient(null)
          setMpesaAmount("")
          setPaymentStatus('')
        }}
        title="Process M-Pesa Payment"
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
          <label className="form-label">Phone Number</label>
          <input 
            type="text" 
            className="form-control" 
            value={selectedClient.phone || 'N/A'} 
            readOnly 
          />
        </div>
      
        <div className="mb-3">
          <label className="form-label">Current Balance</label>
          <input 
            type="text" 
            className="form-control fw-bold text-danger" 
            value={formatCurrency(selectedClient.balance || 0)} 
            readOnly 
          />
        </div>

        {/* Payment Type Selection for M-Pesa - NEW */}
        <div className="mb-3">
          <label className="form-label"><strong>Payment Type</strong></label>
          <div className="form-check">
            <input 
              className="form-check-input" 
              type="radio" 
              name="mpesaPaymentType" 
              id="mpesaPrincipal" 
              checked={mpesaPaymentType === 'principal'}
              onChange={() => setMpesaPaymentType('principal')}
            />
            <label className="form-check-label" htmlFor="mpesaPrincipal">
              Principal Payment
            </label>
          </div>
          <div className="form-check">
            <input 
              className="form-check-input" 
              type="radio" 
              name="mpesaPaymentType" 
              id="mpesaInterest" 
              checked={mpesaPaymentType === 'interest'}
              onChange={() => setMpesaPaymentType('interest')}
            />
            <label className="form-check-label" htmlFor="mpesaInterest">
              Interest Payment
            </label>
          </div>
        </div>
      
        <div className="mb-3">
          <label htmlFor="mpesaAmount" className="form-label">
            Payment Amount (KSh) <span className="text-danger">*</span>
          </label>
          <input 
            type="number" 
            className="form-control" 
            id="mpesaAmount" 
            value={mpesaAmount}
            onChange={(e) => setMpesaAmount(e.target.value)}
            min="1"
            max={selectedClient.balance || 0}
            placeholder="Enter amount"
            required 
          />
          <small className="text-muted">
            Maximum: {formatCurrency(selectedClient.balance || 0)}
          </small>
        </div>
      
        {/* Payment Status Display */}
        {paymentStatus && (
          <div className="alert alert-info d-flex align-items-center">
            <i className="fas fa-info-circle me-2"></i>
            <span>{paymentStatus}</span>
          </div>
        )}

        <div className="alert alert-info">
          <i className="fas fa-info-circle me-2"></i>
          This will send an STK push prompt to the client's phone. The client needs to enter their M-Pesa PIN to complete the payment.
        </div>
      
        <div className="d-flex gap-2">
          <button 
            type="button" 
            className="btn btn-success"
            onClick={handleMpesaPayment}
            disabled={sendingStk || !mpesaAmount}
          >
            {sendingStk ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                Sending Prompt...
              </>
            ) : (
              <>
                <i className="fas fa-mobile-alt me-2"></i>Send STK Push
              </>
            )}
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => {
              setShowMpesaModal(false)
              setSelectedClient(null)
              setMpesaAmount("")
              setPaymentStatus('')
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>
      )}    

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirmation}
        onClose={() => {
          setShowDeleteConfirmation(false)
          setLivestockToDelete(null)
        }}
        onConfirm={handleDeleteLivestock}
        title="Delete Livestock"
        message="Are you sure you want to delete this livestock? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="danger"
      />
      {/* Top-up/Adjustment Modal */}
      {showTopupModal && selectedClient && (
        <Modal
          isOpen={showTopupModal}
          onClose={() => {
            setShowTopupModal(false)
            setSelectedClient(null)
            setTopupAmount("")
            setAdjustmentAmount("")
            setTopupMethod("cash")
            setTopupReference("")
            setTopupNotes("")
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
              value={formatCurrency(selectedClient.borrowedAmount || 0)} 
              readOnly 
            />
          </div>
        
          <div className="mb-3">
            <label className="form-label">Current Total to Pay</label>
            <input 
              type="text" 
              className="form-control" 
              value={formatCurrency(selectedClient.borrowedAmount ? selectedClient.borrowedAmount * 1.3 : 0)} 
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

          {/* Real-time calculation display */}
          {(topupAmount > 0 || adjustmentAmount > 0) && (
            <div className="alert alert-info">
              <h6>Calculation Preview:</h6>
              <p><strong>New Loan Amount:</strong> {formatCurrency(
                isTopupMode 
                  ? (selectedClient.borrowedAmount || 0) + parseFloat(topupAmount || 0)
                  : parseFloat(adjustmentAmount || selectedClient.borrowedAmount || 0)
              )}</p>
              <p><strong>New Total to Pay:</strong> {formatCurrency(
                (isTopupMode 
                  ? (selectedClient.borrowedAmount || 0) + parseFloat(topupAmount || 0)
                  : parseFloat(adjustmentAmount || selectedClient.borrowedAmount || 0)
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
                setShowTopupModal(false)
                setSelectedClient(null)
                setTopupAmount("")
                setAdjustmentAmount("")
                setTopupMethod("cash")
                setTopupReference("")
                setTopupNotes("")
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* send SMS Reminder Modal */}
      {showSmsModal && (
        <div className="modal fade show d-block" tabIndex="-1" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">SMS Reminder</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowSmsModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  <i className="fas fa-info-circle me-2"></i>
                  SMS API feature coming soon. You can edit the message and phone number below.
                </div>

                <div className="mb-3">
                  <label className="form-label">Recipient Phone:</label>
                  <input 
                    type="tel" 
                    className="form-control mb-3" 
                    value={smsPhone} 
                    onChange={(e) => setSmsPhone(e.target.value)}
                    placeholder="Enter phone number (e.g., +254712345678)"
                  />

                  <label className="form-label">Message:</label>
                  <textarea 
                    className="form-control" 
                    value={smsMessage} 
                    onChange={(e) => setSmsMessage(e.target.value)}
                    rows="5" 
                    style={{resize: 'none'}}
                    placeholder="Type your message here..."
                  />

                  <div className="mt-2 text-muted small">
                    <i className="fas fa-info-circle me-1"></i>
                    You can edit both the phone number and message before sending
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowSmsModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-outline-primary"
                  onClick={async () => {
                    try {
                      if (!navigator.clipboard) {
                        throw new Error('Clipboard API not supported in this browser');
                      }

                      await navigator.clipboard.writeText(smsMessage);
                      showToast.success('Message copied to clipboard!');
                    } catch (error) {
                      console.error('Failed to copy message:', error);
                      showToast.error('Failed to copy message. Please select and copy manually.');

                      // Fallback: Select the text for manual copy
                      const textarea = document.querySelector('.modal-body textarea');
                      if (textarea) {
                        textarea.select();
                      }
                    }
                  }}
                >
                  <i className="fas fa-copy me-2"></i>Copy Message
                </button>
                <button 
                  type="button" 
                  className="btn btn-success"
                  onClick={() => {
                    try {
                      // Validate phone number
                      if (!smsPhone.trim()) {
                        throw new Error('Please enter a phone number');
                      }

                      if (!smsMessage.trim()) {
                        throw new Error('Please enter a message');
                      }

                      // Additional phone validation
                      const phoneRegex = /^\+254[17]\d{8}$/;
                      if (!phoneRegex.test(smsPhone.trim())) {
                        throw new Error('Please enter a valid Kenyan phone number (+2547XXXXXXXX)');
                      }

                      // Open SMS app with edited message and phone number
                      const smsUri = `sms:${smsPhone.trim()}?body=${encodeURIComponent(smsMessage)}`;
                      window.location.href = smsUri;

                      showToast.info('Opening SMS app...');

                    } catch (error) {
                      console.error('Error opening SMS app:', error);
                      showToast.error(error.message);
                    }
                  }}
                >
                  <i className="fas fa-paper-plane me-2"></i>Open in SMS App
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share livestock link Modal */}
      {showShareModal && sharingLivestock && (
        <Modal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSharingLivestock(null);
            setShareMessage(''); // Reset the custom message
          }}
          title="Share Livestock"
          size="md"
        >
          <div className="mb-3">
            <label className="form-label">Livestock</label>
            <input 
              type="text" 
              className="form-control" 
              value={sharingLivestock.title || 'Untitled'} 
              readOnly 
            />
          </div>

          {/* Custom Message Input */}
          <div className="mb-3">
            <label className="form-label">Custom Message</label>
            <textarea 
              className="form-control" 
              rows="3"
              placeholder="Enter a custom message for sharing (e.g., Healthy cow with excellent milk production)"
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              maxLength="200"
            />
            <small className="text-muted">
              This message will replace the default livestock title when shared. Leave empty to use original title.
            </small>
          </div>

          <div className="mb-3">
            <label className="form-label">Shareable Link</label>
            <div className="input-group">
              <input 
                type="text" 
                className="form-control" 
                id="shareLink"
                value={`${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`}
                readOnly 
              />
              <button 
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => {
                  const linkInput = document.getElementById('shareLink');
                  linkInput.select();
                  navigator.clipboard.writeText(linkInput.value);
                  showToast.success('Link copied to clipboard!');
                }}
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
            <small className="text-muted">
              When clients open this link, the livestock will be highlighted and the details modal will open automatically.
            </small>
          </div>
              
          <div className="mb-4">
            <label className="form-label">Share via</label>
            <div className="d-flex flex-wrap gap-2">
              {/* WhatsApp Button */}
              <button 
                className="btn btn-success flex-fill d-flex align-items-center justify-content-center"
                onClick={() => {
                  // Use custom message if provided, otherwise use original title
                  const livestockTitle = shareMessage.trim() || sharingLivestock.title;
                  const message = `Check out this livestock available for purchase from Nagolie Enterprises:\n\n${livestockTitle}\nPrice: ${formatCurrency(sharingLivestock.price)}\n\nView details: ${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`;
                  const encodedMessage = encodeURIComponent(message);
                  window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
                }}
              >
                <i className="fab fa-whatsapp me-2"></i> WhatsApp
              </button>
              
              {/* Facebook Button */}
              <button 
                className="btn btn-info flex-fill d-flex align-items-center justify-content-center"
                onClick={() => {
                  const livestockTitle = shareMessage.trim() || sharingLivestock.title;
                  const text = `Check out this livestock available for purchase from Nagolie Enterprises: ${livestockTitle} - ${formatCurrency(sharingLivestock.price)}`;
                  const url = `${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`;
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank');
                }}
              >
                <i className="fab fa-facebook me-2"></i> Facebook
              </button>
              
              {/* Instagram Button */}
              <button 
                className="btn btn-danger flex-fill d-flex align-items-center justify-content-center"
                onClick={() => {
                  const livestockTitle = shareMessage.trim() || sharingLivestock.title;
                  const text = `Check out this livestock available for purchase from Nagolie Enterprises:\n${livestockTitle}\nPrice: ${formatCurrency(sharingLivestock.price)}`;
                  const url = `${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`;

                  // Since Instagram doesn't have a direct web sharing API, we'll copy to clipboard
                  const shareText = `${text}\n\nView details: ${url}`;

                  // Try to use the Web Share API if available (works on mobile)
                  if (navigator.share) {
                    navigator.share({
                      title: livestockTitle,
                      text: text,
                      url: url
                    }).catch(console.error);
                  } else {
                    // Fallback: copy to clipboard
                    navigator.clipboard.writeText(shareText)
                      .then(() => {
                        showToast.success('Copied to clipboard! You can now paste it on Instagram.');
                      })
                      .catch(() => {
                        // Fallback for older browsers
                        const textarea = document.createElement('textarea');
                        textarea.value = shareText;
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        showToast.success('Copied to clipboard! You can now paste it on Instagram.');
                      });
                  }
                }}
              >
                <i className="fab fa-instagram me-2"></i> Instagram
              </button>
            </div>
          </div>
              
          <div className="d-flex gap-2">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => {
                setShowShareModal(false);
                setSharingLivestock(null);
                setShareMessage('');
              }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* show ADD investor modal */}
      {showAddInvestorModal && (
        <Modal
          isOpen={showAddInvestorModal}
          onClose={() => {
            setShowAddInvestorModal(false)
            setNewInvestor({
              name: "",
              phone: "",
              id_number: "",
              email: "",
              investment_amount: "",
            })
          }}
          title="Add New Investor"
          size="md"
        >
          <form onSubmit={async (e) => {
            e.preventDefault()
            try {
              // Auto-generate temporary password based on name
              const tempPassword = generateTemporaryPassword(newInvestor.name);

              if (!tempPassword) {
                showToast.error("Please enter investor name to generate password")
                return
              }
            
              // Prepare investor data with auto-generated password
              const investorData = {
                name: newInvestor.name,
                phone: newInvestor.phone,
                id_number: newInvestor.id_number,
                email: newInvestor.email || "",
                investment_amount: parseFloat(newInvestor.investment_amount),
                temporary_password: tempPassword
              }
            
              console.log("Sending investor data:", investorData)
            
              const response = await adminAPI.createInvestor(investorData)
              console.log("Create investor response:", response.data)

              if (response.data.success) {
                showToast.success("Investor created successfully!")
                setShowAddInvestorModal(false)
                setNewInvestor({
                  name: "",
                  phone: "",
                  id_number: "",
                  email: "",
                  investment_amount: "",
                })

                // Refresh investors list
                await fetchInvestors()

                // Auto-show the share link modal
                if (response.data.account_creation_link) {
                  setShareLinkData({
                    link: response.data.account_creation_link,
                    investorName: investorData.name,
                    investorEmail: investorData.email || '',
                    investorPhone: investorData.phone,
                    temporaryPassword: tempPassword
                  })
                  setShowShareLinkModal(true)
                }
              }
            } catch (error) {
              console.error("Error creating investor:", error)
              showToast.error(error.response?.data?.error || "Failed to create investor")
            }
          }}>
            <div className="mb-3">
              <label className="form-label">Full Name *</label>
              <input 
                type="text" 
                className="form-control" 
                value={newInvestor.name || ""}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewInvestor({...newInvestor, name: name})
                }}
                required
                placeholder="John Doe"
                autoFocus
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Phone Number *</label>
              <input 
                type="tel" 
                className="form-control" 
                value={newInvestor.phone || ""}
                onChange={(e) => setNewInvestor({...newInvestor, phone: e.target.value})}
                required
                placeholder="07XXXXXXXX"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">ID Number *</label>
              <input 
                type="text" 
                className="form-control" 
                value={newInvestor.id_number || ""}
                onChange={(e) => setNewInvestor({...newInvestor, id_number: e.target.value})}
                required
                placeholder="12345678"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Email (Optional)</label>
              <input 
                type="email" 
                className="form-control" 
                value={newInvestor.email || ""}
                onChange={(e) => setNewInvestor({...newInvestor, email: e.target.value})}
                placeholder="john@example.com"
              />
              <small className="text-muted">Optional - for account recovery</small>
            </div>
            <div className="mb-3">
              <label className="form-label">Investment Amount (KES) *</label>
              <input 
                type="number" 
                className="form-control" 
                value={newInvestor.investment_amount || ""}
                onChange={(e) => setNewInvestor({...newInvestor, investment_amount: e.target.value})}
                min="1000"
                required
                placeholder="10000"
              />
            </div>
              
            {/* Auto-generated temporary password display */}
            <div className="mb-4">
              <label className="form-label">Temporary Password (Auto-generated)</label>
              <div className="input-group mb-2">
                <input 
                  type="text" 
                  className="form-control" 
                  value={newInvestor.name ? generateTemporaryPassword(newInvestor.name) : ''}
                  readOnly
                  placeholder="Will be generated from name"
                />
                <button 
                  className="btn btn-outline-secondary" 
                  type="button"
                  onClick={() => {
                    if (!newInvestor.name) {
                      showToast.error("Please enter investor name first")
                      return
                    }
                    const tempPass = generateTemporaryPassword(newInvestor.name);
                    navigator.clipboard.writeText(tempPass);
                    showToast.success("Temporary password copied to clipboard!");
                  }}
                >
                  <i className="fas fa-copy"></i>
                </button>
              </div>
              <small className="text-muted">
                Password will be auto-generated from the investor's name. Minimum 6 characters.
              </small>
            </div>
                
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              After creating the investor, you'll be able to share the account creation link which includes the temporary password.
            </div>
                
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary">
                Create Investor Account
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowAddInvestorModal(false)
                  setNewInvestor({
                    name: "",
                    phone: "",
                    id_number: "",
                    email: "",
                    investment_amount: "",
                  })
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* share investor account set up link */}
      {showShareLinkModal && (
        <ShareLinkModal
          isOpen={showShareLinkModal}
          onClose={() => {
            setShowShareLinkModal(false)
            setShareLinkData({
              link: '',
              investorName: '',
              investorEmail: '',
              investorPhone: '',
              temporaryPassword: ''
            })
          }}
          shareLinkData={shareLinkData}
        />
      )}
    
      {/* View Investor Details Modal - embedded directly */}
      {showViewInvestorModal && selectedInvestor && (
        <Modal
          isOpen={showViewInvestorModal}
          onClose={() => {
            setShowViewInvestorModal(false);
            setSelectedInvestor(null);
          }}
          title="Investor Details"
          size="lg"
        >
          <div className="row">
            <div className="col-md-6 mb-3">
              <p><strong>Name:</strong> {selectedInvestor.name}</p>
              <p><strong>Phone:</strong> {selectedInvestor.phone}</p>
              <p><strong>ID Number:</strong> {selectedInvestor.id_number}</p>
              <p><strong>Email:</strong> {selectedInvestor.email || 'N/A'}</p>
            </div>
            <div className="col-md-6 mb-3">
              <p><strong>Investment Amount:</strong> {formatCurrency(selectedInvestor.investment_amount)}</p>
              <p><strong>Investment Date:</strong> {formatDate(selectedInvestor.invested_date)}</p>
              <p><strong>Total Returns Received:</strong> {formatCurrency(selectedInvestor.total_returns_received)}</p>
              <p><strong>Next Return Date:</strong> {formatDate(selectedInvestor.next_return_date)}</p>
              <p><strong>Status:</strong>
                <span className={`badge ms-2 ${
                  selectedInvestor.account_status === 'active' ? 'bg-success' :
                  selectedInvestor.account_status === 'pending' ? 'bg-warning' : 'bg-secondary'
                }`}>
                  {selectedInvestor.account_status?.toUpperCase() || 'UNKNOWN'}
                </span>
              </p>
            </div>
          </div>
              
          {selectedInvestor.agreement_document && (
            <div className="mb-3">
              <strong>Agreement Details:</strong>
              <div className="card mt-2">
                <div className="card-body">
                  {formatAgreementData(selectedInvestor.agreement_document)}
                </div>
              </div>
            </div>
          )}

          <div className="d-flex gap-2 justify-content-end mt-4">
            <button
              className="btn btn-success"
              onClick={() => {
                handleDownloadInvestorAgreement(selectedInvestor);
                setShowViewInvestorModal(false);
              }}
            >
              <i className="fas fa-download me-2"></i>Download Agreement
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowViewInvestorModal(false);
                setSelectedInvestor(null);
              }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Edit Investor Modal */}
      {showEditInvestorModal && editingInvestor && (
          <Modal
            isOpen={showEditInvestorModal}
            onClose={() => {
              setShowEditInvestorModal(false);
              setEditingInvestor(null); 
          }}
          title="Edit Investor"
          size="md"
        >
          <div className="mb-3">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              className="form-control"
              value={updatedInvestor.name}
              onChange={(e) => setUpdatedInvestor({...updatedInvestor, name: e.target.value})}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Phone Number *</label>
            <input
              type="tel"
              className="form-control"
              value={updatedInvestor.phone}
              onChange={(e) => setUpdatedInvestor({...updatedInvestor, phone: e.target.value})}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Email (Optional)</label>
            <input
              type="email"
              className="form-control"
              value={updatedInvestor.email}
              onChange={(e) => setUpdatedInvestor({...updatedInvestor, email: e.target.value})}
            />
          </div>
          <div className="mb-3">
            <label className="form-label">ID Number *</label>
            <input
              type="text"
              className="form-control"
              value={updatedInvestor.id_number}
              readOnly
              disabled
            />
            <small className="text-muted">ID number cannot be changed</small>
          </div>
          <div className="mb-3">
            <label className="form-label">Notes</label>
            <textarea
              className="form-control"
              value={updatedInvestor.notes}
              onChange={(e) => setUpdatedInvestor({...updatedInvestor, notes: e.target.value})}
              rows="3"
              placeholder="Additional notes about this investor"
            />
          </div>
          <div className="alert alert-warning">
            <i className="fas fa-exclamation-triangle me-2"></i>
            Note: Investment amount and dates cannot be changed.
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-primary"
              onClick={handleUpdateInvestor}
            >
              Update Investor
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowEditInvestorModal(false)
                setEditingInvestor(null)
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Activate/Deactivate Confirmation Modal */}
      {showActivateDeactivateModal && investorToToggle && (
        <ConfirmationDialog
          isOpen={showActivateDeactivateModal}
          onClose={() => {
            setShowActivateDeactivateModal(false)
            setInvestorToToggle(null)
          }}
          onConfirm={confirmToggleAccountStatus}
          title={`${investorToToggle.account_status === 'active' ? 'Deactivate' : 'Activate'} Investor Account`}
          message={`Are you sure you want to ${investorToToggle.account_status === 'active' ? 'deactivate' : 'activate'} ${investorToToggle.name}'s account? ${investorToToggle.account_status === 'active' ? 'This will prevent them from logging in.' : 'They will be able to log in again.'}`}
          confirmText={investorToToggle.account_status === 'active' ? 'Deactivate' : 'Activate'}
          cancelText="Cancel"
          confirmColor={investorToToggle.account_status === 'active' ? 'danger' : 'success'}
        />
      )}

      {/* Delete Investor Confirmation Modal */}
      {showDeleteInvestorModal && investorToDelete && (
        <ConfirmationDialog
          isOpen={showDeleteInvestorModal}
          onClose={() => {
            setShowDeleteInvestorModal(false)
            setInvestorToDelete(null)
          }}
          onConfirm={confirmDeleteInvestor}
          title="Delete Investor"
          message={`Are you sure you want to delete ${investorToDelete.name}'s account? This action will permanently remove all investor data including returns history and cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmColor="danger"
        />
      )}

      {/* Loan Approval Modal */}
      {showApprovalModal && applicationToApprove && (
        <LoanApprovalModal
          isOpen={showApprovalModal}
          onClose={() => {
            setShowApprovalModal(false)
            setApplicationToApprove(null)
          }}
          onApprove={(loanId, fundingData) => handleApplicationAction(loanId, 'approve', fundingData)}
          application={applicationToApprove}
          investors={investors}
          loading={approvingLoan}
        />
      )}

      {showProcessReturnModal && selectedInvestorForReturn && (
        <Modal
          isOpen={showProcessReturnModal}
          onClose={() => {
            setShowProcessReturnModal(false);
            setSelectedInvestorForReturn(null);
            setReturnAmount("");
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
          }}
          title={isTopupAdjustmentMode ? "Top Up/Adjust Investment" : "Process Investor Return"}
          size="md"
        >
          <div className="mb-3">
            <label className="form-label">Investor Name</label>
            <input
              type="text"
              className="form-control"
              value={selectedInvestorForReturn.name}
              readOnly
            />
          </div>
        
          <div className="mb-3">
            <label className="form-label">Total Investment</label>
            <input
              type="text"
              className="form-control"
              value={formatCurrency(selectedInvestorForReturn.investment_amount)}
              readOnly
            />
          </div>
        
          <div className="mb-3">
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="processMode"
                checked={!isTopupAdjustmentMode}
                onChange={() => setIsTopupAdjustmentMode(false)}
              />
              <label className="form-check-label">Process Return</label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="processMode"
                checked={isTopupAdjustmentMode}
                onChange={() => setIsTopupAdjustmentMode(true)}
              />
              <label className="form-check-label">Top Up / Adjust</label>
            </div>
          </div>
        
          {/* ================= PROCESS RETURN ================= */}
          {!isTopupAdjustmentMode && (
            <>
              <div className="mb-3">
                <label className="form-label">Return Amount (40% of investment)</label>
                <input
                  type="text"
                  className="form-control"
                  value={formatCurrency(returnAmount)}
                  readOnly
                />
                <small className="text-muted">Fixed 40% return based on investment amount</small>
              </div>

              {/* Date Validation Warning */}
              {(() => {
                const currentDate = new Date();
                const nextReturnDate = new Date(selectedInvestorForReturn.next_return_date);
                const canProcessNormally = currentDate >= nextReturnDate;

                if (!canProcessNormally) {
                  return (
                    <div className="alert alert-warning">
                      <i className="fas fa-exclamation-triangle me-2"></i>
                      Next return date is {formatDate(selectedInvestorForReturn.next_return_date)}.
                      To process early return, check "Early Withdrawal" below.
                    </div>
                  );
                }
                return null;
              })()}

              <div className="mb-3">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={isEarlyWithdrawal}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setIsEarlyWithdrawal(isChecked);

                      // Calculate amounts
                      const expectedAmount = selectedInvestorForReturn.investment_amount * 0.40;
                      if (isChecked) {
                        // Apply 15% fee for early withdrawal (investor gets 85%)
                        const earlyAmount = expectedAmount * 0.85;
                        const feeAmount = expectedAmount * 0.15;
                        setReturnAmount(earlyAmount.toFixed(2));
                        showToast.info(
                          `Early withdrawal: 15% fee (${formatCurrency(feeAmount)}) applied. Investor receives ${formatCurrency(earlyAmount)}`,
                          5000
                        );
                      } else {
                        // Full 40% amount
                        setReturnAmount(expectedAmount.toFixed(2));
                      }
                    }}
                    id="earlyWithdrawalCheck"
                  />
                  <label className="form-check-label" htmlFor="earlyWithdrawalCheck">
                    Early Withdrawal (15% fee applies - investor receives 85%)
                  </label>
                </div>
              </div>
                  
              <div className="mb-3">
                <label className="form-label">Payment Method *</label>
                <select
                  className="form-control"
                  value={returnMethod}
                  onChange={(e) => setReturnMethod(e.target.value)}
                  required
                >
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
                  
              {returnMethod === 'mpesa' && (
                <div className="mb-3">
                  <label className="form-label">M-Pesa Reference *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={returnReference}
                    onChange={(e) => setReturnReference(e.target.value)}
                    required
                    placeholder="Enter M-Pesa reference"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              )}

              <div className="mb-3">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows="3"
                  placeholder="Additional notes about this return"
                />
              </div>
            </>
          )}

          {/* ================= TOP UP / ADJUST ================= */}
          {isTopupAdjustmentMode && (
            <>
              <div className="mb-3">
                <div className="form-check form-check-inline">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="adjustmentType"
                    checked={adjustmentType === "topup"}
                    onChange={() => setAdjustmentType("topup")}
                  />
                  <label className="form-check-label">Top Up</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="adjustmentType"
                    checked={adjustmentType === "adjust"}
                    onChange={() => setAdjustmentType("adjust")}
                  />
                  <label className="form-check-label">Adjust</label>
                </div>
              </div>

              {adjustmentType === "topup" ? (
                <div className="mb-3">
                  <label className="form-label">Top-up Amount (KES) *</label>
                  <input
                    type="number"
                    className="form-control"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    min="1"
                    required
                    placeholder="Enter amount to add"
                  />
                </div>
              ) : (
                <div className="mb-3">
                  <label className="form-label">New Investment Amount (KES) *</label>
                  <input
                    type="number"
                    className="form-control"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    min="1"
                    required
                    placeholder="Enter new total investment amount"
                  />
                </div>
              )}

              {adjustmentType === "topup" && (
                <>
                  <div className="mb-3">
                    <label className="form-label">Payment Method *</label>
                    <select
                      className="form-control"
                      value={investorTopupMethod}
                      onChange={(e) => setInvestorTopupMethod(e.target.value)}
                      required
                    >
                      <option value="cash">Cash</option>
                      <option value="mpesa">M-Pesa</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                  </div>

                  {investorTopupMethod === 'mpesa' && (
                    <div className="mb-3">
                      <label className="form-label">M-Pesa Reference *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={investorTopupReference}
                        onChange={(e) => setInvestorTopupReference(e.target.value)}
                        required
                        placeholder="Enter M-Pesa reference"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="mb-3">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  value={investorTopupNotes}
                  onChange={(e) => setInvestorTopupNotes(e.target.value)}
                  rows="3"
                  placeholder="Additional notes"
                />
              </div>
            </>
          )}

          <div className="alert alert-info">
            <i className="fas fa-info-circle me-2"></i>
            {!isTopupAdjustmentMode 
              ? "Return amount is fixed at 40% of investment. Early withdrawals incur 15% fee."
              : adjustmentType === "topup"
                ? "Top-up will increase the investor's investment amount and affect future returns."
                : "Adjustment will change the investor's total investment amount."}
          </div>
            
          <div className="d-flex gap-2">
            <button
              className="btn btn-primary"
              onClick={handleProcessAction}
            >
              {isTopupAdjustmentMode
                ? adjustmentType === "topup"
                  ? "Process Top Up"
                  : "Adjust Investment"
                : "Process Return"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowProcessReturnModal(false)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Investor Section Password Modal - UPDATED */}
{showInvestorLoginModal && (
  <div 
    className="modal fade show d-block investor-login-modal" 
    tabIndex="-1" 
    style={{ 
      backgroundColor: 'rgba(0,0,0,0.5)', 
      zIndex: 1050,
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%'
    }}
  >
    <div className="modal-dialog modal-dialog-centered">
      <div className="modal-content">
        <div className="modal-header bg-primary text-white">
          <h5 className="modal-title">Investor Section Access</h5>
          <button 
            type="button" 
            className="btn-close btn-close-white" 
            onClick={() => {
              setShowInvestorLoginModal(false);
              setInvestorPassword("");
              // Reset to overview if password entry is cancelled
              setActiveSection("overview");
              navigate("/admin");
            }}
          ></button>
        </div>
          
        <div className="modal-body">
          <div className="text-center mb-4">
            <i className="fas fa-lock fa-3x text-primary mb-3"></i>
            <h5>Additional Security Required</h5>
            <p className="text-muted">
              Enter password to access investor section
            </p>
          </div>
          
          <form onSubmit={handleInvestorPasswordSubmit}>
            <div className="mb-4">
              <label htmlFor="investorPassword" className="form-label">
                <strong>Password</strong>
              </label>
              <input
                type="password"
                className="form-control"
                id="investorPassword"
                value={investorPassword}
                onChange={(e) => {
                  setInvestorPassword(e.target.value);
                }}
                placeholder="Enter password"
                required
                autoFocus
                style={{
                  height: "50px",
                  padding: "1rem",
                  borderRadius: "8px",
                  border: "1px solid #dee2e6"
                }}
              />
              <small className="text-muted d-block mt-2">
                Enter the investor section password
              </small>
            </div>
              
            <div className="d-flex flex-column flex-sm-row gap-2">
              <button 
                type="submit" 
                className="btn btn-primary flex-grow-1"
                style={{
                  height: "50px",
                  fontSize: "1.1rem",
                  fontWeight: "600"
                }}
              >
                <i className="fas fa-unlock me-2"></i>
                Unlock Investor Section
              </button>
              
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowInvestorLoginModal(false);
                  setInvestorPassword("");
                  setActiveSection("overview");
                  navigate("/admin");
                }}
                style={{
                  height: "50px",
                  fontSize: "1rem"
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
)}
    </div>  
  )
}

export default AdminPanel