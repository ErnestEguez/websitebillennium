// emailService.ts
// El envío de correos se realiza dentro de la Edge Function sri-signer (Resend).
// Este módulo es un stub; la lógica real de correo está en el backend.
export const emailService = {
    /**
     * NO-OP: El correo se envía automáticamente dentro de la Edge Function
     * sri-signer al finalizar la autorización SRI.
     * Este método se mantiene para compatibilidad con el flujo existente.
     */
    async enviarComprobante(_email: string, _comprobante: any): Promise<boolean> {
        // El correo ya fue enviado por la Edge Function sri-signer via Resend.
        // No hacer nada aquí para evitar duplicados.
        return true;
    }
}
