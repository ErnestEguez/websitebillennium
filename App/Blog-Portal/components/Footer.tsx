// Ported desde frontend/src/components/Layout.js — mismo contenido y copy,
// enlaces absolutos al dominio del Portal (ver nota en Header.tsx sobre por
// qué se usan <a> con URL absoluta en vez de next/link).
const LOGO_URL = 'https://www.billenniumsystem.com/billennium-logo.png';
const BASE = 'https://www.billenniumsystem.com';

export function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-16">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div>
            <div className="flex items-center gap-3 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_URL} alt="Billennium System" className="h-12 w-12 rounded-full object-cover" />
              <span className="font-bold text-xl">Billennium System</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Soluciones SaaS para pymes ecuatorianas. Más de 40 años de experiencia en desarrollo de software empresarial.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Productos</h4>
            <ul className="space-y-2">
              <li><a href={`${BASE}/productos/restoflow`} className="text-slate-400 hover:text-white transition-colors text-sm">RestoFlow</a></li>
              <li><a href={`${BASE}/productos/pedidos-sentinel`} className="text-slate-400 hover:text-white transition-colors text-sm">Pedidos Sentinel</a></li>
              <li><a href={`${BASE}/productos/modulo-importaciones`} className="text-slate-400 hover:text-white transition-colors text-sm">Importaciones</a></li>
              <li><a href={`${BASE}/productos/lopdp`} className="text-slate-400 hover:text-white transition-colors text-sm">LOPDP</a></li>
              <li><a href={`${BASE}/productos/facturacion-electronica`} className="text-slate-400 hover:text-white transition-colors text-sm">Facturación Electrónica</a></li>
              <li><a href={`${BASE}/productos/dashboard-empresarial`} className="text-slate-400 hover:text-white transition-colors text-sm">Dashboard</a></li>
              <li><a href={`${BASE}/productos/plataforma-ferias`} className="text-slate-400 hover:text-white transition-colors text-sm">Plataforma Ferias</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Empresa</h4>
            <ul className="space-y-2">
              <li><a href={`${BASE}/nosotros`} className="text-slate-400 hover:text-white transition-colors text-sm">Sobre Nosotros</a></li>
              <li><a href={`${BASE}/planes`} className="text-slate-400 hover:text-white transition-colors text-sm">Planes y Precios</a></li>
              <li><a href={`${BASE}/contacto`} className="text-slate-400 hover:text-white transition-colors text-sm">Contacto</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contacto</h4>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li>Cdla. La Garzota</li>
              <li>Guayaquil - Ecuador</li>
              <li className="pt-2">+593 98 013 6389</li>
              <li>billenniumsystem@gmail.com</li>
              <li>facturacion@billenniumsystem.com</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8 text-center text-slate-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Billennium System. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
