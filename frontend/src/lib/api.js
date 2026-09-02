import axios from 'axios';

// Use relative URL for same-domain API calls (avoids CORS issues)
const API_URL = '/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Don't force reload, let React Router handle it
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    verify2fa: (data) => api.post('/auth/verify-2fa', data),
    getMe: () => api.get('/auth/me'),
    getLoginHistory: () => api.get('/auth/login-history'),
    changePassword: (data) => api.post('/auth/change-password', data),
    requestPasswordReset: (data) => api.post('/auth/request-password-reset', data),
    resetPassword: (data) => api.post('/auth/reset-password', data),
};

// Support API
export const supportAPI = {
    createTicket: (data) => api.post('/support/tickets', data),
    getMyTickets: () => api.get('/support/tickets'),
    getTicket: (id) => api.get(`/support/tickets/${id}`),
    replyToTicket: (id, data) => api.post(`/support/tickets/${id}/reply`, data),
    reportPaymentIssue: (data) => api.post('/support/payment-issue', data),
};

// KYC API
export const kycAPI = {
    submit: (data) => api.post('/kyc/submit', data),
    getStatus: () => api.get('/kyc/status'),
};

// Accounts API
export const accountsAPI = {
    getAll: () => api.get('/accounts'),
    getById: (id) => api.get(`/accounts/${id}`),
    getSummary: () => api.get('/accounts/summary/total'),
    invest: (data) => api.post('/accounts/invest', data),
    getInvestmentHistory: () => api.get('/accounts/investment-history'),
};

// Payments API
export const paymentsAPI = {
    checkBankTransferAccess: () => api.get('/payments/bank-transfer-access'),
    confirmBankTransfer: (data) => api.post('/payments/bank-transfer-confirm', data),
};

// User Engagement API
export const engagementAPI = {
    trackActivity: (data) => api.post('/user/activity', data),
    getActivityScore: () => api.get('/user/activity-score'),
    markIncomplete: () => api.post('/user/mark-incomplete-process'),
    resolveIncomplete: () => api.post('/user/resolve-incomplete-process'),
    getUserLevel: () => api.get('/user/level'),
    getAchievements: () => api.get('/user/achievements'),
};

// Transactions API
export const transactionsAPI = {
    create: (data) => api.post('/transactions', data),
    getAll: (params) => api.get('/transactions', { params }),
    getAllHistory: () => api.get('/transactions/all'),
    getStats: () => api.get('/transactions/stats'),
    exportCSV: () => api.get('/transactions/export/csv', { responseType: 'blob' }),
    payTax: (transactionId, data) => api.post(`/transactions/${transactionId}/pay-tax`, data),
    getReceipt: (transactionId) => api.get(`/transactions/${transactionId}/receipt`, { responseType: 'blob' }),
    // Crypto tax payment
    getCryptoWallets: () => api.get('/crypto-wallets'),
    getCryptoPrices: () => api.get('/crypto/prices'),
    submitCryptoPayment: (transactionId, data) => api.post(`/transactions/${transactionId}/pay-tax-crypto`, data),
    getCryptoPaymentStatus: (transactionId) => api.get(`/transactions/${transactionId}/crypto-payment`),
    downloadReceipt: async (transactionId) => {
        const response = await api.get(`/transactions/${transactionId}/receipt`, { responseType: 'blob' });
        return response;
    },
    // Withdrawal history
    getWithdrawalHistory: () => api.get('/withdrawals/history'),
};

// Notifications API
export const notificationsAPI = {
    getAll: () => api.get('/notifications'),
    markAsRead: (id) => api.put(`/notifications/${id}/read`),
    markAllAsRead: () => api.put('/notifications/read-all'),
};

// Secure Messages API
export const messagesAPI = {
    getInbox: (params) => api.get('/messages/inbox', { params }),
    getUnreadCount: () => api.get('/messages/unread-count'),
    markTicketSeen: (ticketId) => api.post(`/messages/tickets/${ticketId}/seen`),
};

// Feedback API
export const feedbackAPI = {
    submit: (data) => api.post('/feedback', data),
    getMine: () => api.get('/feedback/mine'),
    getAll: () => api.get('/admin/feedback'),
};

// Admin API
export const adminAPI = {
    getUsers: (params) => api.get('/admin/users', { params }),
    getPlatformWallets: () => api.get('/admin/platform-wallets'),
    updatePlatformWallet: (coin, data) => api.put(`/admin/platform-wallets/${coin}`, data),
    getActionCenter: () => api.get('/admin/action-center'),
    getCryptoWeekly: () => api.get('/admin/crypto-monitor/weekly'),
    get2fa: () => api.get('/admin/security/2fa'),
    set2fa: (enabled) => api.post('/admin/security/2fa', { enabled }),
    getTransactions: (status) => api.get('/admin/transactions', { params: { status } }),
    getPendingWithdrawals: () => api.get('/admin/withdrawals/pending'),
    getAllWithdrawals: () => api.get('/admin/withdrawals/all'),
    updateWithdrawalStatus: (data) => api.put('/admin/withdrawals/update-status', data),
    getWithdrawalAuthInfo: (id) => api.get(`/admin/withdrawals/${id}/authorization-info`),
    authorizeWithdrawal: (id) => api.post(`/admin/withdrawals/${id}/authorize`),
    verifyWithdrawalAmount: (id) => api.post(`/admin/withdrawals/${id}/verify-amount`),
    remindWithdrawalRequirements: (id) => api.post(`/admin/withdrawals/${id}/remind-requirements`),
    requestWithdrawalDocs: (id, message) => api.post(`/admin/withdrawals/${id}/request-documentation`, { message }),
    addWithdrawalNote: (id, note) => api.post(`/admin/withdrawals/${id}/note`, { note }),
    getAuditHistory: (params) => api.get('/admin/audit-history', { params }),
    getPendingWithdrawalsDetailed: () => api.get('/admin/pending-withdrawals'),
    getWithdrawalDetails: (id) => api.get(`/admin/withdrawals/${id}/details`),
    reactivateWithdrawal: (id) => api.post(`/admin/withdrawals/${id}/reactivate`),
    approveWithdrawal: (id) => api.post(`/admin/withdrawals/approve/${id}`),
    rejectWithdrawal: (id) => api.post(`/admin/withdrawals/reject/${id}`),
    updateBalance: (data) => api.put('/admin/balance', data),
    updateTransactionStatus: (data) => api.put('/admin/transaction-status', data),
    updateUserRole: (data) => api.put('/admin/user-role', data),
    // KYC
    getPendingKYC: () => api.get('/admin/kyc/pending'),
    kycAction: (data) => api.post('/admin/kyc/action', data),
    // User management
    suspendUser: (data) => api.post('/admin/user/suspend', data),
    // Transfer management
    forceRelease: (data) => api.post('/admin/transfer/force-release', data),
    // Treasury
    getTreasury: () => api.get('/admin/treasury'),
    // Admin Credits (add balance)
    addBalance: (data) => api.post('/admin/add-balance', data),
    debitBalance: (data) => api.post('/admin/debit-balance', data),
    getCredits: () => api.get('/admin/credits'),
    getUserAdminTransactions: (userId) => api.get(`/admin/users/${userId}/admin-transactions`),
    // Crypto payments
    getPendingCryptoPayments: () => api.get('/admin/crypto-payments/pending'),
    cryptoPaymentAction: (data) => api.post('/admin/crypto-payments/action', data),
    getCryptoPaymentProof: (paymentId) => api.get(`/admin/crypto-payments/${paymentId}/proof`),
    getCryptoPaymentsHistory: () => api.get('/admin/crypto-payments/history'),
    getCryptoPaymentsStats: () => api.get('/admin/crypto-payments/stats'),
    // Broadcast
    broadcast: (data) => api.post('/admin/broadcast', data),
    getBroadcastHistory: () => api.get('/admin/broadcast/history'),
    broadcastSearchUsers: (q, limit = 15) => api.get(`/admin/broadcast/search-users`, { params: { q, limit } }),
    // Support tickets
    getAllTickets: () => api.get('/admin/support/tickets'),
    replyToTicket: (id, data) => api.post(`/admin/support/tickets/${id}/reply`, data),
    updateTicketStatus: (id, status) => api.put(`/admin/support/tickets/${id}/status?status=${status}`),
    getPasswordResets: () => api.get('/admin/password-resets'),
    // Manual tax payments
    addManualTaxPayment: (data) => api.post('/admin/tax-payment', data),
    getManualPayments: () => api.get('/admin/manual-payments'),
    // Admin notifications & Activity Monitor
    getNotifications: () => api.get('/admin/notifications'),
    markNotificationRead: (id) => api.put(`/admin/notifications/${id}/read`),
    markAllNotificationsRead: () => api.put('/admin/notifications/read-all'),
    getUnreadNotificationsCount: () => api.get('/admin/notifications/unread-count'),
    getActivity: (params) => api.get('/admin/activity', { params }),
    getActivityStats: () => api.get('/admin/activity/stats'),
    getFrequentUsers: () => api.get('/admin/activity/frequent-users'),
    // Login History
    getLoginHistory: () => api.get('/admin/login-history'),
    getSuspiciousLogins: () => api.get('/admin/login-history/suspicious'),
    // Online Users
    getOnlineUsers: () => api.get('/admin/users/online'),
};

export const getExchangeRates = () => api.get('/exchange-rates');

// Binance API
export const binanceAPI = {
    getPrices: () => api.get('/binance/prices'),
    getTickers: () => api.get('/binance/tickers'),
    getWallet: () => api.get('/binance/wallet'),
};

// Admin Wallet
export const adminWalletAPI = {
    assignAsset: (data) => api.post('/admin/wallet/assign', data),
};

// Chatbot API
export const chatbotAPI = {
    sendMessage: (message) => api.post('/chatbot/message', { message }),
};

// Market Data API (CoinGecko proxy)
export const marketAPI = {
    getCrypto: () => api.get('/market/crypto'),
    getGlobal: () => api.get('/market/global'),
    getTrending: () => api.get('/market/trending'),
    getNews: (category = 'general') => api.get('/market/news', { params: { category } }),
};

// Presence / Heartbeat
export const presenceAPI = {
    heartbeat: () => api.post('/auth/heartbeat'),
    logoutStatus: () => api.post('/auth/logout-status'),
};

export default api;
