import { Sidebar } from './Sidebar';

export const Layout = ({ children }) => {
    return (
        <div className="min-h-screen bg-slate-950 noise-overlay">
            <Sidebar />
            <main className="lg:ml-64 min-h-screen">
                <div className="px-4 py-6 pt-20 lg:pt-8 lg:p-8 max-w-full overflow-x-hidden">
                    {children}
                </div>
            </main>
        </div>
    );
};
