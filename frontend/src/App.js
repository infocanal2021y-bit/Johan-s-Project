import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { Toaster } from "./components/ui/sonner";

// Pages
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountsPage } from "./pages/AccountsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { WithdrawPage } from "./pages/WithdrawPage";
import { TransferPage } from "./pages/TransferPage";
import { KYCPage } from "./pages/KYCPage";
import { SupportPage } from "./pages/SupportPage";
import MessageCenterPage from "./pages/MessageCenterPage";
import CommunicationsPage from "./pages/CommunicationsPage";
import ServiceStatusPage from "./pages/ServiceStatusPage";
import { SettingsPage } from "./pages/SettingsPage";

// New Crypto/Finance Pages
import { CryptoMarketPage } from "./pages/CryptoMarketPage";
import { ConverterPage } from "./pages/ConverterPage";
import { InvestmentSimulatorPage } from "./pages/InvestmentSimulatorPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { AlertsPage } from "./pages/AlertsPage";
import { MarketReportsPage } from "./pages/MarketReportsPage";
import { InvestmentComparatorPage } from "./pages/InvestmentComparatorPage";
import { GlobalMarketMapPage } from "./pages/GlobalMarketMapPage";
import { LiveMarketNewsPage } from "./pages/LiveMarketNewsPage";
import { RealTimeMarketPage } from "./pages/RealTimeMarketPage";
import { AchievementsPage } from "./pages/AchievementsPage";
import BinanceWalletPage from "./pages/BinanceWalletPage";
import WithdrawMethodsPage from "./pages/WithdrawMethodsPage";
import CompleteWithdrawalPage from "./pages/CompleteWithdrawalPage";
import BitcoinOutputsPage from "./pages/BitcoinOutputsPage";
import { TradingDemoPage } from "./pages/TradingDemoPage";
import { TradingBotPage } from "./pages/TradingBotPage";
import { AdvisorsPage } from "./pages/AdvisorsPage";
import { InvestingProPage } from "./pages/InvestingProPage";
import CommunityPage from "./pages/CommunityPage";
import AdminCommunityProgressPage from "./pages/admin/AdminCommunityProgressPage";
import AdminShareAnalyticsPage from "./pages/admin/AdminShareAnalyticsPage";
import AdminOpsPage from "./pages/admin/AdminOpsPage";
import AdminSystemStatusPage from "./pages/admin/AdminSystemStatusPage";
import AdminProofsPage from "./pages/admin/AdminProofsPage";
import AdminJourneyAnalyticsPage from "./pages/admin/AdminJourneyAnalyticsPage";
import { MaintenanceBanner } from "./components/system/MaintenanceBanner";
import useTokenHeartbeat from "./hooks/useTokenHeartbeat";

// Admin Pages
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminTransactionsPage } from "./pages/admin/AdminTransactionsPage";
import { AdminWithdrawalsPage } from "./pages/admin/AdminWithdrawalsPage";
import { AdminKYCPage } from "./pages/admin/AdminKYCPage";
import { AdminTreasuryPage } from "./pages/admin/AdminTreasuryPage";
import { AdminCreditsPage } from "./pages/admin/AdminCreditsPage";
import { AdminCryptoPaymentsPage } from "./pages/admin/AdminCryptoPaymentsPage";
import { AdminCryptoStatsPage } from "./pages/admin/AdminCryptoStatsPage";
import AdminCryptoMonitorPage from "./pages/admin/AdminCryptoMonitorPage";
import AdminWalletsPage from "./pages/admin/AdminWalletsPage";
import AdminActionCenterPage from "./pages/admin/AdminActionCenterPage";
import AdminPendingAbonosPage from "./pages/admin/AdminPendingAbonosPage";
import AdminZeroBalancePage from "./pages/admin/AdminZeroBalancePage";
import AdminAuditHistoryPage from "./pages/admin/AdminAuditHistoryPage";
import { AdminSupportPage } from "./pages/admin/AdminSupportPage";
import { AdminActivityPage } from "./pages/admin/AdminActivityPage";
import { AdminLoginHistoryPage } from "./pages/admin/AdminLoginHistoryPage";
import { AdminOnlineUsersPage } from "./pages/admin/AdminOnlineUsersPage";
import { AdminBroadcastPage } from "./pages/admin/AdminBroadcastPage";
import { AdminHealthPage } from "./pages/admin/AdminHealthPage";
import { AdminMT5InvestPage } from "./pages/admin/AdminMT5InvestPage";
import { AdminPartialUnlockPage } from "./pages/admin/AdminPartialUnlockPage";
import { AdminClientImportPage } from "./pages/admin/AdminClientImportPage";
import { AdminClientImportAnalyticsPage } from "./pages/admin/AdminClientImportAnalyticsPage";
import { AdminReactivationOverviewPage } from "./pages/admin/AdminReactivationOverviewPage";
import { AdminEmailCampaignPage } from "./pages/admin/AdminEmailCampaignPage";
import ForcePasswordChangePage from "./pages/ForcePasswordChangePage";
import MT5Page from "./pages/MT5Page";
import MultiCurrencyWalletPage from "./pages/MultiCurrencyWalletPage";
import BankWithdrawalPage from "./pages/BankWithdrawalPage";
import VaultBlockchainPage from "./pages/VaultBlockchainPage";
import CommandCenterPage from "./pages/CommandCenterPage";
import NotificationsCenterPage from "./pages/NotificationsCenterPage";
import MobileAppPage from "./pages/MobileAppPage";
import CasesPage from "./pages/CasesPage";
import AdminExchangeRatesPage from "./pages/admin/AdminExchangeRatesPage";
import AdminBankWithdrawalsPage from "./pages/admin/AdminBankWithdrawalsPage";
import AdminBankTransfersPage from "./pages/admin/AdminBankTransfersPage";
import AdminBankCertificatesPage from "./pages/admin/AdminBankCertificatesPage";

// Protected Route Component
const ProtectedRoute = ({ children, adminOnly = false, allowForcedChange = false }) => {
    const { isAuthenticated, isAdmin, loading, user } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#072146' }}>
                <div className="w-8 h-8 border-2 border-[#1973B8] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Force password change before anything else (reactivated accounts)
    if (!allowForcedChange && user?.must_change_password) {
        return <Navigate to="/force-password-change" replace />;
    }

    if (adminOnly && !isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

// Public Route (redirect to dashboard if already logged in)
const PublicRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#072146' }}>
                <div className="w-8 h-8 border-2 border-[#1973B8] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

function AppRoutes() {
    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected User Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/accounts" element={<ProtectedRoute><AccountsPage /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
            <Route path="/withdraw" element={<ProtectedRoute><WithdrawPage /></ProtectedRoute>} />
            <Route path="/transfer" element={<ProtectedRoute><TransferPage /></ProtectedRoute>} />
            <Route path="/kyc" element={<ProtectedRoute><KYCPage /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><MessageCenterPage /></ProtectedRoute>} />
            <Route path="/communications" element={<ProtectedRoute><CommunicationsPage /></ProtectedRoute>} />
            <Route path="/status" element={<ServiceStatusPage />} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            
            {/* Crypto/Finance Routes */}
            <Route path="/crypto-market" element={<ProtectedRoute><CryptoMarketPage /></ProtectedRoute>} />
            <Route path="/converter" element={<ProtectedRoute><ConverterPage /></ProtectedRoute>} />
            <Route path="/investment-simulator" element={<ProtectedRoute><InvestmentSimulatorPage /></ProtectedRoute>} />
            <Route path="/portfolio" element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
            <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
            <Route path="/market-reports" element={<ProtectedRoute><MarketReportsPage /></ProtectedRoute>} />
            <Route path="/investment-comparator" element={<ProtectedRoute><InvestmentComparatorPage /></ProtectedRoute>} />
            <Route path="/global-market-map" element={<ProtectedRoute><GlobalMarketMapPage /></ProtectedRoute>} />
            <Route path="/live-news" element={<ProtectedRoute><LiveMarketNewsPage /></ProtectedRoute>} />
            <Route path="/realtime-market" element={<ProtectedRoute><RealTimeMarketPage /></ProtectedRoute>} />
            <Route path="/achievements" element={<ProtectedRoute><AchievementsPage /></ProtectedRoute>} />
            <Route path="/binance-wallet" element={<ProtectedRoute><BinanceWalletPage /></ProtectedRoute>} />
            <Route path="/withdraw-methods" element={<ProtectedRoute><WithdrawMethodsPage /></ProtectedRoute>} />
            <Route path="/bank-transfer" element={<Navigate to="/withdraw-methods" replace />} />
            <Route path="/complete-withdrawal/:transactionId" element={<ProtectedRoute><CompleteWithdrawalPage /></ProtectedRoute>} />
            <Route path="/bitcoin-outputs" element={<ProtectedRoute><BitcoinOutputsPage /></ProtectedRoute>} />
            <Route path="/trading-demo" element={<ProtectedRoute><TradingDemoPage /></ProtectedRoute>} />
            <Route path="/trading-bot" element={<ProtectedRoute><TradingBotPage /></ProtectedRoute>} />
            <Route path="/advisors" element={<ProtectedRoute><AdvisorsPage /></ProtectedRoute>} />
            <Route path="/community" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
            <Route path="/investing-pro" element={<ProtectedRoute><InvestingProPage /></ProtectedRoute>} />
            <Route path="/wallet/multi-currency" element={<ProtectedRoute><MultiCurrencyWalletPage /></ProtectedRoute>} />
            <Route path="/wallet/bank-withdrawal" element={<ProtectedRoute><BankWithdrawalPage /></ProtectedRoute>} />
            <Route path="/wallet/vault" element={<ProtectedRoute><VaultBlockchainPage /></ProtectedRoute>} />
            <Route path="/command-center" element={<ProtectedRoute><CommandCenterPage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsCenterPage /></ProtectedRoute>} />
            <Route path="/mobile-app" element={<ProtectedRoute><MobileAppPage /></ProtectedRoute>} />
            <Route path="/cases" element={<ProtectedRoute><CasesPage /></ProtectedRoute>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboardPage /></ProtectedRoute>} />
            <Route path="/admin/credits" element={<ProtectedRoute adminOnly><AdminCreditsPage /></ProtectedRoute>} />
            <Route path="/admin/crypto-payments" element={<ProtectedRoute adminOnly><AdminCryptoPaymentsPage /></ProtectedRoute>} />
            <Route path="/admin/crypto-stats" element={<ProtectedRoute adminOnly><AdminCryptoStatsPage /></ProtectedRoute>} />
            <Route path="/admin/crypto-monitor" element={<ProtectedRoute adminOnly><AdminCryptoMonitorPage /></ProtectedRoute>} />
            <Route path="/admin/wallets" element={<ProtectedRoute adminOnly><AdminWalletsPage /></ProtectedRoute>} />
            <Route path="/admin/action-center" element={<ProtectedRoute adminOnly><AdminActionCenterPage /></ProtectedRoute>} />
            <Route path="/admin/zero-balance" element={<ProtectedRoute adminOnly><AdminZeroBalancePage /></ProtectedRoute>} />
            <Route path="/admin/audit-history" element={<ProtectedRoute adminOnly><AdminAuditHistoryPage /></ProtectedRoute>} />
            <Route path="/admin/pending-abonos" element={<ProtectedRoute adminOnly><AdminPendingAbonosPage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsersPage /></ProtectedRoute>} />
            <Route path="/admin/community-progress" element={<ProtectedRoute adminOnly><AdminCommunityProgressPage /></ProtectedRoute>} />
            <Route path="/admin/share-analytics" element={<ProtectedRoute adminOnly><AdminShareAnalyticsPage /></ProtectedRoute>} />
            <Route path="/admin/admin-ops" element={<ProtectedRoute adminOnly><AdminOpsPage /></ProtectedRoute>} />
            <Route path="/admin/system-status" element={<ProtectedRoute adminOnly><AdminSystemStatusPage /></ProtectedRoute>} />
            <Route path="/admin/proofs" element={<ProtectedRoute adminOnly><AdminProofsPage /></ProtectedRoute>} />
            <Route path="/admin/journey-analytics" element={<ProtectedRoute adminOnly><AdminJourneyAnalyticsPage /></ProtectedRoute>} />
            <Route path="/admin/transactions" element={<ProtectedRoute adminOnly><AdminTransactionsPage /></ProtectedRoute>} />
            <Route path="/admin/withdrawals" element={<ProtectedRoute adminOnly><AdminWithdrawalsPage /></ProtectedRoute>} />
            <Route path="/admin/kyc" element={<ProtectedRoute adminOnly><AdminKYCPage /></ProtectedRoute>} />
            <Route path="/admin/treasury" element={<ProtectedRoute adminOnly><AdminTreasuryPage /></ProtectedRoute>} />
            <Route path="/admin/support" element={<ProtectedRoute adminOnly><AdminSupportPage /></ProtectedRoute>} />
            <Route path="/admin/activity" element={<ProtectedRoute adminOnly><AdminActivityPage /></ProtectedRoute>} />
            <Route path="/admin/login-history" element={<ProtectedRoute adminOnly><AdminLoginHistoryPage /></ProtectedRoute>} />
            <Route path="/admin/online-users" element={<ProtectedRoute adminOnly><AdminOnlineUsersPage /></ProtectedRoute>} />
            <Route path="/admin/broadcast" element={<ProtectedRoute adminOnly><AdminBroadcastPage /></ProtectedRoute>} />
            <Route path="/admin/health" element={<ProtectedRoute adminOnly><AdminHealthPage /></ProtectedRoute>} />
            <Route path="/admin/mt5-invest" element={<ProtectedRoute adminOnly><AdminMT5InvestPage /></ProtectedRoute>} />
            <Route path="/admin/partial-unlock" element={<ProtectedRoute adminOnly><AdminPartialUnlockPage /></ProtectedRoute>} />
            <Route path="/admin/exchange-rates" element={<ProtectedRoute adminOnly><AdminExchangeRatesPage /></ProtectedRoute>} />
            <Route path="/admin/bank-withdrawals" element={<ProtectedRoute adminOnly><AdminBankWithdrawalsPage /></ProtectedRoute>} />
            <Route path="/admin/bank-transfers" element={<ProtectedRoute adminOnly><AdminBankTransfersPage /></ProtectedRoute>} />
            <Route path="/admin/bank-certificates" element={<ProtectedRoute adminOnly><AdminBankCertificatesPage /></ProtectedRoute>} />
            <Route path="/admin/client-import" element={<ProtectedRoute adminOnly><AdminClientImportPage /></ProtectedRoute>} />
            <Route path="/admin/client-import/analytics" element={<ProtectedRoute adminOnly><AdminClientImportAnalyticsPage /></ProtectedRoute>} />
            <Route path="/admin/reactivation" element={<ProtectedRoute adminOnly><AdminReactivationOverviewPage /></ProtectedRoute>} />
            <Route path="/admin/email-campaign" element={<ProtectedRoute adminOnly><AdminEmailCampaignPage /></ProtectedRoute>} />
            <Route path="/admin/whatsapp" element={<ProtectedRoute adminOnly><AdminEmailCampaignPage /></ProtectedRoute>} />
            <Route path="/force-password-change" element={<ProtectedRoute allowForcedChange><ForcePasswordChangePage /></ProtectedRoute>} />
            <Route path="/mt5" element={<ProtectedRoute><MT5Page /></ProtectedRoute>} />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}

function AppShell() {
    // Auto-validate token every 60s; redirect to /login if expired.
    useTokenHeartbeat();
    return (
        <>
            <MaintenanceBanner />
            <AppRoutes />
            <Toaster position="top-right" richColors />
        </>
    );
}

function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <LanguageProvider>
                    <AuthProvider>
                        <AppShell />
                    </AuthProvider>
                </LanguageProvider>
            </BrowserRouter>
        </div>
    );
}

export default App;
