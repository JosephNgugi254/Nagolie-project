import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from "./context/AuthContext"
import Home from "./pages/Home"
import Dashboard from "./pages/Dashboard"
import AdminPanel from "./pages/AdminPanel"
import InvestorPanel from "./pages/InvestorPanel" // NEW
import AdminLoginPage from './features/auth/AdminLoginPage'
import InvestorRegistration from './features/auth/InvestorRegistration' // NEW
import About from "./pages/About"
import "./index.css"

import ForgotPasswordPage from "./features/auth/ForgotPasswordPage"
import ResetPasswordPage from "./features/auth/ResetPasswordPage"


function App() {
  return (
    <HelmetProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login" element={<AdminLoginPage />} /> 
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/investor/complete-registration/:id" element={<InvestorRegistration />} /> 
            <Route path="/admin/*" element={<AdminPanel />} />
            <Route path="/investor/*" element={<InvestorPanel />} /> 
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Routes>
        </Router>
      </AuthProvider>
    </HelmetProvider>
  )
}

export default App