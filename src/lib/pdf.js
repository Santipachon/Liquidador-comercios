import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCOP, fechaCorta, provNombre } from './shared'

// Genera y descarga el comprobante de solicitud de pedido en PDF.
export function generarComprobantePDF(pedido, config) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40
  const negro = [26, 26, 26]

  // ── Encabezado: datos del almacén (izquierda) ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...negro)
  doc.text(config.nombre || 'ALMACÉN EL ACERO', M, 50)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  const linsIzq = [
    config.nit ? `NIT: ${config.nit}` : '',
    config.propietario || '',
    config.direccion || '',
    [config.ciudad, config.telefono ? `Tel: ${config.telefono}` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean)
  linsIzq.forEach((t, i) => doc.text(t, M, 66 + i * 12))

  // ── Caja "ORDEN DE PEDIDO" (derecha) ──
  const bx = W - M - 200, bw = 200, by = 38, bh = 70
  doc.setDrawColor(...negro); doc.setLineWidth(1.2); doc.rect(bx, by, bw, bh)
  doc.setFillColor(...negro); doc.rect(bx, by, bw, 20, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255)
  doc.text('ORDEN DE PEDIDO', bx + bw / 2, by + 14, { align: 'center' })
  doc.setTextColor(...negro); doc.setFontSize(10)
  doc.text(pedido.numero, bx + bw / 2, by + 36, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90)
  doc.text(`Fecha: ${fechaCorta(pedido.fecha)}`, bx + 8, by + 52)
  doc.text(`Lugar: ${pedido.lugar || '—'}`, bx + 8, by + 64)

  // ── Proveedor ──
  let y = 116
  doc.setDrawColor(210); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); y += 16
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...negro)
  doc.text('PROVEEDOR', M, y)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(60)
  doc.text(`${pedido.sigla ? pedido.sigla + ' · ' : ''}${pedido.proveedorNombre || provNombre(pedido.sigla)}`, M + 80, y)
  if (pedido.nit) doc.text(`NIT: ${pedido.nit}`, M + 80, y + 12)
  y += 28

  // ── Tabla de ítems ──
  const conP = pedido.incluyePrecios
  const head = conP ? [['#', 'Código', 'Producto', 'Cant.', 'V. Unit.', 'Total']]
    : [['#', 'Código', 'Producto', 'Cantidad']]
  const body = pedido.items.map((it, i) => conP
    ? [i + 1, it.codigo || '—', it.nombre, it.cantidad, formatCOP(it.precio || 0), formatCOP((it.precio || 0) * it.cantidad)]
    : [i + 1, it.codigo || '—', it.nombre, it.cantidad])
  autoTable(doc, {
    startY: y, head, body, theme: 'grid', margin: { left: M, right: M },
    headStyles: { fillColor: negro, textColor: 255, fontSize: 9, halign: 'left' },
    bodyStyles: { fontSize: 9, textColor: 40 },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: conP
      ? { 0: { cellWidth: 24, halign: 'center' }, 1: { cellWidth: 70 }, 3: { cellWidth: 44, halign: 'center' }, 4: { halign: 'right', cellWidth: 70 }, 5: { halign: 'right', cellWidth: 75 } }
      : { 0: { cellWidth: 28, halign: 'center' }, 1: { cellWidth: 90 }, 3: { cellWidth: 80, halign: 'center' } },
  })

  // ── Totales + pago ──
  let fy = doc.lastAutoTable.finalY + 18
  const totalUnidades = pedido.items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0)
  const totalDinero = pedido.items.reduce((s, it) => s + (Number(it.precio) || 0) * (Number(it.cantidad) || 0), 0)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...negro)
  doc.text(`Total unidades: ${totalUnidades}`, M, fy)
  if (conP) {
    doc.setFontSize(12)
    doc.text(`TOTAL: ${formatCOP(totalDinero)}`, W - M, fy, { align: 'right' })
  }
  fy += 22

  // Forma de pago
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('FORMA DE PAGO:', M, fy)
  doc.setFont('helvetica', 'normal')
  let pagoTxt = pedido.pago?.tipo === 'credito'
    ? `Crédito a ${pedido.pago.dias} días  —  vence el ${fechaCorta(pedido.pago.vencimiento)}`
    : 'Contado'
  doc.text(pagoTxt, M + 100, fy)
  fy += 20

  if (pedido.observaciones) {
    doc.setFont('helvetica', 'bold'); doc.text('Observaciones:', M, fy)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(70)
    const obs = doc.splitTextToSize(pedido.observaciones, W - 2 * M - 90)
    doc.text(obs, M + 90, fy); fy += obs.length * 12 + 8
  }

  // ── Firma + pie ──
  fy = Math.max(fy + 30, 720)
  doc.setDrawColor(120); doc.setLineWidth(0.6)
  doc.line(M, fy, M + 200, fy)
  doc.setFontSize(8.5); doc.setTextColor(90); doc.setFont('helvetica', 'normal')
  doc.text('Firma / sello autorizado', M, fy + 12)
  doc.setFontSize(8); doc.setTextColor(150)
  doc.text('Comprobante de solicitud de pedido — no es factura de venta. Generado por la plataforma Almacén El Acero.',
    M, 815, { maxWidth: W - 2 * M })

  doc.save(`${pedido.numero}_${pedido.sigla || 'pedido'}.pdf`)
}
