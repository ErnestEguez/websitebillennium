import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';

export const NotFound = () => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center"
            >
                <p className="text-8xl font-extrabold text-blue-600 mb-2">404</p>
                <h1 className="text-3xl font-bold text-slate-900 mb-4">Página no encontrada</h1>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
                    Lo sentimos, la página que buscas no existe o fue movida.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                    <Link to="/">
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Home className="mr-2 h-4 w-4" />
                            Volver al inicio
                        </Button>
                    </Link>
                    <Button variant="outline" onClick={() => window.history.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Página anterior
                    </Button>
                </div>
            </motion.div>
        </div>
    );
};

export default NotFound;
