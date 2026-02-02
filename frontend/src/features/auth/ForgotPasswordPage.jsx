"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { authAPI } from "../../services/api"
import Toast, { showToast } from "../../components/common/Toast"
import emailjs from '@emailjs/browser'

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailExists, setEmailExists] = useState(true)

  // Initialize EmailJS only once
  useEffect(() => {
    emailjs.init("rV5WTS_rxhoSCMaGk")
  }, [])

  const sendPasswordResetEmail = async (email, resetLink, securityQuestion, investorName) => {
    try {
      // Use 'email' as the parameter name (not 'to_email')
      const templateParams = {
        email: email, // Use 'email' not 'to_email'
        reset_link: resetLink,
        security_question: securityQuestion,
        investor_name: investorName,
        from_name: 'Nagolie Enterprises',
        reply_to: 'nagolieenterprises@gmail.com'
      }

      console.log('Sending email via EmailJS with params:', templateParams)

      const response = await emailjs.send(
        'service_nagolieemailjs', // Your service ID
        'template_pass_reset',    // Your template ID
        templateParams
      )

      console.log('EmailJS response:', response)
      return response.status === 200
    } catch (error) {
      console.error('EmailJS error details:', error)
      // Remove the retry logic since we're using the correct parameter
      return false
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email.trim()) {
      showToast.error("Please enter your email address")
      return
    }

    setLoading(true)

    try {
      console.log('Requesting password reset for:', email)
      const response = await authAPI.forgotPassword({ email })
      console.log('Backend response:', response.data)
      
      if (response.data.success) {
        // Check if email exists in the system
        if (response.data.email_exists && response.data.reset_token) {
          // Send email from frontend using EmailJS
          const resetLink = `${window.location.origin}/reset-password?token=${response.data.reset_token}`
          const securityQuestion = `What is your current total investment amount?`
          const investorName = response.data.investor_name || 'Investor'
          
          console.log('Sending reset link:', resetLink)
          console.log('Investor name:', investorName)
          
          const emailSentSuccess = await sendPasswordResetEmail(
            email, 
            resetLink, 
            securityQuestion,
            investorName
          )
          
          if (emailSentSuccess) {
            showToast.success("Password reset instructions sent to your email!")
            setEmailSent(true)
            setEmailExists(true)
          } else {
            showToast.error("Failed to send email. Please try again or contact support.")
            setEmailExists(false)
          }
        } else {
          // Email doesn't exist in our system, but we show success for security
          showToast.success(response.data.message)
          setEmailSent(true)
          setEmailExists(false)
        }
      } else {
        showToast.error(response.data.error || "Failed to process request")
        setEmailExists(false)
      }
    } catch (error) {
      console.error("Forgot password error:", error)
      if (error.response?.status === 500) {
        // Server error - show generic message
        showToast.error("Temporarily unable to process your request. Please try again in a few minutes.")
      } else if (error.response) {
        showToast.error(error.response.data?.error || "An error occurred. Please try again.")
      } else if (error.request) {
        showToast.error("Network error. Please check your internet connection.")
      } else {
        showToast.error("An unexpected error occurred.")
      }
      setEmailExists(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-vh-100 d-flex align-items-center" style={{
      background: "grey"
    }}>
      <Toast />
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-4">
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
                <p className="mb-0 mt-2" style={{color:"#000000ff"}}>
                  {emailSent ? "Check your email" : "Enter your email to reset password"}
                </p>
              </div>
              
              <div className="card-body p-4">
                {emailSent ? (
                  <div className="text-center py-3">
                    <div className="mb-3">
                      <i className="fas fa-envelope fa-3x text-primary mb-3"></i>
                      <h5>Check Your Email</h5>
                      {emailExists ? (
                        <>
                          <p className="text-muted">
                            We've sent password reset instructions to <strong>{email}</strong>
                          </p>
                          <p className="text-muted small">
                            The email contains a secure link to reset your password and your security question.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-muted">
                            If <strong>{email}</strong> is registered, you will receive password reset instructions.
                          </p>
                          <p className="text-muted small">
                            Check your spam folder if you don't see the email.
                          </p>
                        </>
                      )}
                    </div>
                    
                    <div className="alert alert-info">
                      <i className="fas fa-info-circle me-2"></i>
                      <strong>Note:</strong>  link is valid for 24 hours.
                    </div>
                    
                    <div className="mt-4">
                      <button 
                        className="btn btn-outline-secondary me-2 mb-2"
                        onClick={() => {
                          setEmailSent(false)
                          setEmail("")
                          setEmailExists(true)
                        }}
                      >
                        <i className="fas fa-redo me-1"></i> Try Another Email
                      </button>
                      <button 
                        className="btn btn-primary"
                        onClick={() => navigate("/login")}
                      >
                        <i className="fas fa-sign-in-alt me-1"></i> Back to Login
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                      <div className="alert alert-info">
                        <i className="fas fa-info-circle me-2"></i>
                        Enter the email address associated with your investor account.
                      </div>
                    </div>

                    <div className="mb-4">
                      <label htmlFor="email" className="form-label">Email Address *</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        id="email"
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                        disabled={loading}
                        autoComplete="email"
                        placeholder="Enter your registered email"
                      />
                      <small className="text-muted">
                        You will receive a password reset link and your security question.
                      </small>
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-primary w-100 btn-lg" 
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Processing...
                        </>
                      ) : (
                        "Send Reset Instructions"
                      )}
                    </button>
                  </form>
                )}
                
                <div className="text-center">
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

export default ForgotPasswordPage