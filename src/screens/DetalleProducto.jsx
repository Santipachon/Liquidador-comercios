import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCatalogo } from '../lib/db'
import { supabase } from '../lib/supabase'
import { formatCOP, fechaCorta, provNombre } from '../lib/shared'

const redLabel = r => r === 'auto' ? 'Auto ⚡' : r === 'exacto' ? 'Exacto' : r ? `múltiplo de ${Number(r).toLocaleString('es-CO')}` : '—'

// Abre el PDF de la factura (bucket privado → URL firmada temporal, solo para usuarios logueados)
async function verPdf(pdf_path) {
  if (!pdf_path) return
  const { data, error } = await supabase.storage.from('facturas-pdf').createSignedUrl(pdf_path, 300)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  else alert('No se pudo abrir el PDF de la factura.' + (error ? ` (${error.message})` : ''))
}

// Calcula marcas "bonitas" para el eje Y (ej: 3000,3250,3500,3750,4000) según el rango real
function ticksBonitos(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1 }
  const rawStep = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks = []
  for (let v = start; v <= end + step * 0.001; v += step) ticks.push(Math.round(v))
  return ticks
}

function Grafico({ hist }) {
  const [hover, setHover] = useState(null)
  if (!hist || hist.length < 2) return <p className="text-[#999] font-mono text-sm">Se necesita más de una compra para ver la evolución.</p>

  const W = 640, H = 190, padL = 58, padR = 14, padT = 14, padB = 28
  const vals = hist.flatMap(h => [h.costo, h.venta])
  const ticks = ticksBonitos(Math.min(...vals), Math.max(...vals))
  const dMin = ticks[0], dMax = ticks[ticks.length - 1]
  const x = i => padL + i * (W - padL - padR) / (hist.length - 1)
  const y = v => padT + (dMax - v) / (dMax - dMin || 1) * (H - padT - padB)
  const fmtY = n => n.toLocaleString('es-CO')

  const linea = (key, color) => (
    <g key={key}>
      <polyline points={hist.map((h, i) => `${x(i)},${y(h[key])}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" />
      {hist.map((h, i) => <circle key={i} cx={x(i)} cy={y(h[key])} r={hover === i ? 6 : 4} fill={color} stroke="#fff" strokeWidth={hover === i ? 1.5 : 0} />)}
    </g>
  )
  const h = hover != null ? hist[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-[#e0ddd5]" style={{ overflow: 'visible' }}>
        {/* Guías horizontales del eje Y (dinámicas) */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#eee" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 3} fontSize="10" fill="#999" textAnchor="end" fontFamily="monospace">{fmtY(t)}</text>
          </g>
        ))}
        {/* Ejes */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#33302b" strokeWidth="1" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#33302b" strokeWidth="1" />
        {/* Guía vertical en hover */}
        {hover != null && <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="#bbb" strokeWidth="1" strokeDasharray="3 3" />}
        {linea('venta', '#1a6b3c')}{linea('costo', '#c0392b')}
        {/* Zonas de detección para el tooltip */}
        {hist.map((_, i) => {
          const w = (W - padL - padR) / hist.length
          return <rect key={i} x={x(i) - w / 2} y={padT} width={w} height={H - padT - padB}
            fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)} style={{ cursor: 'pointer' }} />
        })}
        {/* Fechas eje X */}
        {hist.map((hh, i) => <text key={i} x={x(i)} y={H - 9} fontSize="10" fill={hover === i ? '#33302b' : '#999'} textAnchor="middle" fontFamily="monospace">{fechaCorta(hh.fecha)}</text>)}
      </svg>

      {h && (
        <div className="absolute z-20 bg-white border-2 border-[#33302b] text-xs font-mono px-3 py-2 shadow-xl pointer-events-none"
          style={{ left: `${x(hover) / W * 100}%`, top: `${Math.min(y(h.costo), y(h.venta)) / H * 100}%`, transform: 'translate(-50%, calc(-100% - 12px))', minWidth: 150 }}>
          <div className="font-bold text-[#33302b] mb-1 border-b border-[#e0ddd5] pb-1">{fechaCorta(h.fecha)}</div>
          {h.cantidad != null && <div className="text-[#33302b]">Llegaron: <b>{h.cantidad}</b> und</div>}
          <div className="text-[#c0392b]">Costo: {formatCOP(h.costo)}</div>
          {h.margen != null && <div className="text-[#555]">Margen: <b>{h.margen}%</b></div>}
          {h.redondeo != null && <div className="text-[#999]">Redondeo: {redLabel(h.redondeo)}</div>}
          <div className="text-[#1a6b3c]">Venta: <b>{formatCOP(h.venta)}</b></div>
        </div>
      )}
      <p className="text-xs text-[#666] font-mono mt-1"><span className="text-[#c0392b]">●</span> Costo · <span className="text-[#1a6b3c]">●</span> Precio de venta — pase el mouse o toque un punto para ver el detalle</p>
    </div>
  )
}

export default function DetalleProducto() {
  const { key } = useParams()
  const nav = useNavigate()
  const prod = getCatalogo().find(p => p.key === decodeURIComponent(key))

  if (!prod) return (
    <div className="pcard">
      <p className="text-[#666]">Producto no encontrado.</p>
      <button className="btn-plat mt-3" onClick={() => nav('/catalogo')}>← Volver al catálogo</button>
    </div>
  )

  const hist = prod.hist || []
  const totalUnidades = hist.reduce((s, x) => s + (x.cantidad || 0), 0)

  return (
    <div className="space-y-5">
      <button className="text-[#2980b9] font-mono text-sm hover:underline" onClick={() => nav('/catalogo')}>← Volver al catálogo</button>
      <div className="pcard">
        <h2 className="text-xl font-bold">{prod.nombre}</h2>
        <p className="text-sm text-[#666] font-mono mt-1">
          Proveedor: {provNombre(prod.sigla)} ({prod.sigla})
          {prod.codigo && <> · Código proveedor: <span className="font-bold">{prod.codigo}</span></>}
          {' '}· Código interno: <span className="font-bold">{prod.codigo_interno}</span> · {prod.veces} compras
        </p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        <div className="kpi" style={{ borderLeftColor: '#c0392b' }}><div className="k-l">Último costo</div><div className="k-v text-xl">{formatCOP(prod.ultimo_costo)}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#1a6b3c' }}><div className="k-l">Precio venta</div><div className="k-v text-xl text-[#1a6b3c]">{formatCOP(prod.ultimo_venta)}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#2980b9' }}><div className="k-l">Unidades acumuladas</div><div className="k-v text-xl text-[#2980b9]">{totalUnidades}</div></div>
        <div className="kpi"><div className="k-l">Veces comprado</div><div className="k-v">{prod.veces}</div></div>
      </div>

      <div className="sec-title">Evolución de precios y cantidades</div>
      <div className="pcard"><Grafico hist={hist} /></div>

      <div className="pcard">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Fecha', 'Unid.', 'Costo', 'Margen', 'Precio venta', 'Variación costo', 'Factura'].map(h =>
              <th key={h} className="bg-[#33302b] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {hist.map((x, i) => {
                const prev = i > 0 ? hist[i - 1].costo : null
                const dif = prev ? (((x.costo - prev) / prev) * 100).toFixed(1) : null
                const col = prev ? (x.costo > prev ? '#c0392b' : x.costo < prev ? '#1a6b3c' : '#33302b') : '#33302b'
                return (
                  <tr key={i} className="border-b border-[#e0ddd5]">
                    <td className="px-3 py-2 font-mono">{fechaCorta(x.fecha)}</td>
                    <td className="px-3 py-2 font-mono text-center">{x.cantidad ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{formatCOP(x.costo)}</td>
                    <td className="px-3 py-2 font-mono text-center">{x.margen != null ? x.margen + '%' : '—'}</td>
                    <td className="px-3 py-2 font-mono text-[#1a6b3c]">{formatCOP(x.venta)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: col }}>{dif ? (x.costo > prev ? '▲ +' : '') + dif + '%' : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {x.pdf_path
                        ? <button onClick={() => verPdf(x.pdf_path)} className="text-[#2980b9] hover:underline font-mono text-xs" title={'Factura ' + (x.factura || '')}>📄 Ver</button>
                        : <span className="text-[#ccc]">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
