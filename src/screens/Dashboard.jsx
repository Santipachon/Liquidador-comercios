import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFacturas, getCatalogo, getPendientes, updatePendiente } from '../lib/db'
import { formatCOP, fechaCorta, provNombre, normalizar } from '../lib/shared'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const TH = h => <th key={h} className="bg-[#33302b] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>

function Bar({ rows, color }) {
  const max = Math.max(...rows.map(r => r.v), 1)
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 font-mono text-sm">
          <span className="w-44 shrink-0 truncate" title={r.l}>{r.l}</span>
          <span className="flex-1 bg-[#ececec] h-6 relative min-w-[40px]">
            <span className="barfill block h-full" style={{ width: `${Math.round(r.v / max * 100)}%`, background: color }} />
          </span>
          <span className="w-24 text-right shrink-0">{r.t}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const [, force] = useState(0)
  const refresh = () => force(n => n + 1)
  const [verTodo, setVerTodo] = useState(false)   // lista de variación de precios: colapsada / expandida

  const facturas = getFacturas()
  const catalogo = getCatalogo()
  const pendientes = getPendientes()

  if (facturas.length === 0) return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">📊 Reportes</h2>
      <div className="pcard text-center py-10 space-y-4">
        <p className="text-[#666]">Todavía no hay facturas liquidadas. Los reportes se llenan solos a medida que usa la plataforma.</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => nav('/liquidar')}>Liquidar una factura →</button>
        </div>
      </div>
    </div>
  )

  const totGan = facturas.reduce((s, f) => s + f.ganancia, 0)
  const totCost = facturas.reduce((s, f) => s + f.costoConIva, 0)
  const margenProm = totCost ? Math.round(totGan / totCost * 100) : 0
  const porAvisar = pendientes.filter(p => p.estado === 'llego')
  const pendAbiertos = pendientes.filter(p => p.estado === 'pendiente').length

  // Lo más pedido por los clientes (demanda) — agrupa todos los pendientes por producto
  const demanda = {}
  pendientes.forEach(p => { const k = normalizar(p.prod); (demanda[k] = demanda[k] || { nombre: p.prod, n: 0, und: 0 }); demanda[k].n++; demanda[k].und += p.cant || 0 })
  const masPedido = Object.values(demanda).sort((a, b) => b.n - a.n).slice(0, 8)

  // Variación de precios — el MAYOR salto entre compras consecutivas de todo el historial
  // (detecta errores aunque no sean la compra más reciente). Ordenado de más a menos fluctuante.
  const alertas = catalogo.filter(p => p.hist && p.hist.length >= 2).map(p => {
    const h = p.hist
    let best = null
    for (let i = 1; i < h.length; i++) {
      const ant = h[i - 1].costo, act = h[i].costo
      if (!ant) continue
      const dif = ((act - ant) / ant) * 100
      if (!best || Math.abs(dif) > Math.abs(best.dif)) best = { ant, act, dif }
    }
    return best ? { key: p.key, nombre: p.nombre, sigla: p.sigla, ...best } : null
  }).filter(a => a && Math.abs(a.dif) >= 0.5).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))
  const alertasMostradas = verTodo ? alertas.slice(0, 100) : alertas.slice(0, 8)

  // Inflación por proveedor — variación promedio de costo de sus productos
  const inflProv = {}
  catalogo.filter(p => p.hist && p.hist.length >= 2).forEach(p => {
    const h = p.hist; const ant = h[h.length - 2].costo, act = h[h.length - 1].costo
    if (!ant) return
    const s = p.sigla || '—'; inflProv[s] = inflProv[s] || { sum: 0, n: 0 }
    inflProv[s].sum += ((act - ant) / ant) * 100; inflProv[s].n++
  })
  const inflacion = Object.entries(inflProv).map(([s, v]) => ({ sigla: s, prom: v.sum / v.n, n: v.n })).sort((a, b) => b.prom - a.prom)

  // Sin resurtir hace mucho (> 90 días)
  const ahora = Date.now()
  const sinResurtir = catalogo.map(p => ({ ...p, dias: Math.floor((ahora - new Date(p.ultima_fecha).getTime()) / 86400000) }))
    .filter(p => p.dias > 90).sort((a, b) => b.dias - a.dias).slice(0, 8)

  // Compras por mes
  const mesMap = {}
  facturas.forEach(f => { const d = new Date(f.fecha); const k = `${d.getFullYear()}-${d.getMonth()}`; mesMap[k] = (mesMap[k] || 0) + f.costoConIva })
  const comprasMes = Object.keys(mesMap).sort().slice(-6).map(k => { const [y, m] = k.split('-'); return { l: `${MESES[+m]} ${y}`, v: mesMap[k], t: formatCOP(mesMap[k]) } })

  // Inversión por proveedor
  const provAgg = {}
  facturas.forEach(f => { const s = f.sigla || '—'; provAgg[s] = provAgg[s] || { n: 0, c: 0 }; provAgg[s].n++; provAgg[s].c += f.costoConIva })

  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold font-mono">📊 Reportes</h2>

      {/* KPIs */}
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
        <div className="kpi" style={{ borderLeftColor: '#2980b9' }}><div className="k-l">Total invertido (compras)</div><div className="k-v text-[#2980b9] text-xl">{formatCOP(totCost)}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#1a6b3c' }}><div className="k-l">Ganancia potencial</div><div className="k-v text-[#1a6b3c] text-xl">{formatCOP(totGan)}</div></div>
        <div className="kpi"><div className="k-l">Margen prom. (config.)</div><div className="k-v">{margenProm}%</div></div>
        <div className="kpi" style={{ borderLeftColor: '#8e44ad' }}><div className="k-l">Pendientes</div><div className="k-v text-[#8e44ad]">{pendAbiertos}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#c0392b' }}><div className="k-l">Por avisar</div><div className="k-v text-[#c0392b]">{porAvisar.length}</div></div>
      </div>
      <p className="text-xs text-[#999] font-mono mt-1">⚠ “Potencial” asume que se vende todo al precio calculado. La ganancia real llegará al integrar las ventas (Siigo).</p>

      {/* Clientes por avisar */}
      <div className="sec-title">📲 Clientes por avisar (su pedido llegó)</div>
      <div className="pcard overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Producto', 'Cliente', 'Teléfono', ''].map(TH)}</tr></thead>
          <tbody>
            {porAvisar.length === 0 ? <tr><td colSpan="4" className="px-3 py-3 text-[#999] font-mono text-sm">Nada por avisar ahora.</td></tr> :
              porAvisar.map(p => (
                <tr key={p.id} className="border-b border-[#e0ddd5]">
                  <td className="px-3 py-2 font-semibold">{p.prod}</td><td className="px-3 py-2">{p.cliente || '—'}</td>
                  <td className="px-3 py-2 font-mono">{p.tel || '—'}</td>
                  <td className="px-3 py-2"><button className="btn-plat py-1 px-2 text-xs border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => { updatePendiente(p.id, { estado: 'avisado' }); refresh() }}>📲 Avisé</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Lo más pedido por los clientes */}
      <div className="sec-title">🛒 Lo más pedido por los clientes <span className="text-[#999] normal-case tracking-normal">— qué conviene surtir</span></div>
      <div className="pcard overflow-x-auto">
        {masPedido.length === 0 ? <p className="text-[#999] font-mono text-sm">Aún no hay pendientes registrados.</p> : (
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Producto', 'Veces pedido', 'Unidades pedidas'].map(TH)}</tr></thead>
            <tbody>
              {masPedido.map((d, i) => (
                <tr key={i} className="border-b border-[#e0ddd5]">
                  <td className="px-3 py-2 font-semibold">{d.nombre}</td>
                  <td className="px-3 py-2 font-mono text-center"><b>{d.n}</b></td>
                  <td className="px-3 py-2 font-mono text-center">{d.und}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Variación de precios */}
      {alertas.length > 0 && <>
        <div className="sec-title">🚨 Productos que cambiaron de precio <span className="text-[#999] normal-case tracking-normal">— de más a menos fluctuante</span></div>
        <div className="pcard overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Producto', 'Prov.', 'Antes', 'Ahora', 'Variación', ''].map(TH)}</tr></thead>
            <tbody>
              {alertasMostradas.map((a, i) => (
                <tr key={i} onClick={() => nav('/catalogo/' + encodeURIComponent(a.key))} className="border-b border-[#e0ddd5] cursor-pointer hover:bg-[#faf9f6]" style={a.dif > 0 ? { background: '#fdecea', boxShadow: 'inset 4px 0 0 #c0392b' } : {}}>
                  <td className="px-3 py-2 font-semibold">{a.nombre}</td>
                  <td className="px-3 py-2 font-mono">{a.sigla}</td>
                  <td className="px-3 py-2 font-mono">{formatCOP(a.ant)}</td>
                  <td className="px-3 py-2 font-mono">{formatCOP(a.act)}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: a.dif > 0 ? '#c0392b' : '#1a6b3c' }}>{a.dif > 0 ? '▲ +' : '▼ '}{a.dif.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-[#2980b9] font-mono text-xs whitespace-nowrap">ver →</td>
                </tr>
              ))}
            </tbody>
          </table>
          {alertas.length > 8 && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button onClick={() => setVerTodo(v => !v)} className="btn-plat py-1.5 px-4 text-sm border-[#33302b] hover:bg-[#33302b] hover:text-white">
                {verTodo ? '▲ Ver menos' : `▼ Ver más — ${alertas.length} productos cambiaron de precio`}
              </button>
              {verTodo && alertas.length > 100 && <span className="text-xs text-[#999] font-mono">mostrando los 100 más fluctuantes de {alertas.length}</span>}
            </div>
          )}
          <p className="text-xs text-[#999] font-mono mt-2">Clic en una fila para ver su historial y la factura (PDF). El precio de venta se recalcula solo.</p>
        </div>
      </>}

      {/* Inflación por proveedor */}
      {inflacion.length > 0 && <>
        <div className="sec-title">📈 Cuánto sube cada proveedor <span className="text-[#999] normal-case tracking-normal">— para negociar</span></div>
        <div className="pcard overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Proveedor', 'Productos', 'Variación prom. de costo'].map(TH)}</tr></thead>
            <tbody>
              {inflacion.map((v, i) => (
                <tr key={i} className="border-b border-[#e0ddd5]">
                  <td className="px-3 py-2 font-semibold">{v.sigla} · {provNombre(v.sigla)}</td>
                  <td className="px-3 py-2 font-mono text-center">{v.n}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: v.prom > 0.5 ? '#c0392b' : v.prom < -0.5 ? '#1a6b3c' : '#666' }}>{v.prom > 0 ? '▲ +' : v.prom < 0 ? '▼ ' : ''}{v.prom.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {/* Sin resurtir hace mucho */}
      <div className="sec-title">⏳ Sin resurtir hace más de 3 meses</div>
      <div className="pcard overflow-x-auto">
        {sinResurtir.length === 0 ? <p className="text-[#999] font-mono text-sm">Todo se ha resurtido en los últimos 3 meses ✅</p> : (
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Producto', 'Prov.', 'Última compra', 'Hace'].map(TH)}</tr></thead>
            <tbody>
              {sinResurtir.map((p, i) => (
                <tr key={i} className="border-b border-[#e0ddd5]">
                  <td className="px-3 py-2 font-semibold">{p.nombre}</td>
                  <td className="px-3 py-2 font-mono">{p.sigla}</td>
                  <td className="px-3 py-2 font-mono">{fechaCorta(p.ultima_fecha)}</td>
                  <td className="px-3 py-2 font-mono text-[#8a6d0f]">{Math.floor(p.dias / 30)} mes(es)</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Compras por mes */}
      <div className="sec-title">📅 Compras por mes</div>
      <div className="pcard"><Bar rows={comprasMes} color="#2980b9" /></div>

      {/* Inversión por proveedor */}
      <div className="sec-title">🤝 Inversión por proveedor</div>
      <div className="pcard overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Proveedor', 'Facturas', 'Total comprado'].map(TH)}</tr></thead>
          <tbody>
            {Object.keys(provAgg).sort((a, b) => provAgg[b].c - provAgg[a].c).map(s => (
              <tr key={s} className="border-b border-[#e0ddd5]"><td className="px-3 py-2 font-semibold">{s} · {provNombre(s)}</td>
                <td className="px-3 py-2 font-mono text-center">{provAgg[s].n}</td><td className="px-3 py-2 font-mono">{formatCOP(provAgg[s].c)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-2"><button className="text-[#2980b9] font-mono text-sm hover:underline" onClick={() => nav('/historial')}>Ver historial completo de facturas →</button></div>
    </div>
  )
}
