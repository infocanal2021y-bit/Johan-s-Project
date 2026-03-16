import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import ErrorBoundary from "@/components/ErrorBoundary";

// Suppress removeChild errors from Radix UI portals in production
const originalError = console.error;
console.error = (...args) => {
  if (args[0]?.includes?.('removeChild') || 
      (typeof args[0] === 'string' && args[0].includes('removeChild'))) {
    console.warn('Suppressed portal cleanup error');
    return;
  }
  originalError.apply(console, args);
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
