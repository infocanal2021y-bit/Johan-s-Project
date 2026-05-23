import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import ErrorBoundary from "@/components/ErrorBoundary";
import "@/lib/clientErrorReporter";

// Patch DOM to handle browser translation injecting nodes (Google Translate, etc.)
// Translation extensions wrap text in <font>/<span> tags which break React's reconciliation.
if (typeof Node !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child) {
    if (child.parentNode !== this) {
      if (child.parentNode) {
        return child.parentNode.removeChild(child);
      }
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, null);
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}

// Suppress remaining DOM errors in console
const originalError = console.error;
console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : args[0]?.message || '';
  if (msg.includes('removeChild') || msg.includes('insertBefore') || msg.includes('NotFoundError')) {
    return;
  }
  if (msg.includes('ResizeObserver loop')) {
    return;
  }
  originalError.apply(console, args);
};

// Silence the benign "ResizeObserver loop completed with undelivered notifications" warning
// that CRA's error overlay incorrectly surfaces. Radix UI, charts and sidebars are the usual
// culprits. See: https://github.com/WICG/resize-observer/issues/38
if (typeof window !== 'undefined') {
  const RESIZE_MSGS = [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
  ];

  // 1) Patch ResizeObserver itself so callbacks are deferred via rAF.
  // This breaks the synchronous notification loop that triggers the warning.
  if (typeof window.ResizeObserver !== 'undefined') {
    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class PatchedResizeObserver extends NativeResizeObserver {
      constructor(callback) {
        let rafId = 0;
        super((entries, observer) => {
          if (rafId) return;
          rafId = window.requestAnimationFrame(() => {
            rafId = 0;
            try { callback(entries, observer); } catch (_) { /* ignore */ }
          });
        });
      }
    };
  }

  // 2) Belt-and-suspenders: also swallow if any leaks through (3rd-party libs
  // that capture NativeResizeObserver before our patch).
  const isResizeMsg = (msg) => RESIZE_MSGS.some((m) => msg.includes(m));

  window.addEventListener('error', (e) => {
    if (e && e.message && isResizeMsg(e.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }
  }, true); // capture phase to run before react-error-overlay
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e?.reason?.message || '';
    if (isResizeMsg(msg)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
