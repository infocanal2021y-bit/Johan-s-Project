import { Sidebar } from './Sidebar';
import { AppBackground } from './AppBackground';
import { ChatBot } from '../ChatBot';
import { AIAssistantWidget } from '../ai/AIAssistantWidget';
import { InactivityPrompt } from '../InactivityPrompt';
import { JourneyToastNotifier } from '../JourneyToastNotifier';
import { useInactivityDetector } from '../../hooks/useInactivityDetector';
import { useActivityTracker } from '../../hooks/useActivityTracker';
import { useAuth } from '../../context/AuthContext';

export const Layout = ({ children }) => {
    const { user } = useAuth();
    const { showPrompt, dismiss } = useInactivityDetector(75000);
    useActivityTracker(!!user);

    return (
        <div className="relative min-h-screen" style={{ background: '#072146' }}>
            <AppBackground />
            <div className="relative" style={{ zIndex: 10 }}>
                <Sidebar />
                <main className="lg:ml-64 min-h-screen">
                    <div className="px-4 py-6 pt-20 lg:pt-8 lg:p-8 max-w-full overflow-x-hidden">
                        {children}
                    </div>
                </main>
                <ChatBot />
                {user && <AIAssistantWidget />}
                {user && <InactivityPrompt show={showPrompt} onDismiss={dismiss} />}
                {user && <JourneyToastNotifier />}
            </div>
        </div>
    );
};
