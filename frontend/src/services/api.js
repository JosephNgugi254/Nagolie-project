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
    const token = localStorage.getItem("token");
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

    // Handle specific error codes
    if (error.response?.status === 401) {
      console.log("Authentication failed, redirecting to login");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/admin/login";
    } else if (error.response?.status === 422) {
      console.warn("Validation error - check request data");
    } else if (
      error.code === "NETWORK_ERROR" ||
      error.code === "ERR_NETWORK"
    ) {
      console.warn("Network error - check if backend is running");
    }

    return Promise.reject(error);
  }
);

// ==========================
// API Endpoints
// ==========================
export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  getCurrentUser: () => api.get("/auth/me"),
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

export const adminAPI = {
  getDashboard: () => api.get("/admin/dashboard"),
  getApplications: () => api.get("/admin/applications"),
  getClients: () => api.get("/admin/clients"),
  getLivestock: () => api.get("/admin/livestock"),
  getLivestockGallery: () => api.get("/admin/livestock/gallery"),
  getTransactions: () => api.get("/admin/transactions"),
  getApprovedLoans: () => api.get("/admin/approved-loans"),
  approveApplication: (id) => api.post(`/admin/applications/${id}/approve`),
  rejectApplication: (id) => api.post(`/admin/applications/${id}/reject`),
  sendReminder: (data) => api.post("/admin/send-reminder", data),
  claimOwnership: (data) => api.post("/admin/claim-ownership", data),
  test: () => api.get("/admin/test"),
  addLivestock: (data) => api.post("/admin/livestock", data),
  updateLivestock: (id, data) => api.put(`/admin/livestock/${id}`, data),
  deleteLivestock: (id) => api.delete(`/admin/livestock/${id}`),
  processTopup: (loanId, data) =>
    api.post(`/admin/loans/${loanId}/topup`, data),
};

export const clientAPI = {
  getAll: () => api.get("/clients"),
  getById: (id) => api.get(`/clients/${id}`),
  create: (clientData) => api.post("/clients", clientData),
  update: (id, clientData) => api.put(`/clients/${id}`, clientData),
};

export const paymentAPI = {
  initiateStkPush: (paymentData) => api.post("/payments/stkpush", paymentData),
  getStatus: (id) => api.get(`/payments/${id}/status`),
  processCashPayment: (paymentData) => api.post("/payments/cash", paymentData),
  processMpesaManual: (data) => api.post("/payments/mpesa/manual", data),
  processMpesaPayment: (paymentData) =>
    api.post("/payments/mpesa/stk-push", paymentData),
  checkMpesaStatus: (statusData) =>
    api.post("/payments/mpesa/check-status", statusData),
};

export default api;
