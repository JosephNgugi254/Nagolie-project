"use client"

import { useState, useEffect, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { adminAPI, paymentAPI } from "../services/api"
import AdminSidebar from "../components/admin/AdminSidebar"
import AdminCard from "../components/admin/AdminCard"
import AdminTable from "../components/admin/AdminTable"
import Modal from "../components/common/Modal"

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
  const [apiErrors, setApiErrors] = useState({})

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
            setApiErrors({ general: "Failed to load data from server" })
          }
        } else {
          console.error("API connection failed, data not loaded")
          setApiErrors({ general: "Unable to connect to server. Please check if the backend is running." })
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
        setApiErrors(prev => ({ ...prev, dashboard: null }))
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
      setApiErrors(prev => ({ ...prev, dashboard: "Failed to load dashboard data: " + (error.response?.data?.error || error.message) }))
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
      setApiErrors(prev => ({ ...prev, livestock: null }))
    } catch (error) {
      console.error("Failed to fetch livestock:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setLivestock([])
      setApiErrors(prev => ({ ...prev, livestock: "Failed to load livestock data: " + (error.response?.data?.error || error.message) }))
    }
  }, [navigate])

  const fetchApplications = useCallback(async () => {
    try {
      console.log("Fetching applications...")
      const response = await adminAPI.getApplications()
      console.log("Applications response:", response.data)
      setApplications(response.data || [])
      setApiErrors(prev => ({ ...prev, applications: null }))
    } catch (error) {
      console.error("Failed to fetch applications:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setApplications([])
      setApiErrors(prev => ({ ...prev, applications: "Failed to load applications: " + (error.response?.data?.error || error.message) }))
    }
  }, [navigate])

  const fetchClients = useCallback(async () => {
    try {
      console.log("Fetching clients...")
      const response = await adminAPI.getClients()
      console.log("Clients response:", response.data)
      setClients(response.data || [])
      setApiErrors(prev => ({ ...prev, clients: null }))
    } catch (error) {
      console.error("Failed to fetch clients:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setClients([])
      setApiErrors(prev => ({ ...prev, clients: "Failed to load clients: " + (error.response?.data?.error || error.message) }))
    }
  }, [navigate])

  const fetchTransactions = useCallback(async () => {
    try {
      console.log("Fetching transactions...")
      const response = await adminAPI.getTransactions()
      console.log("Transactions response:", response.data)
      setTransactions(response.data || [])
      setApiErrors(prev => ({ ...prev, transactions: null }))
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
      if (error.response?.status === 401) {
        navigate("/admin/login")
        return
      }
      setTransactions([])
      setApiErrors(prev => ({ ...prev, transactions: "Failed to load transactions: " + (error.response?.data?.error || error.message) }))
    }
  }, [navigate])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
    }).format(Number(amount) || 0)
  }

  const formatDate = (date) => {
    if (!date) return 'N/A'
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(date))
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
        navigate("/")
      }
    } catch (error) {
      console.error("Logout error:", error)
      navigate("/")
    }
  }, [logout, navigate])

  const handleApplicationAction = async (applicationId, action) => {
    try {
      if (action === "approve") {
        await adminAPI.approveApplication(applicationId)
        alert("Loan application approved successfully!")
      } else if (action === "reject") {
        await adminAPI.rejectApplication(applicationId)
        alert("Loan application rejected.")
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
      alert(`Failed to ${action} application: ${error.response?.data?.error || error.message}`)
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
        alert("Error: No active loan found for this client")
        return
      }
      
      const response = await paymentAPI.processCashPayment({
        loan_id: selectedClient.loan_id,
        amount: parseFloat(paymentData.amount),
        notes: paymentData.notes || `Cash payment of KSh ${paymentData.amount}`
      })
      
      console.log("Payment response:", response.data)
      
      if (response.data.success) {
        alert(`Payment processed successfully!\nNew balance: ${formatCurrency(response.data.loan.balance)}`)
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
      alert(`Failed to process payment: ${errorMsg}`)
    }
  }

  const handleAddLivestock = async (livestockData) => {
    console.log("Adding livestock:", livestockData)
    setShowAddLivestockModal(false)
    fetchLivestock()
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

  return (
    <div>
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
            {/* API Error Banner */}
            {apiErrors.general && (
              <div className="alert alert-danger alert-dismissible fade show" role="alert">
                <i className="fas fa-exclamation-triangle me-2"></i>
                {apiErrors.general}
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setApiErrors(prev => ({ ...prev, general: null }))}
                ></button>
              </div>
            )}

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
                    {apiErrors.dashboard && (
                      <div className="alert alert-warning">
                        <i className="fas fa-exclamation-circle me-2"></i>
                        {apiErrors.dashboard}
                      </div>
                    )}
                    
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

                    <div className="row">
                      <div className="col-md-6">
                        <div className="card">
                          <div className="card-header">
                            <h5 className="mb-0">Due Today</h5>
                          </div>
                          <div className="card-body">
                            {dashboardData.due_today && dashboardData.due_today.length === 0 ? (
                              <p className="text-muted">No loans due today</p>
                            ) : (
                              <div id="dueToday">
                                {dashboardData.due_today && dashboardData.due_today.map((loan) => (
                                  <div key={loan.id} className="d-flex justify-content-between align-items-center mb-2 p-2 bg-light rounded">
                                    <div>
                                      <strong>{loan.client_name}</strong><br />
                                      <small className="text-muted">{formatCurrency(loan.balance)} remaining</small>
                                    </div>
                                    <button className="btn btn-sm btn-primary" onClick={() => openPaymentModal(loan)}>
                                      Process Payment
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="card">
                          <div className="card-header">
                            <h5 className="mb-0">Overdue Loans</h5>
                          </div>
                          <div className="card-body">
                            {dashboardData.overdue && dashboardData.overdue.length === 0 ? (
                              <p className="text-muted">No overdue loans</p>
                            ) : (
                              <div id="overdueLoans">
                                {dashboardData.overdue && dashboardData.overdue.map((loan) => (
                                  <div key={loan.id} className="d-flex justify-content-between align-items-center mb-2 p-2 bg-danger bg-opacity-10 rounded">
                                    <div>
                                      <strong>{loan.client_name}</strong><br />
                                      <small className="text-danger">{loan.days_overdue} days overdue</small>
                                    </div>
                                    <button className="btn btn-sm btn-danger">
                                      Take Action
                                    </button>
                                  </div>
                                ))}
                              </div>
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
                    <input type="text" className="form-control" placeholder="Search clients..." />
                    <select className="form-select">
                      <option value="">All Clients</option>
                      <option value="active">Active Loans</option>
                      <option value="due-today">Due Today</option>
                      <option value="overdue">Overdue</option>
                      <option value="completed">Completed</option>
                    </select>
                    <input type="date" className="form-control" placeholder="Due Date" />
                  </div>
                </div>

                {apiErrors.clients && (
                  <div className="alert alert-warning">
                    <i className="fas fa-exclamation-circle me-2"></i>
                    {apiErrors.clients}
                  </div>
                )}

                <div className="card">
                  <div className="card-body">
                    {clients.length === 0 ? (
                      <div className="text-center py-5">
                        <i className="fas fa-users fa-3x text-muted mb-3"></i>
                        <h5 className="text-muted">No Clients Found</h5>
                        <p className="text-muted">No active clients in the system yet.</p>
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
                                <button 
                                  className="btn btn-outline-primary" 
                                  onClick={() => openPaymentModal(row)}
                                  title="Process Payment"
                                >
                                  <i className="fas fa-money-bill-wave"></i>
                                </button>
                                <button className="btn btn-outline-info" title="Download Receipt">
                                  <i className="fas fa-download"></i>
                                </button>
                                <button className="btn btn-outline-success" title="Send SMS">
                                  <i className="fas fa-mobile-alt"></i>
                                </button>
                              </div>
                            ),
                          },
                        ]}
                        data={clients}
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
                    <input type="date" className="form-control" />
                    <input type="text" className="form-control" placeholder="Search transactions..." />
                  </div>
                </div>

                {apiErrors.transactions && (
                  <div className="alert alert-warning">
                    <i className="fas fa-exclamation-circle me-2"></i>
                    {apiErrors.transactions}
                  </div>
                )}

                <div className="card">
                  <div className="card-body">
                    {transactions.length === 0 ? (
                      <div className="text-center py-5">
                        <i className="fas fa-exchange-alt fa-3x text-muted mb-3"></i>
                        <h5 className="text-muted">No Transactions</h5>
                        <p className="text-muted">Transactions will appear here when payments are processed.</p>
                      </div>
                    ) : (
                      <AdminTable
                        columns={[
                          { header: "Date", field: "date", render: (row) => formatDate(row.date) },
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
                              <button className="btn btn-sm btn-outline-info">
                                <i className="fas fa-download"></i>
                              </button>
                            ),
                          },
                        ]}
                        data={transactions}
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

                {apiErrors.livestock && (
                  <div className="alert alert-warning">
                    <i className="fas fa-exclamation-circle me-2"></i>
                    {apiErrors.livestock}
                  </div>
                )}

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
                      <div key={item.id} className="col-md-6 col-lg-4 gallery-item">
                        <div className="card gallery-card">
                          <img src={item.images?.[0] || "/placeholder.svg"} className="card-img-top" alt={item.title} style={{height: "200px", objectFit: "cover"}} />
                          <div className="card-body">
                            <h5 className="card-title">{item.title}</h5>
                            <p className="card-text">{item.description}</p>
                            <div className="d-flex justify-content-between align-items-center">
                              <span className="h6 text-primary">{formatCurrency(item.price)}</span>
                              <span className={`badge ${item.daysRemaining <= 1 ? 'bg-danger' : 'bg-warning'}`}>
                                {item.daysRemaining > 1 ? `Available in ${item.daysRemaining} days` : 
                                 item.daysRemaining === 1 ? 'Available in 1 day' : 'Available today'}
                              </span>
                            </div>
                            <div className="mt-2">
                              <button className="btn btn-sm btn-outline-primary me-2">
                                <i className="fas fa-edit"></i> Edit
                              </button>
                              <button className="btn btn-sm btn-outline-danger">
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

                {apiErrors.applications && (
                  <div className="alert alert-warning">
                    <i className="fas fa-exclamation-circle me-2"></i>
                    {apiErrors.applications}
                  </div>
                )}

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
                                  onClick={() => handleApplicationAction(row.id, "approve")}
                                  disabled={row.status !== 'pending'}
                                  title="Approve"
                                >
                                  <i className="fas fa-check"></i>
                                </button>
                                <button 
                                  className="btn btn-outline-danger" 
                                  onClick={() => handleApplicationAction(row.id, "reject")}
                                  disabled={row.status !== 'pending'}
                                  title="Reject"
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                                <button 
                                  className="btn btn-outline-info" 
                                  onClick={() => {
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
          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            handleAddLivestock({
              title: formData.get('title'),
              type: formData.get('type'),
              price: formData.get('price'),
              availableDate: formData.get('availableDate'),
              description: formData.get('description'),
              images: []
            })
          }}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockTitle" className="form-label">Title</label>
                <input type="text" className="form-control" id="livestockTitle" name="title" required />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockType" className="form-label">Type</label>
                <select className="form-control" id="livestockType" name="type" required>
                  <option value="cattle">Cattle</option>
                  <option value="goats">Goats</option>
                  <option value="sheep">Sheep</option>
                  <option value="poultry">Poultry</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="livestockPrice" className="form-label">Price (KSh)</label>
                <input type="number" className="form-control" id="livestockPrice" name="price" required />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="availableDate" className="form-label">Available Date</label>
                <input type="date" className="form-control" id="availableDate" name="availableDate" required />
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="livestockDescription" className="form-label">Description</label>
              <textarea className="form-control" id="livestockDescription" name="description" rows="3" required></textarea>
            </div>
            <div className="mb-3">
              <label htmlFor="livestockImages" className="form-label">Images</label>
              <input type="file" className="form-control" id="livestockImages" multiple accept="image/*" required />
            </div>
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary">
                Add to Gallery
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddLivestockModal(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Payment Modal */}
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
                max={selectedClient.balance || 0}
                step="0.01"
                placeholder="Enter amount"
                required 
              />
              <small className="text-muted">
                Maximum: {formatCurrency(selectedClient.balance || 0)}
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
    </div>
  )
}

export default AdminPanel