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
import { generateTransactionReceipt, generateClientStatement } from "../components/admin/ReceiptPDF";

function AdminPanel() {
  const { isAuthenticated, logout, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeSection, setActiveSection] = useState("overview")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const [dashboardData, setDashboardData] = useState({
    total_clients: 0,
    total_lent: 0,
    total_received: 0,
    total_revenue: 0,
    due_today: [],
    overdue: []
  })

  const [showActionModal, setShowActionModal] = useState(false)

  // MPESA stk state variable 
  const [showMpesaModal, setShowMpesaModal] = useState(false)
  const [mpesaAmount, setMpesaAmount] = useState("")
  const [sendingStk, setSendingStk] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('');


  const openMpesaModal = (client) => {
    console.log("Opening M-Pesa modal for client:", client)
    setSelectedClient(client)
    setMpesaAmount("")
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

    if (paymentAmount > (selectedClient.balance || 0)) {
      showToast.error("Payment amount cannot exceed the current balance")
      return
    }

    setSendingStk(true)

    try {
      const formattedPhone = formatPhoneNumber(selectedClient.phone);
      console.log("Formatted phone:", formattedPhone);

      console.log("Sending STK push for:", {
        loan_id: selectedClient.loan_id,
        amount: paymentAmount,
        phone_number: formattedPhone
      })

      const response = await paymentAPI.processMpesaPayment({
        loan_id: selectedClient.loan_id,
        amount: paymentAmount,
        phone_number: formattedPhone
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

  // Enhanced payment status checker
  const checkPaymentStatus = async (checkoutRequestId, maxAttempts = 10) => {
    let attempts = 0;
    let isCompleted = false;

    // Show loading state
    setSendingStk(false); // STK sent, now we're checking status

    const pollStatus = async () => {
      if (isCompleted) return { completed: true, success: true };

      attempts++;
      console.log(`Checking payment status (attempt ${attempts})`);

      try {
        const statusResponse = await paymentAPI.checkMpesaStatus({
          checkout_request_id: checkoutRequestId
        });

        if (statusResponse.data.success) {
          const statusData = statusResponse.data.status;
          const resultCode = statusData?.ResultCode;

          console.log('Payment status result code:', resultCode);

          if (resultCode === '0') {
            // Payment successful
            showToast.success('Payment completed successfully!');
            isCompleted = true;

            // Refresh all relevant data
            await Promise.all([
              fetchDashboardData(),
              fetchClients(),
              fetchTransactions()
            ]);

            return { completed: true, success: true };
          } else if (['1032', '1', '17', '26', '1031'].includes(resultCode)) {
            // Payment cancelled, failed, or timed out
            const errorMsg = statusData?.ResultDesc || 'Payment was cancelled or failed';
            showToast.error(`Payment failed: ${errorMsg}`);
            isCompleted = true;
            return { completed: true, success: false };
          } else {
            // Still processing - show progress to admin
            if (attempts % 3 === 0) { // Show progress every 3 attempts
              showToast.info(`Still waiting for payment confirmation... (${attempts}/${maxAttempts})`, 3000);
            }
            return { completed: false, success: false };
          }
        } else {
          // API error but keep trying
          console.log('Status check API error, but continuing:', statusResponse.data.error);
          return { completed: false, success: false };
        }
      } catch (error) {
        console.error('Error checking status:', error);
        // Network errors are temporary, keep trying
        return { completed: false, success: false };
      }
    };

    // Wait 10 seconds before starting to check (give user time to enter PIN)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Poll every 5 seconds
    const pollInterval = setInterval(async () => {
      const result = await pollStatus();

      if (result.completed || attempts >= maxAttempts) {
        clearInterval(pollInterval);

        if (attempts >= maxAttempts && !result.completed) {
          showToast.info('Payment status check completed. If payment was made, it will be reflected shortly.');
        }

        // Close modal if payment completed or max attempts reached
        if (result.completed || attempts >= maxAttempts) {
          setShowMpesaModal(false);
          setSelectedClient(null);
          setMpesaAmount("");

          // Final refresh to ensure data is current
          setTimeout(() => {
            Promise.all([
              fetchDashboardData(),
              fetchClients(),
              fetchTransactions()
            ]);
          }, 1000);
        }
      }
    }, 5000);
  };

  

  const [livestock, setLivestock] = useState([])
  const [applications, setApplications] = useState([])
  const [clients, setClients] = useState([])
  const [transactions, setTransactions] = useState([])
  
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [showApplicationModal, setShowApplicationModal] = useState(false)
  const [showAddLivestockModal, setShowAddLivestockModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [loading, setLoading] = useState(true)

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
          filtered = filtered.filter(client => client.daysLeft === 0)
          break
        case "overdue":
          filtered = filtered.filter(client => client.daysLeft < 0)
          break
        case "completed":
          filtered = filtered.filter(client => client.balance <= 0)
          break
        case "active":
          filtered = filtered.filter(client => client.balance > 0)
          break
        default:
          // "all" - no additional filtering
          break
      }
    }

    // Date filter (expected return date) - FIXED
    if (clientDate) {
      filtered = filtered.filter(client => {
        if (!client.expectedReturnDate) return false
        const clientDateFormatted = new Date(client.expectedReturnDate).toISOString().split('T')[0]
        return clientDateFormatted === clientDate
      })
    }

    return filtered
  },   [clients, clientSearch, clientFilter, clientDate])

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

  // Get filtered data
  const filteredClients = filterClients()
  const filteredTransactions = filterTransactions()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/admin/login")
    }
  }, [isAuthenticated, authLoading, navigate])

  // Set active section based on URL
  useEffect(() => {
    const path = location.pathname
    if (path.includes("/admin/clients")) {
      setActiveSection("clients")
    } else if (path.includes("/admin/transactions")) {
      setActiveSection("transactions")
    } else if (path.includes("/admin/gallery")) {
      setActiveSection("gallery")
    } else if (path.includes("/admin/applications")) {
      setActiveSection("applications")
    } else {
      setActiveSection("overview")
    }
  }, [location.pathname])

  // Test API connection first
  const testApiConnection = async () => {
    try {
      console.log("Testing API connection...")
      const token = localStorage.getItem("token")
      console.log("Stored token:", token)
      
      // Test the test endpoint first
      const response = await fetch('http://localhost:5000/api/admin/test', {
        method: 'GET',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      console.log("Test endpoint response status:", response.status)
      if (response.ok) {
        const data = await response.json()
        console.log("Test endpoint response data:", data)
        return true
      } else {
        console.log("Test endpoint failed with status:", response.status)
        const errorText = await response.text()
        console.log("Test endpoint error:", errorText)
        return false
      }
    } catch (error) {
      console.error("API connection test failed:", error)
      return false
    }
  }

  useEffect(() => {
    const initializeData = async () => {
      if (isAuthenticated) {
        console.log("User is authenticated, initializing data...")
        const connectionOk = await testApiConnection()
        if (connectionOk) {
          console.log("API connection successful, fetching data...")
          try {
            await Promise.all([
              fetchDashboardData(),
              fetchLivestock(),
              fetchApplications(),
              fetchClients(),
              fetchTransactions()
            ])
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
    try {
      console.log("Fetching livestock...")
      const response = await adminAPI.getLivestock()
      console.log("Livestock response:", response.data)
      setLivestock(response.data || [])
    } catch (error) {
      console.error("Failed to fetch livestock:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setLivestock([])
      showToast.error("Failed to load livestock data: " + (error.response?.data?.error || error.message))
    }
  }, [navigate])

  const fetchApplications = useCallback(async () => {
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
    }
  }, [navigate])

  const fetchClients = useCallback(async () => {
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
    }
  }, [navigate])

  const fetchTransactions = useCallback(async () => {
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
    setActiveSection(section)
    if (section === "overview") {
      navigate("/admin")
    } else {
      navigate(`/admin/${section}`)
    }
    setSidebarOpen(false)
  }

  const handleLogout = useCallback(async () => {
    try {
      const result = await logout()
      if (result.success) {
        showToast.success("Logged out successfully")
        navigate("/")
      }
    } catch (error) {
      console.error("Logout error:", error)
      showToast.error("Logout failed")
      navigate("/")
    }
  }, [logout, navigate])

  const handleApplicationAction = async (applicationId, action) => {
    try {
      if (action === "approve") {
        await adminAPI.approveApplication(applicationId)
        showToast.success("Loan application approved successfully!")
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
    } catch (error) {
      console.error(`Failed to ${action} application:`, error)
      showToast.error(`Failed to ${action} application: ${error.response?.data?.error || error.message}`)
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

      if (paymentAmount > (selectedClient.balance || 0)) {
        showToast.error("Payment amount cannot exceed the current balance")
        return
      }
      
      const response = await paymentAPI.processCashPayment({
        loan_id: selectedClient.loan_id,
        amount: paymentAmount,
        notes: paymentData.notes || `Cash payment of KSh ${paymentAmount}`
      })
      
      console.log("Payment response:", response.data)
      
      if (response.data.success) {
        showToast.success(`Payment processed successfully!\nNew balance: ${formatCurrency(response.data.loan.balance)}`)
        setShowPaymentModal(false)
        setSelectedClient(null)
        
        // Refresh all data
        await Promise.all([
          fetchDashboardData(),
          fetchClients(),
          fetchTransactions()
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

  const handleSendReminder = async (client, message) => {
    try {
      console.log('Sending reminder to:', client.client_name || client.name);
      console.log('Message:', message);
      console.log('Phone:', client.phone);

      // Add "+" at the beginning of the phone number if not present
      let phoneWithPlus = client.phone;
      if (phoneWithPlus && !phoneWithPlus.startsWith('+')) {
        phoneWithPlus = '+' + phoneWithPlus;
      }

      const response = await fetch('http://localhost:5000/api/admin/send-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          client_id: client.id,
          phone: phoneWithPlus,
          message: message
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showToast.success('SMS reminder sent successfully!');
        handleCloseModal();
      } else {
        throw new Error(result.error || 'Failed to send SMS');
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      showToast.error(`SMS sending failed: ${error.message}`);
    }
  };

  const handleClaimOwnership = async (client) => {
    // Add this validation before processing the claim
    if (loan.status != 'overdue') {
      return jsonify({'error': 'Loan is not overdue and cannot be claimed'}), 400
    }
    try {
      console.log('Claiming ownership for:', client.client_name);

      const response = await adminAPI.claimOwnership({
        client_id: client.client_id || client.id,
        loan_id: client.loan_id || client.id
      });

      if (response.data.success) {
        // Use the toast message from the backend
        showToast.success(response.data.toast.message);
        handleCloseModal();
        // Refresh dashboard data to reflect changes
        fetchDashboardData();
        // Also refresh clients list if you have one
        fetchClients();
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

      const response = await fetch('http://localhost:5000/api/admin/livestock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          type: livestockData.type,
          count: parseInt(livestockData.count),
          price: parseFloat(livestockData.price),
          description: livestockData.description,
          images: livestockData.images || []
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      console.log('Livestock added successfully:', data);
      showToast.success('Livestock added successfully!');
      setShowAddLivestockModal(false);
      fetchLivestock(); // Refresh the list
      return data;

    } catch (error) {
      console.error('Error adding livestock:', error);
      showToast.error(`Failed to add livestock: ${error.message}`);
      throw error;
    }
  };

  const handleEditLivestock = (livestockItem) => {
    console.log('Editing livestock:', livestockItem)
    setEditingLivestock(livestockItem)
    setSelectedImages(livestockItem.images || [])
    setShowEditLivestockModal(true)
  }

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
        images: selectedImages
      }

      console.log('Updating livestock with data:', updatedData)

      const response = await fetch(`http://localhost:5000/api/admin/livestock/${editingLivestock.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updatedData)
      })

      if (response.ok) {
        const data = await response.json()
        showToast.success('Livestock updated successfully!')
        setShowEditLivestockModal(false)
        setEditingLivestock(null)
        setSelectedImages([])
        fetchLivestock()
      } else {
        const error = await response.json()
        showToast.error(`Failed to update livestock: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating livestock:', error)
      showToast.error('Failed to update livestock')
    }
  }

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

  const handleDeleteLivestock = async () => {
    if (!livestockToDelete) return

    try {
      const response = await fetch(`http://localhost:5000/api/admin/livestock/${livestockToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
    
      if (response.ok) {
        showToast.success('Livestock deleted successfully!');
        fetchLivestock();
      } else {
        const error = await response.json();
        showToast.error(`Failed to delete livestock: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting livestock:', error);
      showToast.error('Failed to delete livestock');
    } finally {
      setLivestockToDelete(null)
    }
  };  

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
                          title="Revenue"
                          value={formatCurrency(dashboardData.total_revenue)}
                          icon="fa-chart-line"
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
                            header: "Days Left", 
                            field: "daysLeft",
                            render: (row) => {
                              const days = row.daysLeft
                              let className = "days-counter "
                              if (days > 0) className += "positive"
                              else if (days === 0) className += "zero"
                              else className += "negative"

                              let text = ""
                              if (days > 0) text = `${days} days left`
                              else if (days === 0) text = "Due today"
                              else text = `${Math.abs(days)} days overdue`

                              return <span className={className}>{text}</span>
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
                            render: (row) => (
                              <span className={`badge ${row.type === "disbursement" ? "bg-primary" : "bg-success"}`}>
                                {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
                              </span>
                            )
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

            {/* Gallery Section */}
            {activeSection === "gallery" && (
              <div id="gallery-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Livestock Gallery Management</h2>
                  <button className="btn btn-primary" onClick={() => setShowAddLivestockModal(true)}>
                    <i className="fas fa-plus me-1"></i>Add Livestock
                  </button>
                </div>
            
                
            
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
                            {item.isAdminAdded && (
                              <small className="text-muted mb-2">
                                <i className="fas fa-user-tie me-1"></i>Admin Added
                              </small>
                            )}
                            {!item.isAdminAdded && (
                              <small className="text-muted mb-2">
                                <i className="fas fa-hand-holding-usd me-1"></i>Loan Collateral
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
              </div>
            )}

            {/* Applications Section */}
            {activeSection === "applications" && (
              <div id="applications-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Loan Applications</h2>
                </div>

                

                <div className="card">
                  <div className="card-body">
                    {applications.length === 0 ? (
                      <div className="text-center py-5">
                        <i className="fas fa-file-alt fa-3x text-muted mb-3"></i>
                        <h5 className="text-muted">No Loan Applications</h5>
                        <p className="text-muted">No pending loan applications at the moment.</p>
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
                        data={applications}
                      />
                    )}
                  </div>
                </div>
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
            </div>
            <div className="col-md-6">
              <strong>Photos:</strong>
              <div className="row mt-2">
                {selectedApplication.photos && selectedApplication.photos.length > 0 ? (
                  selectedApplication.photos.map((photo, index) => (
                    <div key={index} className="col-6 mb-2">
                      <img src={photo} alt={`Livestock photo ${index + 1}`} className="img-fluid rounded" />
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
                description: formData.get('description'),
                images: selectedImages
              });
              setSelectedImages([]) // Reset images after successful submission
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
                  step="0.01"
                  required 
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockDescription" className="form-label">Description</label>
                <input 
                  type="text" 
                  className="form-control" 
                  id="livestockDescription" 
                  name="description" 
                  placeholder="Brief description of the livestock"
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
              <button type="button" className="btn btn-secondary" onClick={() => {
                setShowAddLivestockModal(false)
                setSelectedImages([])
              }}>
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
            setShowEditLivestockModal(false)
            setEditingLivestock(null)
            setSelectedImages([])
          }}
          title="Edit Livestock"
          size="lg"
        >
          <form onSubmit={handleUpdateLivestock}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="editType" className="form-label">Livestock Type *</label>
                <select 
                  className="form-control" 
                  id="editType" 
                  name="editType" 
                  defaultValue={editingLivestock.type}
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
                  step="0.01"
                  defaultValue={editingLivestock.price}
                  required 
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="editDescription" className="form-label">Description</label>
                <input 
                  type="text" 
                  className="form-control" 
                  id="editDescription" 
                  name="editDescription" 
                  placeholder="Brief description of the livestock"
                  defaultValue={editingLivestock.description}
                />
              </div>
            </div>

            {/* Image Upload Section for Edit */}
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
              <small className="text-muted">Select new images to add to existing ones</small>

              {/* Current Images */}
              {selectedImages.length > 0 && (
                <div className="mt-3">
                  <label className="form-label">Current Images:</label>
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
            
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary">
                Update Livestock
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowEditLivestockModal(false)
                  setEditingLivestock(null)
                  setSelectedImages([])
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Payment Modal(CASH) */}
      {showPaymentModal && selectedClient && (
        <Modal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false)
            setSelectedClient(null)
          }}
          title="Process Payment"
          size="md"
        >
          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            handlePayment({
              amount: formData.get('amount'),
              method: formData.get('method'),
              notes: `Cash payment received for ${selectedClient.name}`
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
                step="0.01"
                placeholder="Enter amount"
                required 
              />
              <small className="text-muted">
                Maximum: {formatCurrency(Math.floor(selectedClient.balance || 0))} (whole numbers only for M-Pesa)
              </small>
            </div>
            
            <div className="mb-3">
              <label htmlFor="paymentMethod" className="form-label">
                Payment Method <span className="text-danger">*</span>
              </label>
              <select className="form-control" id="paymentMethod" name="method" required>
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa (Coming Soon)</option>
              </select>
            </div>
            
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              This payment will be recorded immediately and update the client's balance.
            </div>
            
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-success">
                <i className="fas fa-check me-2"></i>Process Payment
              </button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowPaymentModal(false)
                  setSelectedClient(null)
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
            step="1"
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
    </div>
  )
}

export default AdminPanel