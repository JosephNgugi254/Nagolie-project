// App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { CallProvider } from "./context/CallContext";
import CallUI from "./components/call/CallUI";
import Toast from "./components/common/Toast";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import InvestorPanel from "./pages/InvestorPanel";
import AdminLoginPage from './features/auth/AdminLoginPage';
import InvestorRegistration from './features/auth/InvestorRegistration';
import About from "./pages/About";
import CompanyGallery from "./pages/CompanyGallery";
import RecoveryModule from './pages/RecoveryModule';
import ForgotPasswordPage from "./features/auth/ForgotPasswordPage";
import ResetPasswordPage from "./features/auth/ResetPasswordPage";
import StaffProfile from './pages/StaffProfile';
import "./index.css";

function AuthenticatedCallUI() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated() ? <CallUI /> : null;
}

function AppRoutes() {
  return (
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
        <Route path="/company-gallery" element={<CompanyGallery />} />
        <Route path="/recovery" element={<RecoveryModule />} />
        <Route path="/staff/:staffNumber" element={<StaffProfile />} />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <HelmetProvider>
      <AuthProvider>
        <SocketProvider>
          <CallProvider>
            <Toast />
            <AuthenticatedCallUI />
            <AppRoutes />
          </CallProvider>
        </SocketProvider>
      </AuthProvider>
    </HelmetProvider>
  );
}

export default App;