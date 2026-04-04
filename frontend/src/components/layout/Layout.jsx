import { Sidebar } from './Sidebar';
import { ChatBot } from '../ChatBot';
import { InactivityPrompt } from '../InactivityPrompt';
import { useInactivityDetector } from '../../hooks/useInactivityDetector';
import { useActivityTracker } from '../../hooks/useActivityTracker';
import { useAuth } from '../../context/AuthContext';

export const Layout = ({ children }) => {
    const { user } = useAuth();
    const { showPrompt, dismiss } = useInactivityDetector(75000);
    useActivityTracker(!!user);

    return (
        <div className="min-h-screen bg-slate-950 noise-overlay">
            <Sidebar />
            <main className="lg:ml-64 min-h-screen">
                <div className="px-4 py-6 pt-20 lg:pt-8 lg:p-8 max-w-full overflow-x-hidden">
                    {children}
                </div>
            </main>
            <ChatBot />
            {user && <InactivityPrompt show={showPrompt} onDismiss={dismiss} />}
        </div>
    );
};
