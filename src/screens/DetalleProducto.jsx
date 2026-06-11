import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCatalogo } from '../lib/db'
import { formatCOP, fechaCorta, provNombre } from '../lib/shared'

const redLabel = r => r === 'auto' ? 'Auto ⚡' : r === 'exacto' ? 'Exacto' : r ? `múltiplo de ${Number(r).toLocaleString('es-CO')}` : '—'

function Grafico({ hist }) {
  const [hover, setHover] = useState(null)
  if (!hist || hist.length < 2) return <p className="text-[#999] font-mono text-sm">Se necesita más de una compra para ver la evolución.</p>

  const W = 620, H = 160, pad = 30
  const vals = hist.flatMap(h => [h.costo, h.venta])
  const min = Math.min(...vals), max = Math.max(...vals)
  const x = i => pad + i * (W - 2 * pad) / (hist.length - 1)
  const y = v => H - pad - (v - min) / (max - min || 1) * (H - 2 * pad)
  const linea = (key, color) => (
    <g key={key}>
      <polyline points={hist.map((h, i) => `${x(i)},${y(h[key])}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" />
      {hist.map((h, i) => <circle key={i} cx={x(i)} cy={y(h[key])} r={hover === i ? 6 : 4} fill={color} />)}
    </g>
  )
  const h = hover != null ? hist[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-[#e0ddd5]" style={{ overflow: 'visible' }}>
        {hover != null && <line x1={x(hover)} y1={pad - 6} x2={x(hover)} y2={H - pad} stroke="#ddd" strokeWidth="1" />}
        {linea('venta', '#1a6b3c')}{linea('costo', '#c0392b')}
        {hist.map((h, i) => (
          // Zona de detección amplia e invisible para activar el tooltip fácil
          <rect key={i} x={x(i) - (W - 2 * pad) / hist.length / 2} y="0" width={(W - 2 * pad) / hist.length} height={H}
            fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: 'pointer' }} />
        ))}
        {hist.map((h, i) => <text key={i} x={x(i)} y={H - 8} fontSize="11" fill={hover === i ? '#1a1a1a' : '#999'} textAnchor="middle" fontFamily="monospace">{fechaCorta(h.fecha)}</text>)}
      </svg>

      {h && (
        <div className="absolute z-20 bg-[#1a1a1a] text-white text-xs font-mono px-3 py-2 shadow-xl pointer-events-none"
          style={{ left: `${x(hover) / W * 100}%`, top: `${Math.min(y(h.costo), y(h.venta)) / H * 100}%`, transform: 'translate(-50%, calc(-100% - 10px))', minWidth: 150 }}>
          <div className="font-bold text-[#fde68a] mb-1">{fechaCorta(h.fecha)}</div>
          {h.cantidad != null && <div>Llegaron: <b>{h.cantidad}</b> und</div>}
          <div className="text-[#f8a]">Costo: {formatCOP(h.costo)}</div>
          {h.margen != null && <div>Margen: <b>{h.margen}%</b></div>}
          {h.redondeo != null && <div className="text-[#aaa]">Redondeo: {redLabel(h.redondeo)}</div>}
          <div className="text-[#86efac]">Venta: <b>{formatCOP(h.venta)}</b></div>
        </div>
      )}
      <p className="text-xs text-[#666] font-mono mt-1">🔴 Costo · 🟢 Precio de venta — <span className="text-[#1a1a1a]">pase el mouse o toque un punto</span> para ver el detalle</p>
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
            <thead><tr>{['Fecha', 'Unid.', 'Costo', 'Margen', 'Precio venta', 'Variación costo'].map(h =>
              <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {hist.map((x, i) => {
                const prev = i > 0 ? hist[i - 1].costo : null
                const dif = prev ? (((x.costo - prev) / prev) * 100).toFixed(1) : null
                const col = prev ? (x.costo > prev ? '#c0392b' : x.costo < prev ? '#1a6b3c' : '#1a1a1a') : '#1a1a1a'
                return (
                  <tr key={i} className="border-b border-[#e0ddd5]">
                    <td className="px-3 py-2 font-mono">{fechaCorta(x.fecha)}</td>
                    <td className="px-3 py-2 font-mono text-center">{x.cantidad ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{formatCOP(x.costo)}</td>
                    <td className="px-3 py-2 font-mono text-center">{x.margen != null ? x.margen + '%' : '—'}</td>
                    <td className="px-3 py-2 font-mono text-[#1a6b3c]">{formatCOP(x.venta)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: col }}>{dif ? (x.costo > prev ? '▲ +' : '') + dif + '%' : '—'}</td>
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
