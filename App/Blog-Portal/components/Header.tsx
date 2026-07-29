'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

// Ported desde frontend/src/components/Layout.js (CRA). Decisión deliberada:
// esta versión NO replica el estado de sesión (dropdown de usuario, admin,
// logout) para mantener el blog totalmente desacoplado del AuthContext/
// backend del Portal — "Iniciar sesión"/"Registrarse" simplemente navegan de
// vuelta al Portal principal, donde si vive esa lógica.
const LOGO_URL = 'https://www.billenniumsystem.com/billennium-logo.png';

const navLinks = [
  { href: 'https://www.billenniumsystem.com/', label: 'Inicio' },
  { href: 'https://www.billenniumsystem.com/productos', label: 'Productos' },
  { href: 'https://www.billenniumsystem.com/planes', label: 'Planes' },
  { href: '/', label: 'Blog' },
  { href: 'https://www.billenniumsystem.com/nosotros', label: 'Nosotros' },
  { href: 'https://www.billenniumsystem.com/contacto', label: 'Contacto' },
];

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="flex items-center justify-between h-20">
          <a href="https://www.billenniumsystem.com/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_URL}
              alt="Billennium System"
              className="h-14 w-14 object-contain transform -rotate-12 hover:rotate-0 transition-transform duration-300"
            />
            <span className="font-bold text-xl text-slate-900 hidden sm:block italic">Billennium System</span>
          </a>

          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => {
              const active = link.href === '/' ? pathname === '/' : false;
              const isInternal = link.href.startsWith('/');
              const className = `text-sm font-medium transition-colors hover:text-blue-600 ${active ? 'text-blue-600' : 'text-slate-700'}`;
              return isInternal ? (
                <Link key={link.href} href={link.href} className={className}>{link.label}</Link>
              ) : (
                <a key={link.href} href={link.href} className={className}>{link.label}</a>
              );
            })}
          </nav>

          <div className="hidden lg:flex items-center gap-4">
            <a href="https://www.billenniumsystem.com/login" className="text-sm font-medium text-slate-700 hover:text-blue-600 px-4 py-2">
              Iniciar Sesión
            </a>
            <a
              href="https://www.billenniumsystem.com/register"
              className="text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Registrarse
            </a>
          </div>

          <button className="lg:hidden p-2" onClick={() => setIsOpen(!isOpen)} aria-label="Abrir menú">
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="lg:hidden bg-white border-t border-slate-200">
          <div className="container mx-auto px-4 py-4">
            <nav className="flex flex-col gap-4">
              {navLinks.map((link) => {
                const isInternal = link.href.startsWith('/');
                const className = 'text-base font-medium py-2 text-slate-700';
                return isInternal ? (
                  <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)} className={className}>{link.label}</Link>
                ) : (
                  <a key={link.href} href={link.href} className={className}>{link.label}</a>
                );
              })}
              <div className="flex flex-col gap-2 pt-4 border-t border-slate-200">
                <a href="https://www.billenniumsystem.com/login" className="text-center border border-slate-300 rounded-lg py-2 text-sm font-medium">
                  Iniciar Sesión
                </a>
                <a href="https://www.billenniumsystem.com/register" className="text-center bg-blue-600 text-white rounded-lg py-2 text-sm font-medium">
                  Registrarse
                </a>
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
