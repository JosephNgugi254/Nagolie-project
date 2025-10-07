"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"

function LoginForm({ onSuccess }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Add this useEffect to track re-renders
  useEffect(() => {
    console.log("LoginForm mounted or re-rendered")
    console.log("Current error state:", error)
    console.log("Current loading state:", loading)
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
    // Clear error when user starts typing
    if (error) {
      setError("")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    console.log("Form submitted with:", formData)
    
    // Basic validation
    if (!formData.username.trim() || !formData.password.trim()) {
      setError("Please enter both username and password")
      return
    }

    setError("")
    setLoading(true)

    try {
      console.log("Calling login function...")
      const result = await login(formData)
      console.log("Login result:", result)

      if (result.success) {
        console.log("Login successful, calling onSuccess")
        onSuccess()
      } else {
        console.log("Login failed with error:", result.error)
        setError(result.error || "Invalid username or password")
      }
    } catch (error) {
      console.error("Unexpected error in handleSubmit:", error)
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    navigate("/") // Navigate back to home page
  }

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">Admin Login</h5>
            <button 
              type="button" 
              className="btn-close btn-close-white" 
              onClick={handleClose}
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit} id="login-form">
              {/* Error message - will persist until successful login or user starts typing */}
              {error && (
                <div className="alert alert-danger d-flex align-items-center" role="alert">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  <div>{error}</div>
                </div>
              )}

              <div className="mb-3">
                <label htmlFor="username" className="form-label">Username</label>
                <input 
                  type="text" 
                  className="form-control" 
                  id="username"
                  name="username" 
                  value={formData.username} 
                  onChange={handleChange} 
                  required 
                  disabled={loading}
                  autoComplete="username"
                />
              </div>

              <div className="mb-3">
                <label htmlFor="password" className="form-label">Password</label>
                <input 
                  type="password" 
                  className="form-control" 
                  id="password"
                  name="password" 
                  value={formData.password} 
                  onChange={handleChange} 
                  required 
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary w-100" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginForm