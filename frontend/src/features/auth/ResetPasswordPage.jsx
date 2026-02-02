"use client"

import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { authAPI } from "../../services/api"
import Toast, { showToast } from "../../components/common/Toast"
import emailjs from '@emailjs/browser'  // Add this import

function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(true)
  const [token, setToken] = useState("")
  const [investorInfo, setInvestorInfo] = useState(null)
  
  const [securityAnswer, setSecurityAnswer] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Initialize EmailJS for this component too
  useEffect(() => {
    emailjs.init("rV5WTS_rxhoSCMaGk")
  }, [])

  useEffect(() => {
    const tokenParam = searchParams.get('token')
    if (!tokenParam) {
      showToast.error("Invalid reset link. No token found.")
      navigate("/forgot-password")
      return
    }
    
    setToken(tokenParam)
    validateToken(tokenParam)
  }, [searchParams, navigate])

  // Function to send password changed email from frontend
  const sendPasswordChangedEmail = async (email, investorName) => {
    try {
      const templateParams = {
        email: email, // Use 'email' parameter to match your template
        investor_name: investorName,
        from_name: 'Nagolie Enterprises',
        reply_to: 'nagolieenterprises@gmail.com'
      }

      console.log('Sending password changed email via EmailJS:', templateParams)

      const response = await emailjs.send(
        'service_nagolieemailjs',
        'template_pass_changed', // Your password changed template ID
        templateParams
      )

      console.log('Password changed email response:', response)
      return response.status === 200
    } catch (error) {
      console.error('EmailJS password changed error:', error)
      return false
    }
  }

  const validateToken = async (token) => {
    try {
      const response = await authAPI.validateResetToken({ token })
      
      if (response.data.valid) {
        setInvestorInfo(response.data)
        showToast.success("Token validated successfully")
      } else {
        showToast.error(response.data.error || "Invalid or expired token")
        navigate("/forgot-password")
      }
    } catch (error) {
      console.error("Token validation error:", error)
      showToast.error(error.response?.data?.error || "Invalid reset link")
      navigate("/forgot-password")
    } finally {
      setValidating(false)
      setLoading(false)
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!securityAnswer.trim()) {
      showToast.error("Please answer the security question")
      return
    }

    if (!newPassword) {
      showToast.error("Please enter new password")
      return
    }

    if (newPassword !== confirmPassword) {
      showToast.error("New passwords do not match")
      return
    }

    if (newPassword.length < 6) {
      showToast.error("Password must be at least 6 characters long")
      return
    }

    setSubmitting(true)

    try {
      const response = await authAPI.resetPassword({
        token,
        security_answer: securityAnswer,
        new_password: newPassword,
        confirm_password: confirmPassword
      })

      if (response.data.success) {
        // Send password changed email from frontend
        if (investorInfo && investorInfo.user_email) {
          const emailSent = await sendPasswordChangedEmail(
            investorInfo.user_email,
            investorInfo.investor_name
          )
          
          if (emailSent) {
            console.log('Password changed confirmation email sent successfully')
          } else {
            console.log('Failed to send password changed email, but password was reset')
          }
        }
        
        showToast.success("Password reset successful! You can now log in.")
        
        // Redirect to login after delay
        setTimeout(() => {
          navigate("/login")
        }, 3000)
      } else {
        showToast.error(response.data.error || "Failed to reset password")
      }
    } catch (error) {
      console.error("Reset password error:", error)
      showToast.error(error.response?.data?.error || "An error occurred. Please try again.")
    } finally {
      setSubmitting(false)
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

  if (loading || validating) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Validating reset link...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-vh-100 d-flex align-items-center" style={{
      background: "grey"
    }}>
      <Toast />
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6">
            <div className="card shadow-lg border-0 position-relative">
              <div className="card-header bg-primary text-white text-center py-4 position-relative">
                <button 
                  type="button" 
                  className="btn-close btn-close-white position-absolute top-0 end-0 m-3" 
                  onClick={() => navigate("/login")}
                  aria-label="Close"
                  style={{
                    filter: "brightness(0) invert(1)",
                    opacity: 1,
                    fontSize: "1.2rem",
                    padding: "0.75rem"
                  }}
                ></button>
                
                <img src="/logo.png" alt="Nagolie" height="50" style={{borderRadius:5}} className="mb-3" />
                <h4 className="mb-0">Reset Your Password</h4>
                <p className="mb-0 mt-2" style={{color:"#000000ff"}}>Set a new password for your account</p>
              </div>
              
              <div className="card-body p-4">
                {investorInfo && (
                  <div className="alert alert-success mb-4">
                    <div className="d-flex align-items-center">
                      <i className="fas fa-user-circle fa-2x me-3"></i>
                      <div>
                        <h6 className="mb-1">Welcome, {investorInfo.investor_name}</h6>
                        <small className="text-muted">Email: {investorInfo.user_email}</small>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {/* Security Question */}
                  <div className="mb-4">
                    <div className="card bg-light border">
                      <div className="card-body">
                        <h6 className="card-title">
                          <i className="fas fa-shield-alt text-primary me-2"></i>
                          Security Question
                        </h6>
                        <p className="card-text mb-3">
                          <strong>What is your current total investment amount?</strong>
                        </p>
                        <div className="alert alert-info">
                          <i className="fas fa-info-circle me-2"></i>
                          Answer: Enter the exact amount in KES (e.g., 100000.00)
                        </div>
                        <div className="input-group">
                          <span className="input-group-text">KES</span>
                          <input 
                            type="number" 
                            className="form-control" 
                            step="0.01"
                            min="0"
                            value={securityAnswer} 
                            onChange={(e) => setSecurityAnswer(e.target.value)} 
                            required 
                            disabled={submitting}
                            placeholder="Enter the exact amount"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="mb-4">
                    <label htmlFor="newPassword" className="form-label">New Password *</label>
                    <div className="input-group">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        className="form-control" 
                        id="newPassword"
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        required 
                        disabled={submitting}
                        minLength="6"
                        placeholder="Enter new password (min. 6 characters)"
                      />
                      <button 
                        className="btn btn-outline-secondary" 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <i className={`fas fa-${showPassword ? 'eye-slash' : 'eye'}`}></i>
                      </button>
                    </div>
                    
                    {/* Password strength indicator */}
                    {newPassword && (
                      <div className="mt-2">
                        <label className="form-label small">Password Strength</label>
                        <div className="progress" style={{ height: '6px' }}>
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
                  </div>

                  {/* Confirm Password */}
                  <div className="mb-4">
                    <label htmlFor="confirmPassword" className="form-label">Confirm New Password *</label>
                    <div className="input-group">
                      <input 
                        type={showConfirmPassword ? "text" : "password"} 
                        className="form-control" 
                        id="confirmPassword"
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        required 
                        disabled={submitting}
                        minLength="6"
                        placeholder="Confirm new password"
                      />
                      <button 
                        className="btn btn-outline-secondary" 
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        <i className={`fas fa-${showConfirmPassword ? 'eye-slash' : 'eye'}`}></i>
                      </button>
                    </div>
                    
                    {/* Password match indicator */}
                    {confirmPassword && (
                      <div className="mt-2">
                        {newPassword === confirmPassword ? (
                          <small className="text-success">
                            <i className="fas fa-check-circle me-1"></i>
                            Passwords match
                          </small>
                        ) : (
                          <small className="text-danger">
                            <i className="fas fa-times-circle me-1"></i>
                            Passwords don't match
                          </small>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Password Requirements */}
                  <div className="mb-4">
                    <div className="alert alert-info">
                      <h6 className="alert-heading">
                        <i className="fas fa-key me-2"></i>
                        Password Requirements
                      </h6>
                      <ul className="mb-0">
                        <li>Minimum 6 characters</li>
                        <li>Use uppercase and lowercase letters</li>
                        <li>Include numbers for better security</li>
                        <li>Special characters are optional but recommended</li>
                      </ul>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary w-100 btn-lg" 
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Resetting Password...
                      </>
                    ) : (
                      "Reset Password"
                    )}
                  </button>
                </form>
                
                <div className="mt-2 text-center">
                  <p className="text-muted">
                    Remember your password?{" "}
                    <button 
                      className="btn btn-link p-0" 
                      onClick={() => navigate("/login")}
                    >
                      Back to Login
                    </button>
                  </p>                  
                </div>
              </div>
              
              <div className="card-footer text-center py-3">
                <small className="text-muted">
                  &copy; {new Date().getFullYear()} Nagolie Enterprises. All rights reserved.
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage