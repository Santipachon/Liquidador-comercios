import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFacturas, getCatalogo, getPendientes, updatePendiente, sembrarEjemplos } from '../lib/db'
import { formatCOP, fechaCorta, provNombre } from '../lib/shared'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function Bar({ rows, color }) {
  const max = Math.max(...rows.map(r => r.v), 1)
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 font-mono text-sm">
          <span className="w-40 shrink-0 truncate" title={r.l}>{r.l}</span>
          <span className="flex-1 bg-[#ececec] h-6 relative">
            <span className="barfill block h-full" style={{ width: `${Math.round(r.v / max * 100)}%`, background: color }} />
          </span>
          <span className="w-28 text-right shrink-0">{r.t}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const [, force] = useState(0)
  const refresh = () => force(n => n + 1)

  const facturas = getFacturas()
  const catalogo = getCatalogo()
  const pendientes = getPendientes()

  if (facturas.length === 0) {
    return (
      <div className="space-y-5">
        <h2 className="text-2xl font-bold font-mono">📊 Historial y reportes</h2>
        <div className="pcard text-center py-10 space-y-4">
          <p className="text-[#666]">Todavía no hay facturas liquidadas. El dashboard se llena solo a medida que usa la plataforma.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => nav('/liquidar')}>Liquidar una factura →</button>
            <button className="btn-plat border-[#8e44ad] text-[#8e44ad] hover:bg-[#8e44ad] hover:text-white" onClick={() => { sembrarEjemplos(); refresh() }}>Cargar datos de ejemplo</button>
          </div>
        </div>
      </div>
    )
  }

  const totGan = facturas.reduce((s, f) => s + f.ganancia, 0)
  const totCost = facturas.reduce((s, f) => s + f.costoConIva, 0)
  const margenProm = totCost ? Math.round(totGan / totCost * 100) : 0
  const porAvisar = pendientes.filter(p => p.estado === 'llego')
  const pendAbiertos = pendientes.filter(p => p.estado === 'pendiente').length

  // Compras por mes
  const mesMap = {}
  facturas.forEach(f => { const d = new Date(f.fecha); const k = `${d.getFullYear()}-${d.getMonth()}`; mesMap[k] = (mesMap[k] || 0) + f.costoConIva })
  const comprasMes = Object.keys(mesMap).sort().slice(-6).map(k => {
    const [y, m] = k.split('-'); return { l: `${MESES[+m]} ${y}`, v: mesMap[k], t: formatCOP(mesMap[k]) }
  })

  // Top productos
  const topProd = [...catalogo].sort((a, b) => b.veces - a.veces).slice(0, 5).map(p => ({ l: p.nombre, v: p.veces, t: p.veces + ' compras' }))

  // Proveedores
  const provAgg = {}
  facturas.forEach(f => { const s = f.sigla || '—'; provAgg[s] = provAgg[s] || { n: 0, c: 0 }; provAgg[s].n++; provAgg[s].c += f.costoConIva })

  // Alertas de subida de precio
  const alertas = catalogo.filter(p => p.hist && p.hist.length >= 2).map(p => {
    const h = p.hist; const ant = h[h.length - 2].costo, act = h[h.length - 1].costo
    return { nombre: p.nombre, ant, act, dif: ant ? ((act - ant) / ant) * 100 : 0 }
  }).filter(a => Math.abs(a.dif) >= 0.5).sort((a, b) => b.dif - a.dif).slice(0, 6)

  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold font-mono">📊 Historial y reportes</h2>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
        <div className="kpi" style={{ borderLeftColor: '#2980b9' }}><div className="k-l">Compras totales</div><div className="k-v text-[#2980b9] text-xl">{formatCOP(totCost)}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#1a6b3c' }}><div className="k-l">Ganancia estimada</div><div className="k-v text-[#1a6b3c] text-xl">{formatCOP(totGan)}</div></div>
        <div className="kpi"><div className="k-l">Margen promedio</div><div className="k-v">{margenProm}%</div></div>
        <div className="kpi" style={{ borderLeftColor: '#8e44ad' }}><div className="k-l">Pendientes</div><div className="k-v text-[#8e44ad]">{pendAbiertos}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#c0392b' }}><div className="k-l">Por avisar</div><div className="k-v text-[#c0392b]">{porAvisar.length}</div></div>
      </div>

      <div className="sec-title">📈 Compras por mes</div>
      <div className="pcard"><Bar rows={comprasMes} color="#2980b9" /></div>

      <div className="sec-title">🏆 Productos más comprados</div>
      <div className="pcard">{topProd.length ? <Bar rows={topProd} color="#1a6b3c" /> : <p className="text-[#999] font-mono text-sm">Sin datos.</p>}</div>

      {alertas.length > 0 && <>
        <div className="sec-title">🚨 Variación de precios</div>
        <div className="pcard overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Producto', 'Antes', 'Ahora', 'Variación'].map(h => <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {alertas.map((a, i) => (
                <tr key={i} className="border-b border-[#e0ddd5]" style={a.dif > 0 ? { background: '#fdecea', boxShadow: 'inset 4px 0 0 #c0392b' } : {}}>
                  <td className="px-3 py-2 font-semibold">{a.nombre}</td>
                  <td className="px-3 py-2 font-mono">{formatCOP(a.ant)}</td>
                  <td className="px-3 py-2 font-mono">{formatCOP(a.act)}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: a.dif > 0 ? '#c0392b' : '#1a6b3c' }}>{a.dif > 0 ? '▲ +' : '▼ '}{a.dif.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      <div className="sec-title">🤝 Proveedores</div>
      <div className="pcard overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Proveedor', 'Facturas', 'Total comprado'].map(h => <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {Object.keys(provAgg).map(s => (
              <tr key={s} className="border-b border-[#e0ddd5]"><td className="px-3 py-2 font-semibold">{s} · {provNombre(s)}</td>
                <td className="px-3 py-2 font-mono text-center">{provAgg[s].n}</td><td className="px-3 py-2 font-mono">{formatCOP(provAgg[s].c)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sec-title">🧾 Últimas facturas</div>
      <div className="pcard overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Factura', 'Prov.', 'Fecha', 'Prods', 'Costo', 'Ganancia', ''].map(h => <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {facturas.slice(0, 8).map(f => (
              <tr key={f.id} className="border-b border-[#e0ddd5]">
                <td className="px-3 py-2 font-mono font-semibold">{f.numero}</td>
                <td className="px-3 py-2 font-mono">{f.sigla}</td>
                <td className="px-3 py-2 font-mono">{fechaCorta(f.fecha)}</td>
                <td className="px-3 py-2 font-mono text-center">{f.num_productos}</td>
                <td className="px-3 py-2 font-mono">{formatCOP(f.costoConIva)}</td>
                <td className="px-3 py-2 font-mono text-[#1a6b3c]">{formatCOP(f.ganancia)}</td>
                <td className="px-3 py-2"><button className="text-[#2980b9] font-mono text-xs hover:underline" onClick={() => nav('/historial')}>Ver →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sec-title">📲 Clientes por avisar (su pedido llegó)</div>
      <div className="pcard overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Producto', 'Cliente', 'Teléfono', ''].map(h => <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
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
    </div>
  )
}
