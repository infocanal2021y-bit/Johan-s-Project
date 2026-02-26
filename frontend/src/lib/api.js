import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_URL = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle auth errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    getMe: () => api.get('/auth/me'),
};

// Accounts API
export const accountsAPI = {
    getAll: () => api.get('/accounts'),
    getById: (id) => api.get(`/accounts/${id}`),
    getSummary: () => api.get('/accounts/summary/total'),
};

// Transactions API
export const transactionsAPI = {
    create: (data) => api.post('/transactions', data),
    getAll: (params) => api.get('/transactions', { params }),
    getAllHistory: () => api.get('/transactions/all'),
    exportCSV: () => api.get('/transactions/export/csv', { responseType: 'blob' }),
};

// Admin API
export const adminAPI = {
    getUsers: () => api.get('/admin/users'),
    getTransactions: (status) => api.get('/admin/transactions', { params: { status } }),
    getPendingWithdrawals: () => api.get('/admin/withdrawals/pending'),
    approveWithdrawal: (id) => api.post(`/admin/withdrawals/approve/${id}`),
    rejectWithdrawal: (id) => api.post(`/admin/withdrawals/reject/${id}`),
    updateBalance: (data) => api.put('/admin/balance', data),
    updateTransactionStatus: (data) => api.put('/admin/transaction-status', data),
    updateUserRole: (data) => api.put('/admin/user-role', data),
};

// Exchange rates
export const getExchangeRates = () => api.get('/exchange-rates');

export default api;
