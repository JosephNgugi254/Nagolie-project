import axios from "axios"

const API_URL = import.meta.env.VITE_API_BASE_URL || 
  (window.location.hostname === 'localhost' 
    ? "http://localhost:5000/api" 
    : "https://nagolie-backend.onrender.com/api");

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const getAuthToken = () => {
  const token = localStorage.getItem("token");
  if (token) return token;
  const adminToken = localStorage.getItem("admin_token");
  const investorToken = localStorage.getItem("investor_token");
  return adminToken || investorToken;
};

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    config.headers["Accept"] = "application/json";
    return config;
  },
  (error) => Promise.reject(error)
);

let lastTokenClear = 0;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (
      !config.__retryCount &&
      (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK" || !error.response)
    ) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < MAX_RETRIES) {
        config.__retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * config.__retryCount));
        return api(config);
      }
    }

    if (error.response?.status === 401) {
      const now = Date.now();
      if (now - lastTokenClear > 3000) {
        lastTokenClear = now;
        // Clear ALL authentication data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('user_role');
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        localStorage.removeItem('investor_token');
        localStorage.removeItem('investor_user');
      
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/login') && !currentPath.includes('/register')) {
          // Use replace() to avoid back-button issues
          window.location.replace('/login');
        }
      }
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  getCurrentUser: () => api.get("/auth/me"),
  completeInvestorRegistration: (investorId, data) => api.post(`/auth/investor/register/${investorId}`, data),
  getInvestorInfo: (investorId) => api.get(`/auth/investor/info/${investorId}`),
  forgotPassword: (data) => api.post("/auth/forgot-password", data),
  validateResetToken: (data) => api.post("/auth/validate-reset-token", data),
  resetPassword: (data) => api.post("/auth/reset-password", data),
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
  getLivestock: (page = 1, per_page = 10) => api.get(`/admin/livestock?page=${page}&per_page=${per_page}`),
  getPublicLivestockGallery: (page = 1, per_page = 12) => api.get(`/admin/livestock/gallery?page=${page}&per_page=${per_page}`),
  getTransactions: () => api.get("/admin/transactions"),
  getApprovedLoans: () => api.get("/admin/approved-loans"),
  getPaymentStats: () => api.get("/admin/payment-stats"),
  approveApplication: (id, fundingData = {}) => api.post(`/admin/applications/${id}/approve`, {
    funding_source: fundingData.funding_source || 'company',
    investor_id: fundingData.investor_id || null
  }),
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
    let url = `/admin/investors/${investorId}/calculate-return`;
    if (date) url += `?date=${date}`;
    return api.get(url);
  },
  processInvestorReturn: (investorId, data) => api.post(`/admin/investors/${investorId}/process-return`, data),
  adjustInvestorInvestment: (investorId, data) => api.post(`/admin/investors/${investorId}/adjust-investment`, data),
  getCompanyGallery: () => api.get("/company-gallery/public"),
  addCompanyGalleryImages: (data) => api.post("/company-gallery/admin", data),
  deleteCompanyGalleryImage: (id) => api.delete(`/company-gallery/admin/${id}`),
  updateCompanyGalleryImage: (id, data) => api.put(`/company-gallery/admin/${id}`, data),
  renewLoan: (loanId) => api.post(`/admin/loans/${loanId}/renew`),

  waiveLoan: (loanId, newPrincipal, durationDays) => {
    return api.post(`/admin/loans/${loanId}/waive`, {
      new_principal: newPrincipal,
      duration_days: durationDays
    });
  },

  getLoan: (id) => api.get(`/admin/loans/${id}`),
  updateUserBranch: (userId, branch) => api.put(`/admin/users/${userId}/branch`, { branch }),


  //getting loan ledger and consolidated statement
  getLoanLedger: (loanId) => api.get(`/admin/loan/${loanId}/ledger`),
  getConsolidatedStatement: (loanId) => api.get(`/admin/loan/${loanId}/consolidated-statement`),

  //report management apis
  getDayAssignments: () => api.get('/admin/day-assignments'),
  updateDayAssignment: (userId, days) => api.post('/admin/day-assignments', { user_id: userId, days }),
  getClientAssignments: () => api.get('/admin/client-assignments'),
  reassignClient: (loanId, newOfficerId, reason) => api.post('/admin/reassign-client', { loan_id: loanId, new_officer_id: newOfficerId, reason }),
  getBalanceSuggestions: () => api.post('/admin/balance-suggest'),
  applySuggestions: (suggestions) => api.post('/admin/apply-suggestion', { suggestions }),
  resetDayAssignments: () => api.post('/admin/reset-day-assignments'),

  // User & Role Management
  getUsers: () => api.get('/admin/users'),
  createUser: (data) => api.post('/admin/users', data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getRoles: () => api.get('/admin/roles'),
  createRole: (data) => api.post('/admin/roles', data),
  deleteRole: (id) => api.delete(`/admin/roles/${id}`),
  getMenuItems: () => api.get('/admin/menu-items'),

  getOfficers: () => api.get('/admin/officers'),
  getOfficerReport: (officerId, date) => api.get(`/admin/reports/officer?officer_id=${officerId}&date=${date}`),
  clientAssignmentSearch: (query) => api.get(`/admin/reports/client-assignment?q=${encodeURIComponent(query)}`),
  
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
  getDashboard: () => api.get("/investor/dashboard"),
  getReturns: () => api.get("/investor/returns"),
  shareLivestock: (livestockId, data) => api.post(`/investor/share-livestock/${livestockId}`, data),
  inquireLivestock: (livestockId, data) => api.post(`/investor/inquire-livestock/${livestockId}`, data),
  updateUsername: (data) => api.put('/investor/account/update-username', data),
  updatePassword: (data) => api.put('/investor/account/update-password', data),
  validatePassword: (password) => api.post('/investor/account/validate-password', { current_password: password }),
};

export const recoveryAPI = {
  // Core Recovery Data
  getRecoveryData: () => api.get('/recovery'),
  addClient: (data) => api.post('/recovery/client', data),

  // ── Payment (syncs with admin panel)
  processPayment: (loanId, data) => api.post(`/recovery/loan/${loanId}/payment`, data),

  // Comments
  addComment: (loanId, content, parentId = null) =>
    api.post(`/recovery/loan/${loanId}/comment`, { content, parent_id: parentId }),
  getComments: (loanId) => api.get(`/recovery/loan/${loanId}/comments`),
  editComment: (loanId, commentId, content) =>
    api.put(`/recovery/loan/${loanId}/comment/${commentId}`, { content }),

  // Users
  getUsers: () => api.get('/recovery/users'),

  // Messages
  getUnreadCount: () => api.get('/recovery/messages/unread-count'),
  getUnreadCountByUser: () => api.get('/recovery/messages/unread-count-by-user'),
  sendMessage: (recipientId, content, attachmentUrl = null, attachmentType = null, attachmentName = null) =>
    api.post('/recovery/messages/send', {
      recipient_id: recipientId, content,
      attachment_url: attachmentUrl, attachment_type: attachmentType, attachment_name: attachmentName
    }),
  uploadMessageAttachment: (formData) =>
    api.post('/recovery/messages/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getConversation: (otherUserId) => api.get(`/recovery/messages/conversation/${otherUserId}`),
  markMessageRead: (msgId) => api.put(`/recovery/messages/${msgId}/read`),
  editMessage: (messageId, newContent) =>
    api.put(`/recovery/messages/${messageId}`, { content: newContent }),
  deleteMessage: (messageId) =>
    api.delete(`/recovery/messages/${messageId}`),

  // Defaulters
  markDefaulter: (loanId) => api.post(`/recovery/loan/${loanId}/defaulter`),
  resolveDefaulter: (loanId) => api.delete(`/recovery/loan/${loanId}/defaulter`),
  getDefaulters: () => api.get('/recovery/defaulters'),

  // Comment read tracking
  getCommentUnreadCounts: () => api.get('/recovery/comment-unread-counts'),
  getCommentsWithReadStatus: (loanId) => api.get(`/recovery/loan/${loanId}/comments/read-status`),
  markCommentRead: (loanId) => api.post(`/recovery/loan/${loanId}/comment/mark-read`),
  
  // claim livestock ownership
  claimOwnership: (loanId) => api.post(`/recovery/loan/${loanId}/claim`),

  // Renew Loan & waive loan
  renewLoan: (loanId, data) => api.post(`/recovery/loan/${loanId}/renew`, data),
  waiveLoan: (loanId, newPrincipal, durationDays) => {
    return api.post(`/admin/loans/${loanId}/waive`, {
      new_principal: newPrincipal,
      duration_days: durationDays
    });
  },

  // Reports
  getReportAssignments: (date) => api.get(`/recovery/reports/assignments?date=${date}`),
  saveReportComment: (loanId, comment, reportDate) => api.post('/recovery/reports/comment', { loan_id: loanId, comment, report_date: reportDate }),

  getLoanTransactions: (loanId) => api.get(`/recovery/loan/${loanId}/transactions`),waiveLoan: (loanId, newPrincipal, durationDays) => {
    const token = localStorage.getItem('token');
    return axios.post(`${API_URL}/admin/loans/${loanId}/waive`,
      { new_principal: newPrincipal, duration_days: durationDays },
      { headers: { Authorization: `Bearer ${token}` } }
    );  
  },

  
  getRecoveryLoans: async () => {
    const response = await api.get('/recovery');  // uses same endpoint as recovery module
    const grouped = response.data;
    // Flatten the object { Monday: [...], Tuesday: [...], ... } into a single array
    const allLoans = [];
    for (const day in grouped) {
      if (Array.isArray(grouped[day])) {
        allLoans.push(...grouped[day]);
      }
    }
    // Map to a clean structure for the dropdown
    return allLoans.map(loan => ({
      loanId: loan.id,
      clientName: loan.name,
      phone: loan.contacts,
      idNumber: loan.id_number,
      borrowedDate: loan.disbursement_date,
      principalAmount: loan.principal_amount,
      currentPrincipal: loan.current_principal,
      accruedInterest: loan.accrued_interest,
      repaymentPlan: loan.repayment_plan,
      interestRate: loan.interest_rate,
      // additional fields if needed
    }));
  },

  // Flagging
  flagLoan: (loanId, reason) => api.post(`/recovery/flag-loan/${loanId}`, { reason }),
  resolveFlag: (loanId) => api.post(`/recovery/resolve-flag/${loanId}`),
  getFlaggedClients: () => api.get('/recovery/flagged-clients'),
  updateValuerNotes: (loanId, notes) => api.put(`/recovery/flagged-clients/${loanId}/notes`, { notes }),

  getLoanReportComments: (loanId) => api.get(`/recovery/loan/${loanId}/report-comments`),
};

export const userAPI = {
  changeUsername: (data) => api.put('/auth/change-username', data),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const salaryAPI = {
  // Staff Settings (Director)
  getStaffSettings: (month) => api.get(`/salary/staff-settings?month=${month}`),
  setStaffSalary: (userId, month, salaryAmount) => api.post('/salary/staff-settings', { user_id: userId, month, salary_amount: salaryAmount }),

  // Advance Requests
  getAdvanceRequests: () => api.get('/salary/advance-requests'),
  createAdvanceRequest: (amount, note, month) => api.post('/salary/advance-requests', { amount, note, month }),
  processAdvanceRequest: (requestId, action, reason) => api.put(`/salary/advance-requests/${requestId}/process`, { action, reason }),
  payAdvanceRequest: (requestId, mpesaReference, paymentMethod, notes) => api.post(`/salary/advance-requests/${requestId}/pay`, { mpesa_reference: mpesaReference, payment_method: paymentMethod, notes }),

  // Direct Salary Payment
  recordSalaryPayment: (userId, month, amount, paymentMethod, reference, notes) => api.post('/salary/salary-payment', { user_id: userId, month, amount, payment_method: paymentMethod, reference, notes }),

  // Staff view
  getMySalaryStats: (month) => api.get(`/salary/my-stats?month=${month}`),

  // Reports
  getStaffReportData: (userId, month) => api.get(`/salary/staff-report/${userId}?month=${month}`),
};

export default api;