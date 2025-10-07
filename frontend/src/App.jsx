import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import Home from "./pages/Home"
import Dashboard from "./pages/Dashboard"
import AdminPanel from "./pages/AdminPanel"
import AdminLoginPage from './features/auth/AdminLoginPage'
import About from "./pages/About"
import "./index.css"

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/*" element={<AdminPanel />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App