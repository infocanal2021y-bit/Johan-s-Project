import { Button } from '../ui/button';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export const startGoogleLogin = () => {
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

const GoogleMark = () => (
    <svg className="w-4 h-4 mr-2.5" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.7c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.2-10.1 7.2-17.2z" />
        <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
);

export const GoogleSignInButton = ({ label = 'Continuar con Google', className = '' }) => (
    <Button
        type="button"
        variant="outline"
        onClick={startGoogleLogin}
        className={`w-full h-11 bg-white text-slate-900 hover:bg-slate-100 border-0 font-semibold ${className}`}
        data-testid="google-signin-btn"
    >
        <GoogleMark /> {label}
    </Button>
);

export const OrDivider = () => (
    <div className="relative my-5" aria-hidden="true">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700/60" /></div>
        <div className="relative flex justify-center"><span className="px-3 text-[11px] uppercase tracking-[0.14em] text-slate-500 bg-[#0a0f1a]">o</span></div>
    </div>
);
