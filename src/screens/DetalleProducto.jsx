import { useParams, useNavigate } from 'react-router-dom'
import { getCatalogo } from '../lib/db'
import { formatCOP, fechaCorta, provNombre } from '../lib/shared'

function Sparkline({ hist }) {
  if (!hist || hist.length < 2) return <p className="text-[#999] font-mono text-sm">Se necesita más de una compra para ver la evolución.</p>
  const W = 620, H = 150, pad = 30
  const vals = hist.flatMap(h => [h.costo, h.venta])
  const min = Math.min(...vals), max = Math.max(...vals)
  const x = i => pad + i * (W - 2 * pad) / (hist.length - 1)
  const y = v => H - pad - (v - min) / (max - min || 1) * (H - 2 * pad)
  const linea = (key, color) => (
    <g key={key}>
      <polyline points={hist.map((h, i) => `${x(i)},${y(h[key])}`).join(' ')} fill="none" stroke={color} strokeWidth="3" />
      {hist.map((h, i) => <circle key={i} cx={x(i)} cy={y(h[key])} r="4" fill={color} />)}
    </g>
  )
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-[#e0ddd5]">
        {linea('venta', '#1a6b3c')}{linea('costo', '#c0392b')}
        {hist.map((h, i) => <text key={i} x={x(i)} y={H - 8} fontSize="11" fill="#666" textAnchor="middle" fontFamily="monospace">{fechaCorta(h.fecha)}</text>)}
      </svg>
      <p className="text-xs text-[#666] font-mono mt-1">🔴 Costo (lo que paga al proveedor) · 🟢 Precio de venta</p>
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
        <div className="kpi"><div className="k-l">Veces comprado</div><div className="k-v">{prod.veces}</div></div>
      </div>

      <div className="sec-title">Evolución de precios</div>
      <div className="pcard"><Sparkline hist={hist} /></div>

      <div className="pcard">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Fecha', 'Costo', 'Precio venta', 'Variación costo'].map(h =>
              <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {hist.map((x, i) => {
                const prev = i > 0 ? hist[i - 1].costo : null
                const dif = prev ? (((x.costo - prev) / prev) * 100).toFixed(1) : null
                const col = prev ? (x.costo > prev ? '#c0392b' : x.costo < prev ? '#1a6b3c' : '#1a1a1a') : '#1a1a1a'
                return (
                  <tr key={i} className="border-b border-[#e0ddd5]">
                    <td className="px-3 py-2 font-mono">{fechaCorta(x.fecha)}</td>
                    <td className="px-3 py-2 font-mono">{formatCOP(x.costo)}</td>
                    <td className="px-3 py-2 font-mono">{formatCOP(x.venta)}</td>
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
