export interface ColPrint {
    label: string
    key: string
    align?: 'left' | 'right' | 'center'
    width?: string
}

export function generarTablaHtml(
    columnas: ColPrint[],
    filas: Record<string, string | number | null | undefined>[],
    totales?: Partial<Record<string, string | number>>
): string {
    const ths = columnas.map(c =>
        `<th style="text-align:${c.align ?? 'left'};${c.width ? `width:${c.width}` : ''}">${c.label}</th>`
    ).join('')

    const trs = filas.map((f, i) =>
        `<tr class="${i % 2 === 1 ? 'alt' : ''}">${
            columnas.map(c =>
                `<td style="text-align:${c.align ?? 'left'}">${f[c.key] ?? ''}</td>`
            ).join('')
        }</tr>`
    ).join('')

    const foot = totales
        ? `<tfoot><tr>${columnas.map(c =>
            `<td style="text-align:${c.align ?? 'left'}">${totales[c.key] ?? ''}</td>`
        ).join('')}</tr></tfoot>`
        : ''

    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody>${foot}</table>`
}

interface PrintParams {
    empresa: { nombre: string; ruc: string }
    titulo: string
    periodo?: string
    html: string
    subtablas?: { titulo: string; html: string }[]
}

export function imprimirReporte({ empresa, titulo, periodo, html, subtablas }: PrintParams) {
    const fecha = new Date().toLocaleDateString('es-EC', {
        day: '2-digit', month: 'long', year: 'numeric',
    })

    const extra = subtablas?.map(s =>
        `<div class="subtabla"><h3>${s.titulo}</h3>${s.html}</div>`
    ).join('') ?? ''

    const doc = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${titulo} — ${empresa.nombre}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:18px 22px}
  .hdr{border-bottom:3px solid #1e3a5f;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
  .hdr-left .emp{font-size:15px;font-weight:bold;color:#1e3a5f}
  .hdr-left .ruc{font-size:10px;color:#555;margin-top:2px}
  .hdr-right{text-align:right}
  .hdr-right .titulo{font-size:13px;font-weight:bold;text-transform:uppercase;color:#1e3a5f}
  .hdr-right .periodo{font-size:10px;color:#555;margin-top:3px}
  .hdr-right .gen{font-size:9px;color:#aaa;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  thead tr{background:#1e3a5f;color:#fff}
  thead th{padding:5px 7px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;font-weight:bold}
  tbody tr.alt{background:#f4f6fb}
  tbody td{padding:4px 7px;border-bottom:1px solid #e2e6ee}
  tfoot tr{background:#dce4f0;border-top:2px solid #1e3a5f}
  tfoot td{padding:5px 7px;font-weight:bold}
  .subtabla{margin-top:20px}
  .subtabla h3{font-size:11px;text-transform:uppercase;color:#1e3a5f;border-bottom:1px solid #1e3a5f;padding-bottom:4px;margin-bottom:8px}
  .ftr{margin-top:20px;border-top:1px solid #ccc;padding-top:6px;font-size:9px;color:#aaa;display:flex;justify-content:space-between}
  @media print{body{padding:0}@page{margin:15mm;size:A4 portrait}}
</style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <div class="emp">${empresa.nombre}</div>
      <div class="ruc">RUC: ${empresa.ruc}</div>
    </div>
    <div class="hdr-right">
      <div class="titulo">${titulo}</div>
      ${periodo ? `<div class="periodo">${periodo}</div>` : ''}
      <div class="gen">Generado: ${fecha}</div>
    </div>
  </div>
  ${html}
  ${extra}
  <div class="ftr">
    <span>Finance Suite — Billennium System</span>
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
