import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Ignore DOM manipulation errors from browser translation extensions
    const msg = error?.message || '';
    if (msg.includes('removeChild') || msg.includes('insertBefore') || msg.includes('NotFoundError')) {
      return { hasError: false };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const msg = error?.message || '';
    if (msg.includes('removeChild') || msg.includes('insertBefore') || msg.includes('NotFoundError')) {
      return;
    }
    console.error('Application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 max-w-md text-center">
            <h2 className="text-xl font-bold text-white mb-4">Algo salió mal</h2>
            <p className="text-slate-400 mb-6">Por favor recargue la página para continuar.</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Recargar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
