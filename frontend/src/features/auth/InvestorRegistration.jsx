"use client"

import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { authAPI } from "../../services/api"
import Toast, { showToast } from "../../components/common/Toast"

function InvestorRegistration() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { setInvestorSession } = useAuth()

  const [formData, setFormData] = useState({
    temporary_password: "",
    username: "",
    password: "",
    confirmPassword: ""
  })

  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState(new URLSearchParams(window.location.search).get('token'))
  const [investorInfo, setInvestorInfo] = useState(null)
  const [loadingInvestor, setLoadingInvestor] = useState(true)

  // Fetch investor info on component mount
  useEffect(() => {
    const fetchInvestorInfo = async () => {
      try {
        console.log("Fetching investor info for ID:", id)
        const response = await authAPI.getInvestorInfo(id)
        console.log("Investor info response:", response.data)

        if (response.data.success) {
          setInvestorInfo(response.data.investor)
        } else {
          showToast.error(response.data.error || "Invalid registration link")
        }
      } catch (error) {
        console.error("Failed to fetch investor info:", error)
        showToast.error("Invalid registration link or investor not found")
        setTimeout(() => navigate('/'), 3000)
      } finally {
        setLoadingInvestor(false)
      }
    }

    if (id) {
      fetchInvestorInfo()
    }
  }, [id, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const response = await authAPI.completeInvestorRegistration(id, formData)      
      if (response.data.success) {
        // Use the new setInvestorSession function
        setInvestorSession({
          ...response.data.investor,
          token: response.data.token
        })
        showToast.success("Account created successfully! Redirecting...")
        navigate("/investor")
      }
    } catch (error) {
      console.error("Investor registration error:", error)
      showToast.error(error.response?.data?.error || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  if (loadingInvestor) {
    return (
      <div className="min-vh-100 d-flex align-items-center" style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      }}>
        <Toast />
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-md-6 col-lg-5">
              <div className="card shadow-lg border-0">
                <div className="card-body p-4 text-center">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-3">Loading registration details...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!investorInfo) {
    return (
      <div className="min-vh-100 d-flex align-items-center" style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      }}>
        <Toast />
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-md-6 col-lg-5">
              <div className="card shadow-lg border-0">
                <div className="card-body p-4 text-center">
                  <div className="alert alert-danger">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    Invalid registration link or investor not found.
                  </div>
                  <button 
                    className="btn btn-primary mt-3"
                    onClick={() => navigate('/')}
                  >
                    Return to Home
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-vh-100 d-flex align-items-center" style={{
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    }}>
      <Toast />
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-5">
            <div className="card shadow-lg border-0">
              <div className="card-header bg-primary text-white text-center py-4">
                <img src="/logo.png" alt="Nagolie" height="50" className="mb-3" />
                <h3 className="mb-0">Complete Investor Registration</h3>
                <p className="mb-0 mt-2">Create your investor account</p>
              </div>
              
              <div className="card-body p-4">
                <div className="alert alert-success mb-4">
                  <div className="d-flex align-items-center">
                    <i className="fas fa-user-check fa-2x me-3"></i>
                    <div>
                      <h6 className="mb-1">Welcome, {investorInfo.name}!</h6>
                      <p className="mb-1">Investment Amount: <strong>KES {parseFloat(investorInfo.investment_amount).toLocaleString()}</strong></p>
                      <p className="mb-0">Please complete your account setup below.</p>
                    </div>
                  </div>
                </div>
                
                <div className="alert alert-info mb-4">
                  <i className="fas fa-key me-2"></i>
                  <strong>Important:</strong> You need the temporary password provided by the admin to complete registration.
                </div>
                
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="temporary_password" className="form-label">Temporary Password *</label>
                    <input
                      type="password"
                      className="form-control"
                      id="temporary_password"
                      value={formData.temporary_password}
                      onChange={(e) => setFormData({...formData, temporary_password: e.target.value})}
                      required
                      minLength="8"
                      placeholder="Enter the temporary password from admin"
                      autoFocus
                    />
                    <small className="text-muted">Check your email/SMS from admin for the temporary password</small>
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="username" className="form-label">Username *</label>
                    <input
                      type="text"
                      className="form-control"
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({...formData, username: e.target.value})}
                      required
                      minLength="3"
                      placeholder="Choose a unique username"
                    />
                    <small className="text-muted">Choose a username you'll remember</small>
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="password" className="form-label">New Password *</label>
                    <input
                      type="password"
                      className="form-control"
                      id="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      required
                      minLength="8"
                      placeholder="Enter your new password"
                    />
                    <small className="text-muted">Minimum 8 characters</small>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="confirmPassword" className="form-label">Confirm New Password *</label>
                    <input
                      type="password"
                      className="form-control"
                      id="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                      required
                      placeholder="Confirm your new password"
                    />
                  </div>
                  
                  <div className="d-grid gap-2">
                    <button 
                      type="submit" 
                      className="btn btn-primary btn-lg"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Creating Account...
                        </>
                      ) : (
                        'Create Account'
                      )}
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary"
                      onClick={() => navigate('/login')}
                    >
                      Already have an account? Login
                    </button>
                  </div>
                </form>
              </div>
              
              <div className="card-footer text-center py-3">
                <small className="text-muted">
                  By creating an account, you agree to our Investment Agreement terms.
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InvestorRegistration