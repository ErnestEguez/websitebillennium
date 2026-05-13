import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('🔥 UNCAUGHT ERROR:', error, errorInfo)
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100 text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">¡Ups! Algo salió mal</h2>
                        <p className="text-slate-500 mb-6 text-sm">
                            La aplicación encontró un error inesperado. Por favor, intenta recargar la página.
                        </p>
                        <div className="bg-red-50 p-4 rounded-lg text-left mb-6 overflow-auto max-h-32">
                            <p className="text-xs font-mono text-red-700 break-words">
                                {this.state.error?.toString()}
                            </p>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-primary-600 text-white font-bold py-3 rounded-xl hover:bg-primary-700 transition-colors"
                        >
                            Recargar Aplicación
                        </button>
                        <button
                            onClick={() => {
                                localStorage.clear();
                                window.location.href = '/login';
                            }}
                            className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline font-bold"
                        >
                            Limpiar sesión y volver al inicio
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
