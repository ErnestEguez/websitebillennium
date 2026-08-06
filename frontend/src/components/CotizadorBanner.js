import { Link } from 'react-router-dom';
import { Calculator, ArrowRight, Check } from 'lucide-react';
import { Button } from './ui/button';

const highlights = [
  'Paga solo por los módulos que tu negocio realmente usa',
  'El precio se ajusta al tamaño real de tu operación',
  'Cotización lista en minutos, sin compromiso',
];

export const CotizadorBanner = () => (
  <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-blue-900 p-10 md:p-14 text-center">
    <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-5">
      <Calculator className="h-7 w-7 text-blue-300" />
    </div>
    <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Arma tu plan a tu medida</h3>
    <p className="text-slate-300 max-w-xl mx-auto mb-6">
      ERP QuickInvoice se adapta al tamaño real de tu negocio. Elige los módulos que necesitas,
      indícanos cuántos usuarios y el volumen de tu operación, y arma tu propio plan.
    </p>
    <ul className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 mb-8 text-sm text-slate-300">
      {highlights.map((h, i) => (
        <li key={i} className="flex items-center justify-center gap-2">
          <Check className="h-4 w-4 text-emerald-400 shrink-0" /> {h}
        </li>
      ))}
    </ul>
    <Link to="/calculadora">
      <Button size="lg" className="bg-blue-600 hover:bg-blue-700" data-testid="btn-cotizar-calculadora">
        Cotizar mi plan
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </Link>
  </div>
);

export default CotizadorBanner;
