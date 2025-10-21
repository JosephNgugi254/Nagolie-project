import axios from "axios"

// Use environment variable for API URL, with proper fallbacks for production
const API_URL = import.meta.env.VITE_API_BASE_URL || 
                (window.location.hostname === 'localhost' 
                  ? "http://localhost:5000/api" 
                  : "https://nagolie-backend.onrender.com/api");

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
})

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token")
    console.log(`Making ${config.method?.toUpperCase()} request to: ${config.baseURL}${config.url}`)
    console.log('Auth token:', token ? 'Present' : 'Missing')
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    config.headers['Accept'] = 'application/json'
    
    return config
  },
  (error) => {
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

// Enhanced response interceptor with better error handling
api.interceptors.response.use(
  (response) => {
    console.log(`Response received from ${response.config.url}:`, response.status)
    return response
  },
  (error) => {
    console.error('API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    })
    
    if (error.response?.status === 401) {
      console.log('Authentication failed, redirecting to login')
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      window.location.href = "/admin/login"
    } else if (error.response?.status === 422) {
      console.log('Validation error - check request data')
    } else if (error.code === 'NETWORK_ERROR' || error.code === 'ERR_NETWORK') {
      console.log('Network error - check if backend is running')
    }
    
    return Promise.reject(error)
  }
)

// Your existing API exports remain the same...
export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  getCurrentUser: () => api.get("/auth/me"),
}

export const loanAPI = {
  apply: (applicationData) => api.post("/loans/apply", applicationData),
  getAll: () => api.get("/loans"),
  getById: (id) => api.get(`/loans/${id}`),
  create: (loanData) => api.post("/loans", loanData),
  updateStatus: (id, status) => api.patch(`/loans/${id}/status`, { status }),
  approve: (id) => api.post(`/loans/${id}/approve`),
  reject: (id) => api.post(`/loans/${id}/reject`),
}

export const adminAPI = {
  getDashboard: () => api.get("/admin/dashboard"),
  getApplications: () => api.get("/admin/applications"),
  getClients: () => api.get("/admin/clients"),
  getLivestock: () => api.get("/admin/livestock"),
  getLivestockGallery: () => api.get("/admin/livestock/gallery"), // ADDED
  getTransactions: () => api.get("/admin/transactions"),
  approveApplication: (id) => api.post(`/admin/applications/${id}/approve`),
  rejectApplication: (id) => api.post(`/admin/applications/${id}/reject`),
  sendReminder: (data) => api.post("/admin/send-reminder", data), // ADDED
  claimOwnership: (data) => api.post("/admin/claim-ownership", data),
  test: () => api.get("/admin/test"), // ADDED
  addLivestock: (data) => api.post("/admin/livestock", data), // ADDED
  updateLivestock: (id, data) => api.put(`/admin/livestock/${id}`, data), // ADDED
  deleteLivestock: (id) => api.delete(`/admin/livestock/${id}`), // ADDED
}

export const clientAPI = {
  getAll: () => api.get("/clients"),
  getById: (id) => api.get(`/clients/${id}`),
  create: (clientData) => api.post("/clients", clientData),
  update: (id, clientData) => api.put(`/clients/${id}`, clientData),
}

export const paymentAPI = {
  initiateStkPush: (paymentData) => api.post("/payments/stkpush", paymentData),
  getStatus: (id) => api.get(`/payments/${id}/status`),
  processCashPayment: (paymentData) => api.post("/payments/cash", paymentData),
  processMpesaPayment: (paymentData) => api.post('/payments/mpesa/stk-push', paymentData),
  checkMpesaStatus: (statusData) => api.post('/payments/mpesa/check-status', statusData),
}

export default api