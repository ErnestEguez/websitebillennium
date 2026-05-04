import jsPDF from 'jspdf';
import type { ProformaCompleta, Cliente, Empresa, Vendedor } from './supabase';
import { supabase } from './supabase';
import { getEmpresa } from './config';
import { proformaService } from './proformaService';

async function cargarImagenComoBase64(url: string): Promise<{ data: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve({
          data: canvas.toDataURL('image/jpeg'),
          width: img.width,
          height: img.height
        });
      } else {
        reject(new Error('No se pudo crear el contexto del canvas'));
      }
    };
    img.onerror = () => reject(new Error('Error al cargar la imagen'));
    img.src = url;
  });
}

export async function generarProformaPDF(proforma: ProformaCompleta, clienteParam?: Cliente | null, esPedido: boolean = false): Promise<Blob> {
  let empresa = null;

  if (proforma.empresa_id) {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', proforma.empresa_id)
      .maybeSingle();

    if (!error && data) {
      empresa = data;
    }
  }

  if (!empresa) {
    empresa = await getEmpresa();
  }

  if (!empresa) {
    throw new Error('No se pudo cargar los datos de la empresa');
  }

  const cliente = clienteParam || await proformaService.buscarCliente(proforma.ruc_cliente);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 15;

  if (empresa.logo_url) {
    try {
      const logo = await cargarImagenComoBase64(empresa.logo_url);
      const imageType = logo.data.includes('data:image/png') ? 'PNG' : 'JPEG';

      // Calcular alto proporcional para un ancho fijo de 40
      const logoWidth = 40;
      const logoHeight = (logo.height * logoWidth) / logo.width;

      doc.addImage(logo.data, imageType, pageWidth / 2 - (logoWidth / 2), yPos, logoWidth, logoHeight);
      yPos += logoHeight + 5;
    } catch (error) {
      console.warn('No se pudo cargar el logo:', error);
      yPos += 5;
    }
  } else {
    yPos += 5;
  }

  doc.setFontSize(20);
  doc.setTextColor(30, 64, 175);
  doc.text(empresa.nombre_comercial, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(12);
  doc.setTextColor(100, 116, 139);
  const tipoDoc = esPedido ? 'PEDIDO' : 'PROFORMA';
  doc.text(`${tipoDoc} N° ${proforma.numero || 'PENDIENTE'}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  const primerTelefono = empresa.telefonos.split(',')[0].trim();
  const primerCorreo = empresa.correos.split(',')[0].trim();

  doc.text(`RUC: ${empresa.ruc}`, 20, yPos);
  yPos += 5;
  doc.text(`Dirección: ${empresa.direccion}`, 20, yPos);
  yPos += 5;
  doc.text(`Teléfono: ${primerTelefono}`, 20, yPos);
  yPos += 5;
  doc.text(`Email: ${primerCorreo}`, 20, yPos);
  yPos += 10;

  doc.setDrawColor(37, 99, 235);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 10;

  const fecha = new Date(proforma.created_at).toLocaleDateString('es-EC', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMACIÓN DEL CLIENTE', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Cliente: ${proforma.nombre_cliente}`, 20, yPos);
  yPos += 5;
  if (cliente && (cliente as any).nombre_negocio) {
    doc.text(`Negocio: ${(cliente as any).nombre_negocio}`, 20, yPos);
    yPos += 5;
  }
  doc.text(`RUC/CI: ${proforma.ruc_cliente}`, 20, yPos);
  yPos += 5;
  doc.text(`Fecha: ${fecha}`, 20, yPos);
  yPos += 5;
  doc.text(`Vendedor: ${proforma.vendedor?.nombre || 'N/A'}`, 20, yPos);
  yPos += 10;

  if (proforma.forma_pago) {
    doc.text(`Forma de Pago: ${proforma.forma_pago}`, 20, yPos);
    yPos += 5;
  }

  if (proforma.observaciones) {
    doc.text(`Observaciones: ${proforma.observaciones}`, 20, yPos);
    yPos += 10;
  } else {
    yPos += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE ARTÍCULOS', 20, yPos);
  yPos += 7;

  doc.setFillColor(37, 99, 235);
  doc.rect(20, yPos, pageWidth - 40, 7, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('DESCRIPCIÓN', 22, yPos + 5);
  doc.text('CANT', pageWidth - 100, yPos + 5);
  doc.text('% IVA', pageWidth - 80, yPos + 5);
  doc.text('PRECIO', pageWidth - 55, yPos + 5);
  doc.text('SUBTOTAL', pageWidth - 30, yPos + 5);
  yPos += 10;

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  proforma.detalles?.forEach((detalle, index) => {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    const descripcion = detalle.descripcion.length > 50
      ? detalle.descripcion.substring(0, 50) + '...'
      : detalle.descripcion;

    doc.text(descripcion, 22, yPos);
    doc.text(detalle.cantidad.toString(), pageWidth - 100, yPos);
    doc.text(`${(detalle as any).tasa_iva ?? 15}%`, pageWidth - 80, yPos);
    doc.text(`$${detalle.precio.toFixed(2)}`, pageWidth - 55, yPos);
    doc.text(`$${detalle.subtotal.toFixed(2)}`, pageWidth - 30, yPos);
    yPos += 6;
  });

  yPos += 5;
  doc.setDrawColor(37, 99, 235);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Subtotal:', pageWidth - 80, yPos);
  doc.text(`$${proforma.subtotal.toFixed(2)}`, pageWidth - 30, yPos, { align: 'right' });
  yPos += 6;

  doc.text('Impuesto:', pageWidth - 80, yPos);
  doc.text(`$${proforma.impuesto.toFixed(2)}`, pageWidth - 30, yPos, { align: 'right' });
  yPos += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL A PAGAR:', pageWidth - 80, yPos);
  doc.text(`$${proforma.total.toFixed(2)}`, pageWidth - 30, yPos, { align: 'right' });
  yPos += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Representante Legal: ${empresa.representante_legal}`, 20, yPos);
  yPos += 5;
  doc.text('Validez de la proforma: 15 días desde su emisión', 20, yPos);
  yPos += 5;
  doc.text(`Documento generado: ${new Date().toLocaleString('es-EC')}`, 20, yPos);

  return doc.output('blob');
}

export async function descargarProformaPDF(proforma: ProformaCompleta, esPedido: boolean = false) {
  try {
    const blob = await generarProformaPDF(proforma, null, esPedido);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const tipoDoc = esPedido ? 'pedido' : 'proforma';
    a.download = `${tipoDoc}-${proforma.numero || 'borrador'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error al descargar PDF:', error);
    alert('Error al generar el PDF');
  }
}

export async function enviarProformaWhatsApp(proforma: ProformaCompleta, cliente: Cliente | null, vendedor: Vendedor | null, esPedido: boolean = false) {
  try {
    if (!cliente?.telefono) {
      alert('El cliente no tiene un número de teléfono registrado.');
      return;
    }

    const empresa = await getEmpresa();
    if (!empresa) {
      alert('No se pudo cargar los datos de la empresa.');
      return;
    }

    descargarProformaPDF(proforma, esPedido);

    const formaPagoTexto = proforma.forma_pago ? `\n💳 Forma de Pago: ${proforma.forma_pago}` : '';
    const observacionesTexto = proforma.observaciones ? `\n📋 Obs: ${proforma.observaciones}` : '';

    let detallesArticulos = '\n\n📦 ARTÍCULOS:\n';
    proforma.detalles?.forEach((detalle, index) => {
      detallesArticulos += `${index + 1}. ${detalle.descripcion}\n`;
      const tasaIva = (detalle as any).tasa_iva ?? 15;
      detallesArticulos += `   Cant: ${detalle.cantidad} x $${detalle.precio.toFixed(2)} (IVA ${tasaIva}%) = $${detalle.subtotal.toFixed(2)}\n`;
    });

    const telefonoVendedor = vendedor?.telefono || empresa.telefonos.split(',')[0].trim();
    const emailVendedor = vendedor?.email || empresa.correos.split(',')[0].trim();

    const tipoDocumento = esPedido ? 'PEDIDO' : 'PROFORMA';
    const autorizacionTexto = esPedido ? '\n\n✅ Por favor revise su pedido y si está conforme devuélvalo escribiendo "Autorizado" desde su móvil' : '';

    const mensaje = `Hola! 👋\n\n` +
      `Te envío el ${tipoDocumento} N° *${proforma.numero || 'PENDIENTE'}*\n\n` +
      `📄 Cliente: ${proforma.nombre_cliente}\n` +
      `💵 Subtotal: $${proforma.subtotal.toFixed(2)}\n` +
      `📊 Impuesto: $${proforma.impuesto.toFixed(2)}\n` +
      `💰 TOTAL A PAGAR: *$${proforma.total.toFixed(2)}*${formaPagoTexto}${observacionesTexto}${detallesArticulos}\n\n` +
      `Vendedor: ${vendedor?.nombre || empresa.representante_legal}\n` +
      `📧 ${emailVendedor}\n` +
      `📱 ${telefonoVendedor}${autorizacionTexto}`;

    const numeroCliente = cliente.telefono.replace(/\D/g, '');
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${numeroCliente}&text=${encodeURIComponent(mensaje)}`;

    setTimeout(() => {
      window.open(whatsappUrl, '_blank');
    }, 500);

    const primerTelefonoEmpresa = empresa.telefonos.split(',')[0].trim();
    if (primerTelefonoEmpresa) {
      setTimeout(() => {
        const numeroEmpresa = primerTelefonoEmpresa.replace(/\D/g, '');
        const mensajeGerencia = `📊 COPIA - Proforma enviada\n\n` +
          `Cliente: ${proforma.nombre_cliente} (${proforma.ruc_cliente})\n` +
          `Subtotal: $${proforma.subtotal.toFixed(2)}\n` +
          `Impuesto: $${proforma.impuesto.toFixed(2)}\n` +
          `Total: $${proforma.total.toFixed(2)}\n` +
          `Vendedor: ${vendedor?.nombre || empresa.representante_legal} (${telefonoVendedor})${formaPagoTexto}${observacionesTexto}`;

        const whatsappGerenciaUrl = `https://api.whatsapp.com/send?phone=${numeroEmpresa}&text=${encodeURIComponent(mensajeGerencia)}`;
        window.open(whatsappGerenciaUrl, '_blank');
      }, 2000);
    }
  } catch (error) {
    console.error('Error en enviarProformaWhatsApp:', error);
    alert('Error al preparar el envío. Por favor intenta de nuevo.');
  }
}

export async function enviarProformaEmail(proforma: ProformaCompleta, cliente: Cliente | null, vendedor: Vendedor | null, esPedido: boolean = false) {
  if (!cliente?.correo) {
    alert('El cliente no tiene un correo electrónico registrado.');
    return;
  }

  if (!vendedor?.email) {
    alert('El vendedor no tiene un correo electrónico registrado.');
    return;
  }

  const empresa = await getEmpresa();
  if (!empresa) {
    alert('No se pudo cargar los datos de la empresa.');
    return;
  }

  await descargarProformaPDF(proforma, esPedido);

  const tipoDoc = esPedido ? 'Pedido' : 'Proforma';
  const primerCorreoEmpresa = empresa.correos.split(',')[0].trim();

  const subject = encodeURIComponent(`${tipoDoc} ${proforma.numero || 'PENDIENTE'} - ${empresa.nombre_comercial}`);
  const body = encodeURIComponent(
    `Estimado/a ${proforma.nombre_cliente},\n\n` +
    `Adjunto encontrará el ${tipoDoc.toLowerCase()} N° ${proforma.numero || 'PENDIENTE'}:\n\n` +
    `Subtotal: $${proforma.subtotal.toFixed(2)}\n` +
    `Impuesto: $${proforma.impuesto.toFixed(2)}\n` +
    `TOTAL A PAGAR: $${proforma.total.toFixed(2)}\n\n` +
    `Vendedor: ${vendedor.nombre}\n` +
    `Para cualquier consulta:\n` +
    `Email: ${vendedor.email}\n` +
    `Teléfono: ${vendedor.telefono}\n\n` +
    `Saludos cordiales,\n${empresa.nombre_comercial}`
  );

  const destinatarios = `${cliente.correo}`;
  const cc = encodeURIComponent(`${vendedor.email},${primerCorreoEmpresa}`);

  const mailtoLink = `mailto:${destinatarios}?cc=${cc}&subject=${subject}&body=${body}`;

  setTimeout(() => {
    try {
      const link = document.createElement('a');
      link.href = mailtoLink;
      link.click();
    } catch (err) {
      console.error('Error abriendo cliente de correo:', err);
      alert(`No se pudo abrir el cliente de correo automáticamente.\n\nPor favor:\n1. El archivo PDF ya fue descargado\n2. Envíe manualmente un correo a: ${cliente.correo}\n3. Adjunte el archivo descargado\n4. Incluya en CC a: ${vendedor.email} y ${primerCorreoEmpresa}`);
    }
  }, 1000);
}
