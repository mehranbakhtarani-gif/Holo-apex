import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'خطای غیرمنتظره در اجرای سامانه رخ داد.',
    };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let readable = this.state.message;
    try {
      const parsed = JSON.parse(this.state.message);
      if (parsed?.error) {
        readable = `خطای ارتباط با پایگاه‌داده ابری (${parsed.operationType} در ${parsed.path || '-'}): ${parsed.error}`;
      }
    } catch {
      // plain string error
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-bold">خطا در پردازش عملیات مالی</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
            {readable}
          </p>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" />
              بارگذاری مجدد سامانه
            </button>
          </div>
        </div>
      </div>
    );
  }
}
