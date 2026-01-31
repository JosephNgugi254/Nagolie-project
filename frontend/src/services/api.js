import axios from "axios"

// ==========================
// Base URL Configuration
// ==========================
const API_URL = import.meta.env.VITE_API_BASE_URL || 
  (window.location.hostname === 'localhost' 
    ? "http://localhost:5000/api" 
    : "https://nagolie-backend.onrender.com/api");

// ==========================
// Retry Configuration
// ==========================
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // in milliseconds

// ==========================
// Token Management
// ==========================
const getAuthToken = () => {
  // Check both tokens, let the backend determine validity
  const adminToken = localStorage.getItem("admin_token");
  const investorToken = localStorage.getItem("investor_token");
  
  console.log("Token check - Admin:", adminToken ? "Exists" : "Missing");
  console.log("Token check - Investor:", investorToken ? "Exists" : "Missing");
  
  // Return whichever token exists
  return adminToken || investorToken;
};

// ==========================
// Axios Instance
// ==========================
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// ==========================
// Request Interceptor
// ==========================
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    console.log(`Making ${config.method?.toUpperCase()} request to: ${config.baseURL}${config.url}`);
    console.log("Auth token:", token ? "Present" : "Missing");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    config.headers["Accept"] = "application/json";
    return config;
  },
  (error) => {
    console.error("Request error:", error);
    return Promise.reject(error);
  }
);

// ==========================
// Response Interceptor with Retry Logic
// ==========================
api.interceptors.response.use(
  (response) => {
    console.log(`Response received from ${response.config.url}:`, response.status);
    return response;
  },
  async (error) => {
    const config = error.config;

    // Retry on network or timeout errors
    if (
      !config.__retryCount &&
      (error.code === "ECONNABORTED" ||
        error.code === "ERR_NETWORK" ||
        !error.response)
    ) {
      config.__retryCount = config.__retryCount || 0;

      if (config.__retryCount < MAX_RETRIES) {
        config.__retryCount += 1;

        console.warn(
          `Retrying request (${config.__retryCount}/${MAX_RETRIES}) to ${config.url} after ${RETRY_DELAY * config.__retryCount}ms`
        );

        // Wait before retrying
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * config.__retryCount)
        );

        return api(config);
      }
    }

    // Log error details
    console.error("API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });

    if (error.response?.status === 401) {
      console.log("401 Unauthorized received for:", error.config?.url);

      // Don't redirect automatically, just clear the token that's not working
      const currentPath = window.location.pathname;

      if (currentPath.includes('/investor')) {
        // If in investor panel and got 401, clear investor token
        localStorage.removeItem("investor_token");
        localStorage.removeItem("investor_user");
        console.log("Cleared investor tokens due to 401");
      } else if (currentPath.includes('/admin')) {
        // If in admin panel and got 401, clear admin token
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_user");
        console.log("Cleared admin tokens due to 401");
      }

      // Return error - let component handle redirection
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

const getAuthHeader = () => {
  const token = getAuthToken();
  return { headers: { 'Authorization': `Bearer ${token}` } };
};

// ==========================
// API Endpoints
// ==========================
export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  getCurrentUser: () => api.get("/auth/me"),
  completeInvestorRegistration: (investorId, data) => api.post(`/auth/investor/register/${investorId}`, data),
  getInvestorInfo: (investorId) => api.get(`/auth/investor/info/${investorId}`),
};

export const loanAPI = {
  apply: (applicationData) => api.post("/loans/apply", applicationData),
  getAll: () => api.get("/loans"),
  getById: (id) => api.get(`/loans/${id}`),
  create: (loanData) => api.post("/loans", loanData),
  updateStatus: (id, status) => api.patch(`/loans/${id}/status`, { status }),
  approve: (id) => api.post(`/loans/${id}/approve`),
  reject: (id) => api.post(`/loans/${id}/reject`),
};

export const clientAPI = {
  getAll: () => api.get("/clients"),
  getById: (id) => api.get(`/clients/${id}`),
  create: (clientData) => api.post("/clients", clientData),
  update: (id, clientData) => api.put(`/clients/${id}`, clientData),
};

export const adminAPI = {
  getDashboard: () => api.get("/admin/dashboard"),
  getApplications: () => api.get("/admin/applications"),
  getClients: () => api.get("/admin/clients"),
  getLivestock: () => api.get("/admin/livestock"),
  getLivestockGallery: () => api.get("/admin/livestock/gallery"),
  getTransactions: () => api.get("/admin/transactions"),
  getApprovedLoans: () => api.get("/admin/approved-loans"),
  getPaymentStats: () => api.get("/admin/payment-stats"),
  approveApplication: (id, fundingData = {}) => {
    const data = {
      funding_source: fundingData.funding_source || 'company',
      investor_id: fundingData.investor_id || null
    }
    return api.post(`/admin/applications/${id}/approve`, data)
  },
  rejectApplication: (id) => api.post(`/admin/applications/${id}/reject`),
  sendReminder: (data) => api.post("/admin/send-reminder", data),
  claimOwnership: (data) => api.post("/admin/claim-ownership", data),
  test: () => api.get("/admin/test"),
  addLivestock: (data) => api.post("/admin/livestock", data),
  updateLivestock: (id, data) => api.put(`/admin/livestock/${id}`, data),
  deleteLivestock: (id) => api.delete(`/admin/livestock/${id}`),
  processTopup: (loanId, data) => api.post(`/admin/loans/${loanId}/topup`, data),
  getInvestors: () => api.get("/admin/investors"),
  createInvestor: (data) => api.post("/admin/investors", data),
  updateInvestor: (id, data) => api.put(`/admin/investors/${id}`, data),
  deleteInvestor: (id) => api.delete(`/admin/investors/${id}`),
  getInvestorStats: () => api.get("/admin/investors/stats"),
  createInvestorAccountLink: (id) => api.post(`/admin/investors/${id}/create-user-account`),
  getInvestorTransactions: () => api.get("/admin/investor-transactions"),
  calculateInvestorReturn: (investorId, date = null) => {
    let url = `/admin/investors/${investorId}/calculate-return`
    if (date) {
      url += `?date=${date}`
    }
    return api.get(url)
  },
  processInvestorReturn: async (investorId, data) => {
    return api.post(`/admin/investors/${investorId}/process-return`, data);
  },  
  
  adjustInvestorInvestment: async (investorId, data) => {
    return api.post(`/admin/investors/${investorId}/adjust-investment`, data)
  }
};

export const paymentAPI = {
  initiateStkPush: (paymentData) => api.post("/payments/stkpush", paymentData),
  getStatus: (id) => api.get(`/payments/${id}/status`),
  processCashPayment: (paymentData) => api.post("/payments/cash", paymentData),
  processMpesaManual: (data) => api.post("/payments/mpesa/manual", data),
  processMpesaPayment: (paymentData) => api.post("/payments/mpesa/stk-push", paymentData),
  checkMpesaStatus: (statusData) => api.post("/payments/mpesa/check-status", statusData),
};

export const investorAPI = {
  getDashboard: () => {
    const token = localStorage.getItem("investor_token");
    return api.get("/investor/dashboard", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  },
  getReturns: () => {
    const token = localStorage.getItem("investor_token");
    return api.get("/investor/returns", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  },
  shareLivestock: (livestockId, data) => {
    const token = localStorage.getItem("investor_token");
    return api.post(`/investor/share-livestock/${livestockId}`, data, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  },
  inquireLivestock: (livestockId, data) => {
    const token = localStorage.getItem("investor_token");
    return api.post(`/investor/inquire-livestock/${livestockId}`, data, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  },
  updateUsername: async (data) => {
    const response = await api.put('/investor/account/update-username', data);
    return response;
  },
  
  updatePassword: async (data) => {
    const response = await api.put('/investor/account/update-password', data);
    return response;
  },
  
  validatePassword: async (password) => {
    const response = await api.post('/investor/account/validate-password', {
      current_password: password
    });
    return response;
  }

};

export default api;