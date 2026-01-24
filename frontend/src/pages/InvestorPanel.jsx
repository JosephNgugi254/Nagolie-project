"use client"

import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { investorAPI } from "../services/api"
import InvestorSidebar from "../components/investor/InvestorSidebar"
import InvestorStatsCard from "../components/investor/InvestorStatsCard"
import ImageCarousel from "../components/common/ImageCarousel"
import Modal from "../components/common/Modal"
import Toast, { showToast } from "../components/common/Toast"

function InvestorPanel() {
  const { user, userRole, isAuthenticated, loading: authLoading, logout, updateUserData } = useAuth()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState("overview")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const [dashboardData, setDashboardData] = useState({
    investor: null,
    stats: {
      investment_balance: 0,
      total_money_lent: 0,
      total_returns_received: 0,
      total_livestock_value: 0,
      next_return_date: null,
      next_return_amount: 0,
      total_money_invested_by_all: 0
    },
    livestock: [],
    returns_history: []
  })
  
  const [loading, setLoading] = useState(true)
  const [livestockLoading, setLivestockLoading] = useState(false)

  const [newUsername, setNewUsername] = useState('')
  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const handleUsernameChange = async (e) => {
    e.preventDefault()
    
    if (!newUsername.trim()) {
      showToast.error('Please enter a new username')
      return
    }

    if (!currentPasswordForUsername) {
      showToast.error('Please enter your current password')
      return
    }

    if (newUsername === user?.username) {
      showToast.error('New username must be different from current username')
      return
    }

    setUsernameLoading(true)

    try {
      const response = await investorAPI.updateUsername({
        new_username: newUsername,
        current_password: currentPasswordForUsername
      })

      if (response.data.success) {
        showToast.success('Username updated successfully!', 30000) // 10 seconds

        // Wait before updating state
        setTimeout(() => {
          const updatedUser = { ...user, username: response.data.new_username }
          updateUserData(updatedUser)

          setNewUsername('')
          setCurrentPasswordForUsername('')
        }, 3000)
      }
    } catch (error) {
      console.error('Username update error:', error)
      showToast.error(error.response?.data?.error || 'Failed to update username')
    } finally {
      setUsernameLoading(false)
    }
  }

  const handlePasswordChange = async (e) => { 
    e.preventDefault()
    
    if (!currentPassword) {
      showToast.error('Please enter current password')
      return
    }

    if (!newPassword) {
      showToast.error('Please enter new password')
      return
    }

    if (newPassword !== confirmPassword) {
      showToast.error('New passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      showToast.error('Password must be at least 6 characters long')
      return
    }

    // Check if new password is same as current
    try {
      const validationResponse = await investorAPI.validatePassword(currentPassword)
      if (validationResponse.data.is_valid && currentPassword === newPassword) {
        showToast.error('New password cannot be the same as current password')
        return
      }
    } catch (error) {
      console.warn('Could not validate password difference:', error)
      // Continue anyway - backend will catch this
    }

    setPasswordLoading(true)

    try {
      const response = await investorAPI.updatePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      })

      if (response.data.success) {
        showToast.success('Password updated successfully!')

        // Clear form fields
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')

        // Show logout message
        showToast.info('Please log in with your new password', 3000)

        // Logout after a delay to give user time to read messages
        setTimeout(async () => {
          try {
            await logout()
            navigate('/login')
          } catch (error) {
            console.error('Auto logout error:', error)
            showToast.error('Please manually log out and log back in')
          }
        }, 3000)
      }
    } catch (error) {
      console.error('Password update error:', error)
      showToast.error(error.response?.data?.error || 'Failed to update password')
    } finally {
      setPasswordLoading(false)
    }
  }

  const getPasswordStrength = (password) => {
    if (!password) return { percentage: 0, text: 'Enter a password', class: 'bg-danger' }
    
    let strength = 0
    let text = 'Weak'
    let className = 'bg-danger'
    
    if (password.length >= 6) strength += 25
    if (/[A-Z]/.test(password)) strength += 25
    if (/[0-9]/.test(password)) strength += 25
    if (/[^A-Za-z0-9]/.test(password)) strength += 25
    
    if (strength >= 75) {
      text = 'Strong'
      className = 'bg-success'
    } else if (strength >= 50) {
      text = 'Medium'
      className = 'bg-warning'
    }

    return { percentage: strength, text, class: className }
  }
  
  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharingLivestock, setSharingLivestock] = useState(null)
  const [shareMessage, setShareMessage] = useState('')
  
  // Inquiry modal state
  const [showInquiryModal, setShowInquiryModal] = useState(false)
  const [inquiringLivestock, setInquiringLivestock] = useState(null)
  const [inquiryMessage, setInquiryMessage] = useState('')

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated()) {
        navigate("/login")
      } else if (userRole === 'admin') {
        navigate("/admin")
      }
    }
  }, [isAuthenticated, userRole, authLoading, navigate])

  useEffect(() => {
    if (user && userRole === 'investor') {
      fetchDashboardData()
    }
  }, [user, userRole])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      console.log("Fetching investor dashboard data...")
      const response = await investorAPI.getDashboard()
      console.log("Investor dashboard response:", response.data)
      setDashboardData(response.data || {
        investor: null,
        stats: {
          investment_balance: 0,
          total_money_lent: 0,
          total_returns_received: 0,
          total_livestock_value: 0,
          next_return_date: null,
          next_return_amount: 0,
          total_money_invested_by_all: 0
        },
        livestock: [],
        returns_history: []
      })
    } catch (error) {
      console.error("Failed to fetch investor dashboard:", error)
      showToast.error("Failed to load dashboard data")
    } finally {
      setLoading(false)
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSectionChange = (section) => {
    // Clear form data when switching away from settings section
    if (activeSection === 'settings' && section !== 'settings') {
      setNewUsername('')
      setCurrentPasswordForUsername('')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
    setActiveSection(section)
    setSidebarOpen(false)
  }

  const handleLogout = async () => {
    try {
      const result = await logout('investor')
      if (result.success) {
        showToast.success("Logged out successfully!")
        navigate("/")
      }
    } catch (error) {
      console.error("Logout error:", error)
      showToast.error("Logout failed")
      navigate("/")
    }
  }

  const handleShareLivestock = (livestock) => {
    setSharingLivestock(livestock)
    setShareMessage('')
    setShowShareModal(true)
  }

  const handleInquireLivestock = (livestock) => {
    setInquiringLivestock(livestock)
    setInquiryMessage(`Hello, I'm interested in this ${livestock.type} (${livestock.count} head) priced at ${formatCurrency(livestock.price)}. Can I get more details?`)
    setShowInquiryModal(true)
  }

  const sendInquiry = async () => {
    try {
      const response = await investorAPI.inquireLivestock(inquiringLivestock.id, {
        message: inquiryMessage
      })
      
      if (response.data.success) {
        const { sms_message, ceo_phone } = response.data
        
        // Open SMS app with pre-filled message to CEO
        const smsUri = `sms:${ceo_phone}?body=${encodeURIComponent(sms_message)}`
        window.location.href = smsUri
        
        showToast.success("Inquiry prepared! Opening SMS app...")
        setShowInquiryModal(false)
      }
    } catch (error) {
      console.error("Error sending inquiry:", error)
      showToast.error("Failed to prepare inquiry")
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount) || 0)
  }

  const formatDate = (date) => {
    if (!date) return 'N/A'
    try {
      const dateObj = new Date(date)
      if (isNaN(dateObj.getTime())) return 'N/A'
      
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(dateObj)
    } catch (error) {
      return 'N/A'
    }
  }

  if (authLoading || loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (!user || userRole !== 'investor') {
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
            <span>Investor Dashboard</span>
          </a>

          <div className="navbar-nav ms-auto align-items-center flex-row">
            <span className="navbar-text me-3 d-none d-lg-block">
              Welcome, {dashboardData.investor?.name || user?.username || user?.email || 'Investor'}
            </span>
            
            <button className="sidebar-toggle d-lg-none ms-3" onClick={toggleSidebar}>
              <i className="fas fa-bars"></i>
            </button>
          </div>
        </div>
      </nav>

      <div className={`sidebar-backdrop ${sidebarOpen ? "show" : ""}`} onClick={toggleSidebar}></div>

      <div className="container-fluid">
        <div className="row">
          <div className={`col-md-3 col-lg-2 sidebar ${sidebarOpen ? "show" : ""}`}>
            <InvestorSidebar
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
              onLogout={handleLogout}
              isMobile={sidebarOpen}
            />
          </div>

          <div className="col-md-9 col-lg-10 main-content">
            
            {/* Overview Section */}
            {activeSection === "overview" && (
              <div id="overview-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Investment Overview</h2>
                  <div className="text-muted">
                    <i className="fas fa-calendar me-1"></i>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="row mb-4">
                  <div className="col-md-3 mb-3">
                    <InvestorStatsCard
                      title="Investment Balance"
                      value={formatCurrency(dashboardData.stats?.investment_balance || 0)}
                      icon="fa-wallet"
                      color="primary"
                      subtitle="Remaining in account"
                    />
                  </div>
                  <div className="col-md-3 mb-3">
                    <InvestorStatsCard
                      title="Money Lent Out"
                      value={formatCurrency(dashboardData.stats?.total_money_lent || 0)}
                      icon="fa-hand-holding-usd"
                      color="info"
                      subtitle="Loaned to clients"
                    />
                  </div>
                  <div className="col-md-3 mb-3">
                    <InvestorStatsCard
                      title="Total Returns"
                      value={formatCurrency(dashboardData.stats?.total_returns_received || 0)}
                      icon="fa-chart-line"
                      color="success"
                      subtitle="Returns received"
                    />
                  </div>
                  <div className="col-md-3 mb-3">
                    <InvestorStatsCard
                      title="Livestock Value"
                      value={formatCurrency(dashboardData.stats?.total_livestock_value || 0)}
                      icon="fa-cow"
                      color="warning"
                      subtitle="Collateral value"
                    />
                  </div>
                </div>

                {/* Next Return and Security Coverage */}
                <div className="row mb-4">
                  <div className="col-md-6 mb-3">
                    <div className="card shadow h-100">
                      <div className="card-header bg-info text-white">
                        <h6 className="m-0 font-weight-bold">
                          <i className="fas fa-calendar-check me-2"></i>
                          Next Return
                        </h6>
                      </div>
                      <div className="card-body">
                        {dashboardData.stats?.next_return_date ? (
                          <>
                            <div className="mb-3">
                              <strong>Next Return Date:</strong>
                              <div className="h5 text-primary">
                                {formatDate(dashboardData.stats.next_return_date)}
                              </div>
                            </div>
                            <div className="mb-3">
                              <strong>Expected Amount:</strong>
                              <div className="h4 text-success fw-bold">
                                {formatCurrency(dashboardData.stats.next_return_amount)}
                              </div>
                              <small className="text-muted">(40% of total money invested)</small>
                            </div>
                            <div className="alert alert-info">
                              <i className="fas fa-info-circle me-2"></i>
                              First return is after 5 weeks, then subsequent returns every 4 weeks.
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-4">
                            <i className="fas fa-calendar-times fa-2x text-muted mb-3"></i>
                            <h6 className="text-muted">No return scheduled</h6>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                      
                  <div className="col-md-6 mb-3">
                    <div className="card shadow h-100">
                      <div className="card-header bg-warning text-white">
                        <h6 className="m-0 font-weight-bold">
                          <i className="fas fa-shield-alt me-2"></i>
                          Security Coverage
                        </h6>
                      </div>
                      <div className="card-body">
                        <div className="mb-3">
                          <strong>My Investment:</strong>
                          <div className="h5 text-primary">
                            {formatCurrency(dashboardData.investor?.investment_amount || 0)}
                          </div>
                          <small className="text-muted">Total amount invested with us</small>
                        </div>

                        <div className="mb-3">
                          <strong>Money Lent Out from My Account:</strong>
                          <div className="h5 text-info">
                            {formatCurrency(dashboardData.stats?.total_money_lent || 0)}
                          </div>
                          <small className="text-muted">Amount currently lent to clients</small>
                        </div>

                        <div className="mb-3">
                          <strong>Livestock Collateral Value:</strong>
                          <div className="h5 text-success">
                            {formatCurrency(dashboardData.stats?.total_livestock_value || 0)}
                          </div>
                          <small className="text-muted">Value of livestock securing your loans</small>
                        </div>

                        {/* Coverage Ratio */}
                        {dashboardData.stats?.total_money_lent > 0 && (
                          <div className="mb-3">
                            <strong>Security Coverage Ratio:</strong>
                            <div className="h4 fw-bold" style={{
                              color: dashboardData.stats?.coverage_ratio >= 100 ? '#28a745' : 
                                     dashboardData.stats?.coverage_ratio >= 70 ? '#ffc107' : '#dc3545'
                            }}>
                              {dashboardData.stats?.coverage_ratio?.toFixed(1) || '0'}%
                            </div>
                            <div className="progress" style={{ height: '10px' }}>
                              <div 
                                className="progress-bar" 
                                role="progressbar" 
                                style={{ 
                                  width: `${Math.min(dashboardData.stats?.coverage_ratio || 0, 100)}%`,
                                  backgroundColor: dashboardData.stats?.coverage_ratio >= 100 ? '#28a745' : 
                                                  dashboardData.stats?.coverage_ratio >= 70 ? '#ffc107' : '#dc3545'
                                }}
                                aria-valuenow={dashboardData.stats?.coverage_ratio || 0}
                                aria-valuemin="0" 
                                aria-valuemax="100"
                              ></div>
                            </div>
                            <small className="text-muted">
                              Coverage = (Livestock Value + Investment Balance) / Investment Amount
                              <br />
                              Livestock: {formatCurrency(dashboardData.stats?.security_coverage_breakdown?.livestock_value || 0)}
                              <br />
                              Cash Balance: {formatCurrency(dashboardData.stats?.security_coverage_breakdown?.investment_balance || 0)}
                              <br />
                              Total Coverage: {formatCurrency(dashboardData.stats?.security_coverage_breakdown?.total_coverage || 0)}
                            </small>
                          </div>
                        )}

                        <div className="alert alert-success">
                          <i className="fas fa-check-circle me-2"></i>
                          Your investment is secured by livestock collateral. {dashboardData.stats?.coverage_ratio >= 100 ? 
                          'Your loans are fully covered by livestock value.' :
                          'We maintain livestock collateral to secure investor funds.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Returns */}
                {dashboardData.returns_history?.length > 0 && (
                  <div className="row">
                    <div className="col-12">
                      <div className="card shadow">
                        <div className="card-header bg-success text-white">
                          <h6 className="m-0 font-weight-bold">
                            <i className="fas fa-history me-2"></i>
                            Recent Returns
                          </h6>
                        </div>
                        <div className="card-body">
                          <div className="table-responsive">
                            <table className="table table-hover">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Amount</th>
                                  <th>Method</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dashboardData.returns_history.map((returnItem) => (
                                  <tr key={returnItem.id}>
                                    <td>{new Date(returnItem.return_date).toLocaleDateString()}</td>
                                    <td className="text-success fw-bold">
                                      {formatCurrency(returnItem.amount)}
                                    </td>
                                    <td>
                                      <span className="badge bg-info">
                                        {returnItem.payment_method?.toUpperCase()}
                                      </span>
                                    </td>
                                    <td>
                                      <span className="badge bg-success">
                                        {returnItem.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Livestock Gallery Section */}
            {activeSection === "gallery" && (
              <div id="gallery-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Livestock Collateral Gallery</h2>
                  <div className="text-muted">
                    <strong>Total Value: {formatCurrency(dashboardData.stats?.total_livestock_value || 0)}</strong>
                  </div>
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
                    {dashboardData.livestock.length === 0 ? (
                      <div className="card">
                        <div className="card-body text-center py-5">
                          <i className="fas fa-images fa-3x text-muted mb-3"></i>
                          <h5 className="text-muted">No Livestock in Your Portfolio</h5>
                          <p className="text-muted">Your livestock collateral will appear here once your funds are lent out.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="row">
                        {dashboardData.livestock.map((item) => (
                          <div key={item.id} className="col-md-6 col-lg-4 mb-4">
                            <div className="card gallery-card h-100">
                              {/* Image Carousel */}
                              <ImageCarousel 
                                images={item.images} 
                                title={item.title}
                                height="200px"
                              />

                              <div className="card-body d-flex flex-column">
                                <h5 className="card-title">{item.title}</h5>
                                <p className="card-text flex-grow-1">{item.description}</p>
                                
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                  <span className="h5 text-primary">{formatCurrency(item.price)}</span>
                                  <span className={`badge ${
                                    item.daysRemaining > 1 ? 'bg-warning' : 
                                    item.daysRemaining === 1 ? 'bg-info' : 
                                    'bg-success'
                                  }`}>
                                    {item.availableInfo}
                                  </span>
                                </div>
                                
                                <small className="text-muted mb-2">
                                  <i className="fas fa-map-marker-alt me-1"></i>
                                  {item.location}
                                </small>

                                <div className="mt-auto d-flex gap-2">
                                  <button 
                                    className="btn btn-sm btn-outline-info flex-fill"
                                    onClick={() => handleShareLivestock(item)}
                                  >
                                    <i className="fas fa-share-alt"></i> Share
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-outline-primary flex-fill"
                                    onClick={() => handleInquireLivestock(item)}
                                  >
                                    <i className="fas fa-question-circle"></i> Inquire
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

            {/* Returns History Section */}
            {activeSection === "returns" && (
              <div id="returns-section" className="content-section">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h2>Returns History</h2>
                  <div className="text-muted">
                    <strong>Total Received: {formatCurrency(dashboardData.stats?.total_returns_received || 0)}</strong>
                  </div>
                </div>
                
                <div className="card">
                  <div className="card-body">
                    {dashboardData.returns_history?.length === 0 ? (
                      <div className="text-center py-5">
                        <i className="fas fa-history fa-3x text-muted mb-3"></i>
                        <h5 className="text-muted">No Returns Yet</h5>
                        <p className="text-muted">
                          Your returns will appear here after they are processed.
                        </p>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-hover">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Amount</th>
                              <th>Payment Method</th>
                              <th>Receipt Number</th>
                              <th>Status</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardData.returns_history.map((returnItem) => (
                              <tr key={returnItem.id}>
                                <td>
                                  {new Date(returnItem.return_date).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </td>
                                <td className="text-success fw-bold">
                                  {formatCurrency(returnItem.amount)}
                                </td>
                                <td>
                                  <span className={`badge ${
                                    returnItem.payment_method === 'mpesa' ? 'bg-success' : 'bg-secondary'
                                  }`}>
                                    {returnItem.payment_method?.toUpperCase()}
                                  </span>
                                </td>
                                <td>
                                  {returnItem.mpesa_receipt || 'N/A'}
                                </td>
                                <td>
                                  <span className={`badge ${
                                    returnItem.status === 'completed' ? 'bg-success' : 'bg-warning'
                                  }`}>
                                    {returnItem.status}
                                  </span>
                                </td>
                                <td>
                                  {returnItem.notes || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* My Account section & Account Settings Section */}
            { (activeSection === "account" || activeSection === "settings") && dashboardData.investor && (
              <>
                {/* My Account - Main View   */}
                {activeSection === "account" && (
                  <div id="account-section" className="content-section">
                    <div className="d-flex justify-content-between align-items-center mb-4">
                      <h2>My Account</h2>
                      <div className="btn-group">
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => handleSectionChange('settings')}
                        >
                          <i className="fas fa-cog me-1"></i> Account Settings
                        </button>
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-md-6">
                        <div className="card mb-4">
                          <div className="card-header">
                            <h5 className="mb-0">Investment Details</h5>
                          </div>
                          <div className="card-body">
                            <table className="table table-borderless">
                              <tbody>
                                <tr>
                                  <th width="40%">Investor Name:</th>
                                  <td>{dashboardData.investor.name}</td>
                                </tr>
                                <tr>
                                  <th>Phone Number:</th>
                                  <td>{dashboardData.investor.phone}</td>
                                </tr>
                                <tr>
                                  <th>ID Number:</th>
                                  <td>{dashboardData.investor.id_number}</td>
                                </tr>
                                <tr>
                                  <th>Total Investment:</th>
                                  <td className="fw-bold text-primary">
                                    {formatCurrency(dashboardData.investor.investment_amount)}
                                  </td>
                                </tr>
                                <tr>
                                  <th>Money Lent Out:</th>
                                  <td className="fw-bold text-info">
                                    {formatCurrency(dashboardData.stats?.total_money_lent || 0)}
                                  </td>
                                </tr>
                                <tr>
                                  <th>Investment Balance:</th>
                                  <td className="fw-bold text-success">
                                    {formatCurrency(dashboardData.stats?.investment_balance || 0)}
                                  </td>
                                </tr>
                                <tr>
                                  <th>Livestock Collateral Value:</th>
                                  <td className="fw-bold text-warning">
                                    {formatCurrency(dashboardData.stats?.total_livestock_value || 0)}
                                  </td>
                                </tr>
                                {dashboardData.stats?.coverage_ratio > 0 && (
                                  <tr>
                                    <th>Security Coverage:</th>
                                    <td>
                                      <span className={`badge ${
                                        dashboardData.stats?.coverage_ratio >= 100 ? 'bg-success' :
                                        dashboardData.stats?.coverage_ratio >= 70 ? 'bg-warning' : 'bg-danger'
                                      }`}>
                                        {dashboardData.stats?.coverage_ratio?.toFixed(1) || '0'}%
                                      </span>
                                    </td>
                                  </tr>
                                )}
                                <tr>
                                  <th>Investment Date:</th>
                                  <td>
                                    {formatDate(dashboardData.investor.invested_date)}
                                  </td>
                                </tr>
                                <tr>
                                  <th>Account Status:</th>
                                  <td>
                                    <span className={`badge ${
                                      dashboardData.investor.account_status === 'active' ? 
                                      'bg-success' : 'bg-warning'
                                    }`}>
                                      {dashboardData.investor.account_status?.toUpperCase()}
                                    </span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                                  
                      <div className="col-md-6">
                        <div className="card">
                          <div className="card-header">
                            <h5 className="mb-0">Return Schedule</h5>
                          </div>
                          <div className="card-body">
                            <div className="alert alert-info">
                              <i className="fas fa-info-circle me-2"></i>
                              You receive 40% of the invested amount every 4 weeks. First return being after 5 weeks from investement date and then subsequent returns every 4 weeks.
                            </div>
                                  
                            <table className="table table-borderless">
                              <tbody>
                                <tr>
                                  <th width="40%">Next Return Date:</th>
                                  <td className="fw-bold">
                                    {dashboardData.stats?.next_return_date ? 
                                      formatDate(dashboardData.stats.next_return_date) : 
                                      'Not scheduled'}
                                  </td>
                                </tr>
                                <tr>
                                  <th>Expected Return:</th>
                                  <td className="fw-bold text-success">
                                    {formatCurrency(dashboardData.stats?.next_return_amount || 0)}
                                  </td>
                                </tr>
                                <tr>
                                  <th>Return Period:</th>
                                  <td>Every 4 weeks</td>
                                </tr>
                                <tr>
                                  <th>Total Returns Received:</th>
                                  <td className="fw-bold text-success">
                                    {formatCurrency(dashboardData.investor.total_returns_received)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Account Settings View     */}
                {activeSection === "settings" && (
                  <div id="settings-section" className="content-section">
                    <div className="d-flex justify-content-between align-items-center mb-4">
                      <h2>Account Settings</h2>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => handleSectionChange('account')}
                      >
                        <i className="fas fa-arrow-left me-1"></i> Back to Account
                      </button>
                    </div>

                    <div className="row">
                      <div className="col-md-6 mb-4">
                        <div className="card shadow">
                          <div className="card-header bg-primary text-white">
                            <h5 className="mb-0">
                              <i className="fas fa-user-edit me-2"></i>
                              Change Username
                            </h5>
                          </div>
                          <div className="card-body">
                            <form onSubmit={handleUsernameChange}>
                              <div className="mb-3">
                                <label className="form-label">Current Username</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={user?.username || ''}
                                  readOnly
                                  disabled
                                />
                              </div>

                              <div className="mb-3">
                                <label className="form-label">New Username</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="Enter new username"
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value)}
                                  required
                                  minLength="3"
                                  maxLength="20"
                                />
                                <div className="form-text">
                                  Username must be 3-20 characters and unique
                                </div>
                              </div>

                              <div className="mb-3">
                                <label className="form-label">Current Password</label>
                                <div className="input-group">
                                  <input
                                    type={showPassword ? "text" : "password"}
                                    className="form-control"
                                    placeholder="Enter current password to confirm"
                                    value={currentPasswordForUsername}
                                    onChange={(e) => setCurrentPasswordForUsername(e.target.value)}
                                    required
                                  />
                                  <button
                                    className="btn btn-outline-secondary"
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                  >
                                    <i className={`fas fa-${showPassword ? 'eye-slash' : 'eye'}`}></i>
                                  </button>
                                </div>
                              </div>

                              <div className="d-flex gap-2">
                                <button
                                  type="submit"
                                  className="btn btn-primary"
                                  disabled={usernameLoading}
                                >
                                  {usernameLoading ? (
                                    <>
                                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                                      Updating...
                                    </>
                                  ) : (
                                    <>
                                      <i className="fas fa-save me-2"></i>
                                      Update Username
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary"
                                  onClick={() => {
                                    setNewUsername('')
                                    setCurrentPasswordForUsername('')
                                  }}
                                >
                                  Clear
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                                
                      <div className="col-md-6 mb-4">
                        <div className="card shadow">
                          <div className="card-header bg-warning text-white">
                            <h5 className="mb-0">
                              <i className="fas fa-key me-2"></i>
                              Change Password
                            </h5>
                          </div>
                          <div className="card-body">
                            <form onSubmit={handlePasswordChange}>
                              <div className="mb-3">
                                <label className="form-label">Current Password</label>
                                <div className="input-group">
                                  <input
                                    type={showCurrentPassword ? "text" : "password"}
                                    className="form-control"
                                    placeholder="Enter current password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                  />
                                  <button
                                    className="btn btn-outline-secondary"
                                    type="button"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                  >
                                    <i className={`fas fa-${showCurrentPassword ? 'eye-slash' : 'eye'}`}></i>
                                  </button>
                                </div>
                              </div>
                                
                              <div className="mb-3">
                                <label className="form-label">New Password</label>
                                <div className="input-group">
                                  <input
                                    type={showNewPassword ? "text" : "password"}
                                    className="form-control"
                                    placeholder="Enter new password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength="6"
                                  />
                                  <button
                                    className="btn btn-outline-secondary"
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                  >
                                    <i className={`fas fa-${showNewPassword ? 'eye-slash' : 'eye'}`}></i>
                                  </button>
                                </div>
                                <div className="form-text">
                                  Password must be at least 6 characters long
                                </div>
                              </div>
                                
                              <div className="mb-3">
                                <label className="form-label">Confirm New Password</label>
                                <div className="input-group">
                                  <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    className="form-control"
                                    placeholder="Confirm new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength="6"
                                  />
                                  <button
                                    className="btn btn-outline-secondary"
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                  >
                                    <i className={`fas fa-${showConfirmPassword ? 'eye-slash' : 'eye'}`}></i>
                                  </button>
                                </div>
                              </div>
                                
                              {/* Password strength indicator */}
                              {newPassword && (
                                <div className="mb-3">
                                  <label className="form-label">Password Strength</label>
                                  <div className="progress" style={{ height: '8px' }}>
                                    <div
                                      className={`progress-bar ${getPasswordStrength(newPassword).class}`}
                                      role="progressbar"
                                      style={{ width: `${getPasswordStrength(newPassword).percentage}%` }}
                                    ></div>
                                  </div>
                                  <small className="text-muted">
                                    {getPasswordStrength(newPassword).text}
                                  </small>
                                </div>
                              )}

                              <div className="d-flex gap-2">
                                <button
                                  type="submit"
                                  className="btn btn-warning text-white"
                                  disabled={passwordLoading}
                                >
                                  {passwordLoading ? (
                                    <>
                                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                                      Updating...
                                    </>
                                  ) : (
                                    <>
                                      <i className="fas fa-key me-2"></i>
                                      Update Password
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary"
                                  onClick={() => {
                                    setCurrentPassword('')
                                    setNewPassword('')
                                    setConfirmPassword('')
                                  }}
                                >
                                  Clear
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                    </div>
                                
                    {/* Security Information */}
                    <div className="card mb-4">
                      <div className="card-header bg-light">
                        <h6 className="mb-0">
                          <i className="fas fa-shield-alt me-2"></i>
                          Account Security Tips
                        </h6>
                      </div>
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-6">
                            <ul className="list-unstyled">
                              <li className="mb-2">
                                <i className="fas fa-check text-success me-2"></i>
                                Use a strong, unique password
                              </li>
                              <li className="mb-2">
                                <i className="fas fa-check text-success me-2"></i>
                                Never share your password with anyone
                              </li>
                              <li className="mb-2">
                                <i className="fas fa-check text-success me-2"></i>
                                Change your password regularly
                              </li>
                            </ul>
                          </div>
                          <div className="col-md-6">
                            <ul className="list-unstyled">
                              <li className="mb-2">
                                <i className="fas fa-check text-success me-2"></i>
                                Log out after each session
                              </li>
                              <li className="mb-2">
                                <i className="fas fa-check text-success me-2"></i>
                                Use a secure internet connection
                              </li>
                              <li className="mb-2">
                                <i className="fas fa-check text-success me-2"></i>
                                Contact admin if you suspect unauthorized access
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>

      {/* Share Livestock Modal */}
      {showShareModal && sharingLivestock && (
        <Modal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setSharingLivestock(null)
            setShareMessage('')
          }}
          title="Share Livestock"
          size="md"
        >
          <div className="mb-3">
            <label className="form-label">Livestock</label>
            <input 
              type="text" 
              className="form-control" 
              value={sharingLivestock.title} 
              readOnly 
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Custom Message</label>
            <textarea 
              className="form-control" 
              rows="3"
              placeholder="Enter a custom message for sharing"
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              maxLength="200"
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Shareable Link</label>
            <div className="input-group">
              <input 
                type="text" 
                className="form-control" 
                value={`${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`}
                readOnly 
              />
              <button 
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`)
                  showToast.success('Link copied to clipboard!')
                }}
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>
              
          <div className="mb-4">
            <label className="form-label">Share via</label>
            <div className="d-flex flex-wrap gap-2">
              <button 
                className="btn btn-success flex-fill"
                onClick={() => {
                  const message = shareMessage || sharingLivestock.description
                  const encodedMessage = encodeURIComponent(`${message}\n\nView details: ${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`)
                  window.open(`https://wa.me/?text=${encodedMessage}`, '_blank')
                }}
              >
                <i className="fab fa-whatsapp me-2"></i> WhatsApp
              </button>
              
              <button 
                className="btn btn-info flex-fill"
                onClick={() => {
                  const message = shareMessage || sharingLivestock.description
                  const url = `${window.location.origin}/#gallery?livestock=${sharingLivestock.id}`
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(message)}`, '_blank')
                }}
              >
                <i className="fab fa-facebook me-2"></i> Facebook
              </button>
            </div>
          </div>
              
          <div className="d-flex gap-2">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => {
                setShowShareModal(false)
                setSharingLivestock(null)
                setShareMessage('')
              }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Inquiry Modal */}
      {showInquiryModal && inquiringLivestock && (
        <Modal
          isOpen={showInquiryModal}
          onClose={() => {
            setShowInquiryModal(false)
            setInquiringLivestock(null)
            setInquiryMessage('')
          }}
          title="Inquire About Livestock"
          size="md"
        >
          <div className="mb-3">
            <label className="form-label">Livestock</label>
            <input 
              type="text" 
              className="form-control" 
              value={inquiringLivestock.title} 
              readOnly 
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Price</label>
            <input 
              type="text" 
              className="form-control" 
              value={formatCurrency(inquiringLivestock.price)} 
              readOnly 
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Your Message to CEO</label>
            <textarea 
              className="form-control" 
              rows="4"
              value={inquiryMessage}
              onChange={(e) => setInquiryMessage(e.target.value)}
              placeholder="Type your inquiry message here..."
            />
          </div>

          <div className="alert alert-info">
            <i className="fas fa-info-circle me-2"></i>
            This will open your SMS app with a pre-filled message to the director Nagolie Enterprises LTD.
          </div>
              
          <div className="d-flex gap-2">
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={sendInquiry}
            >
              <i className="fas fa-paper-plane me-2"></i>Send Inquiry via SMS
            </button>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => {
                setShowInquiryModal(false)
                setInquiringLivestock(null)
                setInquiryMessage('')
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default InvestorPanel