import { Sidebar } from './Sidebar';

export const Layout = ({ children }) => {
    return (
        <div className="min-h-screen bg-slate-950 noise-overlay">
            <Sidebar />
            <main className="lg:ml-64 min-h-screen">
                <div className="p-4 pt-16 lg:pt-8 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
};
