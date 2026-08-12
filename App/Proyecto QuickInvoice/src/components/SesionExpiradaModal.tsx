interface Props {
    open: boolean
    onConfirm: () => void
}

// Modal bloqueante: reemplaza el error crudo "JWT expired" que antes mostraba
// cada pantalla por su cuenta. autoRefreshToken está desactivado a propósito
// (ver lib/supabase.ts) para evitar un bloqueo de mutex del GoTrueClient, así
// que la sesión expira sola pasada ~1h y hay que volver a iniciar sesión.
export function SesionExpiradaModal({ open, onConfirm }: Props) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/70 p-6">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
                <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">Tu sesión expiró</h2>
                <p className="text-slate-600 mb-8 leading-relaxed">
                    Por seguridad, la sesión se cierra automáticamente después de un tiempo
                    de inactividad. Vuelve a iniciar sesión para continuar — no te preocupes,
                    ningún dato guardado se pierde.
                </p>
                <button
                    onClick={onConfirm}
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                    Volver a iniciar sesión
                </button>
            </div>
        </div>
    )
}
