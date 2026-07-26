import { BASE_LEGAL_LABELS, type ActividadTratamiento } from '../../types/lopdp'

interface EmpresaInfo {
    nombre: string
    ruc: string
}

function escapeHtml(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function campo(label: string, valor: string): string {
    return `<div class="campo"><span class="lbl">${label}</span><span class="val">${escapeHtml(valor) || '—'}</span></div>`
}

function bloqueActividad(a: ActividadTratamiento, indice: number): string {
    const transferenciaTerceros = a.hay_transferencia_terceros
        ? `Sí — ${a.terceros_detalle || 'sin detalle registrado'}`
        : 'No aplica'
    const transferenciaInternacional = a.transferencia_internacional
        ? `Sí — País: ${a.pais_transferencia || 'no especificado'}`
        : 'No aplica'

    return `
    <div class="actividad">
        <div class="actividad-hdr">
            <span class="num">${indice}</span>
            <span class="nombre">${escapeHtml(a.nombre)}</span>
        </div>
        <div class="grid">
            ${campo('Finalidad', a.finalidad)}
            ${campo('Base legal (Art. 7 LOPDP)', BASE_LEGAL_LABELS[a.base_legal] ?? a.base_legal)}
            ${a.base_legal_detalle ? campo('Detalle de la base legal', a.base_legal_detalle) : ''}
            ${campo('Categorías de datos tratados', a.categorias_datos?.join(', ') || '—')}
            ${campo('Categorías de titulares', a.categoria_titulares?.join(', ') || '—')}
            ${campo('Plazo de retención', a.plazo_retencion)}
            ${campo('Transferencia a terceros / encargados', transferenciaTerceros)}
            ${campo('Transferencia internacional', transferenciaInternacional)}
            ${a.medidas_seguridad ? campo('Medidas de seguridad', a.medidas_seguridad) : ''}
        </div>
    </div>`
}

export function imprimirReporteRAT(empresa: EmpresaInfo, actividades: ActividadTratamiento[]) {
    const fecha = new Date().toLocaleDateString('es-EC', {
        day: '2-digit', month: 'long', year: 'numeric',
    })

    const cuerpo = actividades.length
        ? actividades.map((a, i) => bloqueActividad(a, i + 1)).join('')
        : `<p class="vacio">No hay actividades de tratamiento registradas.</p>`

    const doc = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Registro de Actividades de Tratamiento — ${empresa.nombre}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:18px 22px}
  .hdr{border-bottom:3px solid #1e3a5f;padding-bottom:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end}
  .hdr-left .emp{font-size:15px;font-weight:bold;color:#1e3a5f}
  .hdr-left .ruc{font-size:10px;color:#555;margin-top:2px}
  .hdr-right{text-align:right}
  .hdr-right .titulo{font-size:13px;font-weight:bold;text-transform:uppercase;color:#1e3a5f}
  .hdr-right .sub{font-size:10px;color:#555;margin-top:3px}
  .hdr-right .gen{font-size:9px;color:#aaa;margin-top:2px}
  .legal{font-size:9px;color:#777;margin-bottom:16px;line-height:1.4}
  .actividad{border:1px solid #d5dbe6;border-radius:3px;margin-bottom:12px;page-break-inside:avoid}
  .actividad-hdr{background:#1e3a5f;color:#fff;padding:6px 10px;display:flex;align-items:center;gap:8px}
  .actividad-hdr .num{background:rgba(255,255,255,.2);border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;flex-shrink:0}
  .actividad-hdr .nombre{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.3px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
  .campo{padding:6px 10px;border-top:1px solid #eef0f5;border-right:1px solid #eef0f5}
  .campo:nth-child(2n){border-right:none}
  .lbl{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.3px;color:#8a93a6;font-weight:bold;margin-bottom:2px}
  .val{display:block;font-size:10.5px;color:#222;line-height:1.35}
  .vacio{color:#999;font-style:italic;padding:20px 0;text-align:center}
  .ftr{margin-top:20px;border-top:1px solid #ccc;padding-top:6px;font-size:9px;color:#aaa;display:flex;justify-content:space-between}
  @media print{body{padding:0}@page{margin:15mm;size:A4 portrait}.actividad{break-inside:avoid}}
</style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <div class="emp">${escapeHtml(empresa.nombre)}</div>
      <div class="ruc">RUC: ${escapeHtml(empresa.ruc)}</div>
    </div>
    <div class="hdr-right">
      <div class="titulo">Registro de Actividades de Tratamiento (RAT)</div>
      <div class="sub">${actividades.length} actividad(es) vigente(s)</div>
      <div class="gen">Generado: ${fecha}</div>
    </div>
  </div>
  <p class="legal">Documento elaborado en cumplimiento del Art. 38 del Reglamento General a la Ley Orgánica de Protección de Datos Personales (LOPDP) de Ecuador. El responsable del tratamiento de los datos aquí descritos es ${escapeHtml(empresa.nombre)}.</p>
  ${cuerpo}
  <div class="ftr">
    <span>Registro de Actividades de Tratamiento — ${escapeHtml(empresa.nombre)}</span>
    <span>${fecha}</span>
  </div>
</body>
</html>`

    const w = window.open('', '_blank', 'width=960,height=720')
    if (!w) { alert('Activa las ventanas emergentes para imprimir'); return }
    w.document.write(doc)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 600)
}
