interface Props {
    open: boolean
    onConfirm: () => void
}

// Modal bloqueante (sin cierre por click afuera, sin auto-redirect): le da
// al usuario tiempo para reaccionar antes de perder cualquier cambio sin
// guardar. Solo al hacer click en el botón se cierra la sesión y se
// redirige a /login.
export function SesionDesplazadaModal({ open, onConfirm }: Props) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/70 p-6">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86l-8.18 14.14A2 2 0 003.82 21h16.36a2 2 0 001.71-3l-8.18-14.14a2 2 0 00-3.42 0z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">Sesión cerrada</h2>
                <p className="text-slate-600 mb-8 leading-relaxed">
                    Tu sesión fue cerrada automáticamente porque se inició sesión con esta
                    cuenta desde otro dispositivo. Si no fuiste tú, te recomendamos cambiar
                    tu contraseña. Si tienes dudas, contacta al administrador de tu empresa.
                </p>
                <button
                    onClick={onConfirm}
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                    Entendido, ir a iniciar sesión
                </button>
            </div>
        </div>
    )
}
