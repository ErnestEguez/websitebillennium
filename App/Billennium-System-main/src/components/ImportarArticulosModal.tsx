import { useState, useRef } from 'react';
import { X, UploadCloud, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface FilaResultado {
  fila: number;
  codigo: string;
  estado: 'creado' | 'actualizado' | 'error';
  mensaje: string;
}

interface FilaExcel {
  codigo: string;
  descripcion: string;
  precio: number;
  costo: number;
  stock: number;
  activo: boolean | null; // null = no venía en el archivo, no tocar el campo al actualizar
}

interface Props {
  onClose: () => void;
  onImportado?: () => void;
}

// Acepta "1500,00" y "1500.00" indistintamente. Si trae ambos separadores
// (ej. "1.500,00" o "1,500.00"), asume que el último es el decimal.
function parseNumero(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  let s = String(valor ?? '').trim();
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// Devuelve true/false si reconoce el valor, o null si la celda viene vacía
// (para no pisar el estado activo/inactivo actual de un artículo existente).
function parseActivo(valor: unknown): boolean | null {
  const s = String(valor ?? '').trim().toUpperCase();
  if (!s) return null;
  if (['SI', 'SÍ', 'YES', 'TRUE', '1', 'ACTIVO'].includes(s)) return true;
  if (['NO', 'FALSE', '0', 'INACTIVO'].includes(s)) return false;
  return null;
}

function parseFilas(rows: unknown[][]): FilaExcel[] {
  const filas: FilaExcel[] = [];
  // Fila 0 = encabezado, se omite
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codigo = String(row[0] ?? '').trim();
    const descripcion = String(row[1] ?? '').trim();
    if (!codigo && !descripcion) continue; // fila vacía
    filas.push({
      codigo,
      descripcion,
      precio: parseNumero(row[2]),
      costo: parseNumero(row[3]),
      stock: parseNumero(row[4]),
      activo: parseActivo(row[5]),
    });
  }
  return filas;
}

export function ImportarArticulosModal({ onClose, onImportado }: Props) {
  const { vendedor } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [filas, setFilas] = useState<FilaExcel[]>([]);
  const [parseError, setParseError] = useState('');
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });
  const [resultados, setResultados] = useState<FilaResultado[] | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setResultados(null);
    setFilas([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
        const parsed = parseFilas(rows);
        if (parsed.length === 0) {
          setParseError('No se encontraron filas válidas. Verifica que la primera fila sea el encabezado y que haya datos debajo.');
          return;
        }
        setFilas(parsed);
      } catch {
        setParseError('No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx o .xls).');
      }
    };
    reader.onerror = () => setParseError('Error al leer el archivo.');
    reader.readAsArrayBuffer(file);
  }

  async function handleImportar() {
    if (!vendedor?.empresa_id || filas.length === 0) return;
    setImportando(true);
    setResultados(null);
    setProgreso({ actual: 0, total: filas.length });

    const empresaId = vendedor.empresa_id;
    const results: FilaResultado[] = [];

    for (let idx = 0; idx < filas.length; idx++) {
      const fila = filas[idx];
      const numFila = idx + 2; // +2: encabezado + índice 1-based
      setProgreso({ actual: idx + 1, total: filas.length });

      if (!fila.codigo) {
        results.push({ fila: numFila, codigo: '—', estado: 'error', mensaje: 'Código vacío' });
        continue;
      }
      if (!fila.descripcion) {
        results.push({ fila: numFila, codigo: fila.codigo, estado: 'error', mensaje: 'Descripción vacía' });
        continue;
      }

      try {
        // RLS ya limita esta lectura a artículos de la propia empresa del
        // vendedor autenticado — si no aparece aquí, o no existe en ningún
        // lado, o existe pero pertenece a OTRA empresa (el INSERT de abajo
        // lo detectará por conflicto de llave primaria).
        const { data: existente, error: errSel } = await supabase
          .from('articulos')
          .select('id')
          .eq('id', fila.codigo)
          .maybeSingle();
        if (errSel) throw errSel;

        if (existente) {
          const updates: Record<string, unknown> = {
            descripcion: fila.descripcion,
            precio: fila.precio,
            costo: fila.costo,
            stock: fila.stock,
            updated_at: new Date().toISOString(),
          };
          if (fila.activo !== null) updates.activo = fila.activo;

          const { error } = await supabase.from('articulos').update(updates).eq('id', fila.codigo);
          if (error) throw error;
          results.push({ fila: numFila, codigo: fila.codigo, estado: 'actualizado', mensaje: fila.descripcion });
        } else {
          const { error } = await supabase.from('articulos').insert({
            id: fila.codigo,
            descripcion: fila.descripcion,
            precio: fila.precio,
            costo: fila.costo,
            stock: fila.stock,
            activo: fila.activo ?? true,
            empresa_id: empresaId,
          });
          if (error) throw error;
          results.push({ fila: numFila, codigo: fila.codigo, estado: 'creado', mensaje: fila.descripcion });
        }
      } catch (e: any) {
        const esDuplicado = e?.code === '23505' || String(e?.message || '').toLowerCase().includes('duplicate');
        results.push({
          fila: numFila,
          codigo: fila.codigo,
          estado: 'error',
          mensaje: esDuplicado
            ? 'Este código ya existe (posiblemente en otra empresa) y no se puede reasignar'
            : (e?.message || 'Error desconocido'),
        });
      }
    }

    setResultados(results);
    setImportando(false);
    onImportado?.();
  }

  function handleClose() {
    if (importando) return;
    onClose();
  }

  const creados = resultados?.filter(r => r.estado === 'creado').length ?? 0;
  const actualizados = resultados?.filter(r => r.estado === 'actualizado').length ?? 0;
  const errores = resultados?.filter(r => r.estado === 'error').length ?? 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Actualizar Artículos desde Excel</h3>
            <p className="text-sm text-gray-500 mt-0.5">Se actualizan los que ya existen y se crean los nuevos</p>
          </div>
          <button onClick={handleClose} disabled={importando} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">Formato esperado (mismo orden que la tabla de artículos)</p>
            <p className="font-mono text-xs bg-white border border-blue-100 rounded px-3 py-2 mt-1">
              Código | Descripción | Precio | Costo | Stock | Activo
            </p>
            <p className="text-xs text-blue-600 mt-1.5">
              La primera fila se omite (encabezado). Los decimales pueden ir con coma o con punto.
              La columna <strong>Activo</strong> es opcional (SI/NO, 1/0) — si la dejas vacía, no se
              modifica el estado activo de artículos ya existentes; los nuevos se crean como activos.
            </p>
          </div>

          <div
            onClick={() => !importando && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${importando ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-300 hover:bg-blue-50'} ${fileName ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
          >
            <UploadCloud className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            {fileName ? (
              <p className="text-sm font-semibold text-blue-700 flex items-center justify-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4" /> {fileName}
              </p>
            ) : (
              <p className="text-sm text-gray-500">Haz clic para seleccionar el archivo Excel (.xlsx o .xls)</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
              disabled={importando}
            />
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}

          {filas.length > 0 && !resultados && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                <strong>{filas.length}</strong> registros detectados
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Código</th>
                      <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                      <th className="px-3 py-2 text-right font-semibold">Precio</th>
                      <th className="px-3 py-2 text-right font-semibold">Costo</th>
                      <th className="px-3 py-2 text-right font-semibold">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 5).map((f, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono">{f.codigo}</td>
                        <td className="px-3 py-2">{f.descripcion}</td>
                        <td className="px-3 py-2 text-right">{f.precio.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{f.costo.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{f.stock}</td>
                      </tr>
                    ))}
                    {filas.length > 5 && (
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td colSpan={5} className="px-3 py-2 text-center text-gray-400 italic">
                          … y {filas.length - 5} registros más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importando && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Procesando {progreso.actual} de {progreso.total}...
            </div>
          )}

          {resultados && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold text-green-700 uppercase">Creados</p>
                  <p className="text-2xl font-black text-green-700">{creados}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold text-blue-700 uppercase">Actualizados</p>
                  <p className="text-2xl font-black text-blue-700">{actualizados}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold text-red-700 uppercase">Errores</p>
                  <p className="text-2xl font-black text-red-700">{errores}</p>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5">
                {resultados.filter(r => r.estado === 'error').map((r, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-50 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-400">Fila {r.fila}</span>
                    <span className="font-mono font-semibold">{r.codigo}</span>
                    <span className="text-red-700">{r.mensaje}</span>
                  </div>
                ))}
              </div>

              {(creados > 0 || actualizados > 0) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-800">
                    {creados + actualizados} artículos guardados correctamente.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={handleClose}
            disabled={importando}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {resultados ? 'Cerrar' : 'Cancelar'}
          </button>
          {!resultados && (
            <button
              onClick={handleImportar}
              disabled={importando || filas.length === 0}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {importando ? 'Importando…' : `Importar ${filas.length} registros`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
