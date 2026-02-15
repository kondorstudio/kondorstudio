import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white p-6 text-slate-900">
          <div className="mx-auto max-w-[720px] rounded-xl border border-rose-200 bg-rose-50 p-5">
            <div className="text-sm font-semibold text-rose-800">
              O app quebrou ao renderizar esta tela.
            </div>
            <div className="mt-2 text-sm text-rose-700">
              Abra o DevTools Console e copie o erro para investigarmos.
            </div>
            <button
              type="button"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-rose-700 px-3 text-sm font-semibold text-white hover:bg-rose-800"
              onClick={() => window.location.reload()}
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

