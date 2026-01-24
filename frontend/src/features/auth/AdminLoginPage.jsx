"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import Toast, { showToast } from "../../components/common/Toast"

function AdminLoginPage() {
  const { login, user, userRole, isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (authLoading) return;
    
    if (isAuthenticated()) {
      if (userRole === 'investor') {
        navigate("/investor")
      } else if (userRole === 'admin') {
        navigate("/admin")
      } else {
        // Default to admin if no role
        navigate("/admin")
      }
    }
  }, [isAuthenticated, userRole, authLoading, navigate])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
    if (error) {
      setError("")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log("Attempting login with:", formData)
      const result = await login(formData);
      console.log("Login result:", result)
      
      if (result.success) {
        showToast.success('Login successful!');
        
        // Use the redirect_to from the result
        const redirectPath = result.redirect_to || (result.user?.role === 'investor' ? '/investor' : '/admin');
        console.log("Redirecting to:", redirectPath)
        
        navigate(redirectPath);
      } else {
        showToast.error(result.error || 'Login failed');
        setError(result.error || 'Login failed');
      }
    } catch (error) {
      console.error("Login error:", error);
      showToast.error('An error occurred during login');
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    navigate("/") // Navigate back to home page
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
                {/* Close Button - Positioned in top right */}
                <button 
                  type="button" 
                  className="btn-close btn-close-white position-absolute top-0 end-0 m-3" 
                  onClick={handleClose}
                  aria-label="Close"
                  style={{
                    filter: "brightness(0) invert(1)",
                    opacity: 1,
                    fontSize: "1.2rem",
                    padding: "0.75rem"
                  }}
                ></button>
                
                <img src="/logo.png" alt="Nagolie" height="50" style={{borderRadius:5}} className="mb-3" />
                <h4 className="mb-0">Nagolie Enterprises</h4>
                <p className="mb-0 mt-2" style={{color:"#000000ff"}}>Enter your login credentials</p>
              </div>
              
              <div className="card-body p-4">                          
                <form onSubmit={handleSubmit} id="login-form">
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
                      placeholder="Enter your username"
                    />
                  </div>

                  <div className="mb-4">
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
                      placeholder="Enter your password"
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary w-100 btn-lg" 
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
                
                <div className="mt-4 text-center">
                  <p className="text-muted">
                    Having trouble? Contact support at 
                    <a href="mailto:nagolie7@gmail.com" className="ms-1">nagolie7@gmail.com</a>
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

export default AdminLoginPage