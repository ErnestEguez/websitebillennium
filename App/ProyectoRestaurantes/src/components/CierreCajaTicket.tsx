
import React from 'react';
import { formatCurrency } from '../lib/utils'; // Assumes you have this utility
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CierreCajaTicketProps {
    datos: {
        empresa: {
            nombre: string;
            direccion?: string;
            ruc?: string;
        };
        usuario: {
            nombre: string;
            rol?: string;
        };
        sesion: {
            fecha_apertura: string;
            fecha_cierre?: string;
            base_inicial: number;
            total_efectivo: number;
            total_tarjetas: number;
            total_transferencia: number;
            total_otros: number;
        };
        totales_calculados: {
            total_efectivo: number;
            total_tarjetas: number;
            total_transferencia: number;
            total_otros: number;
        }
    };
}

export const CierreCajaTicket = React.forwardRef<HTMLDivElement, CierreCajaTicketProps>(
    ({ datos }, ref) => {
        const totalRecaudado =
            datos.sesion.total_efectivo +
            datos.sesion.total_tarjetas +
            datos.sesion.total_transferencia +
            datos.sesion.total_otros;

        const totalCalculado =
            datos.totales_calculados.total_efectivo +
            datos.totales_calculados.total_tarjetas +
            datos.totales_calculados.total_transferencia +
            datos.totales_calculados.total_otros;

        const diferencia = totalRecaudado - totalCalculado;

        return (
            <div ref={ref} className="p-4 bg-white text-black font-mono text-xs" style={{ width: '80mm' }}>
                <div className="text-center mb-4 border-b border-black pb-2">
                    <h2 className="font-bold text-sm uppercase">{datos.empresa.nombre}</h2>
                    {datos.empresa.ruc && <p>RUC: {datos.empresa.ruc}</p>}
                    {datos.empresa.direccion && <p className="text-[10px]">{datos.empresa.direccion}</p>}
                    <h3 className="font-bold mt-2 text-sm">CIERRE DE CAJA</h3>
                </div>

                <div className="mb-4 space-y-1">
                    <p><strong>Cajero:</strong> {datos.usuario.nombre}</p>
                    <p><strong>Apertura:</strong> {format(new Date(datos.sesion.fecha_apertura), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                    <p><strong>Cierre:</strong> {datos.sesion.fecha_cierre ? format(new Date(datos.sesion.fecha_cierre), 'dd/MM/yyyy HH:mm', { locale: es }) : 'EN PROCESO'}</p>
                </div>

                <div className="mb-4 border-b border-black pb-2">
                    <div className="flex justify-between font-bold mb-1">
                        <span>Concepto</span>
                        <span>Valor</span>
                    </div>

                    <div className="flex justify-between">
                        <span>Base Inicial</span>
                        <span>{formatCurrency(datos.sesion.base_inicial)}</span>
                    </div>
                </div>

                <div className="mb-4 border-b border-black pb-2">
                    <h4 className="font-bold mb-1 text-center">INGRESOS DEL SISTEMA</h4>
                    <div className="flex justify-between">
                        <span>Efectivo</span>
                        <span>{formatCurrency(datos.totales_calculados.total_efectivo)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Tarjetas</span>
                        <span>{formatCurrency(datos.totales_calculados.total_tarjetas)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Transferencias</span>
                        <span>{formatCurrency(datos.totales_calculados.total_transferencia)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Otros</span>
                        <span>{formatCurrency(datos.totales_calculados.total_otros)}</span>
                    </div>
                    <div className="flex justify-between font-bold mt-1 border-t border-dashed border-gray-400 pt-1">
                        <span>TOTAL VENTAS</span>
                        <span>{formatCurrency(totalCalculado)}</span>
                    </div>
                </div>

                <div className="mb-4 border-b border-black pb-2">
                    <h4 className="font-bold mb-1 text-center">ARQUEO DE CAJA</h4>
                    <div className="flex justify-between font-bold">
                        <span>TOTAL EN CAJA</span>
                        <span>{formatCurrency(totalRecaudado + datos.sesion.base_inicial)}</span>
                    </div>
                    {Math.abs(diferencia) > 0.01 && (
                        <div className="flex justify-between font-bold mt-1">
                            <span>DIFERENCIA</span>
                            <span>{formatCurrency(diferencia)}</span>
                        </div>
                    )}
                </div>

                <div className="text-center text-[10px] mt-4">
                    <p>--- Fin del Reporte ---</p>
                    <p>{format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: es })}</p>
                </div>
            </div>
        );
    }
);
