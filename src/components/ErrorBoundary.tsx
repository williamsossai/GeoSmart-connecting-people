import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  declare readonly props: { children: React.ReactNode };
  state: ErrorBoundaryState = { hasError: false, message: '' };

  constructor(props: { children: React.ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = 'Something went wrong while communicating with GeoSmart data storage.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient')) {
          displayMessage = 'Access was denied for this action. Please make sure you are signed in with a verified email account.';
        } else {
          displayMessage = parsed.error;
        }
      }
    } catch {
      if (error?.message) {
        displayMessage = error.message;
      }
    }
    return { hasError: true, message: displayMessage };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-8 text-center space-y-4 shadow-md">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Unable to Complete Request</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="inline-flex items-center space-x-2 rounded-lg bg-[#05224C] px-4 py-2 text-sm font-medium text-white hover:bg-[#07306b] transition"
            >
              <RotateCw className="w-4 h-4" />
              <span>Reload GeoSmart</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
