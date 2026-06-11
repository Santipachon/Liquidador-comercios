import { useNavigate, useOutletContext } from 'react-router-dom'
import { getPendientes, getFacturas, creditosPorVencer } from '../lib/db'
import { formatCOP, provNombre, fechaCorta } from '../lib/shared'

const CARDS = [
  { to: '/pendientes', ico: '🛒', t: 'Lo que pide la gente', d: 'Anotar lo que piden los clientes' },
  { to: '/catalogo', ico: '🔎', t: 'Catálogo de productos', d: 'Buscar productos y ver precios', admin: true },
  { to: '/pedidos', ico: '📋', t: 'Pedidos a proveedores', d: 'Armar las órdenes de compra', admin: true },
  { to: '/liquidar', ico: '🧾', t: 'Liquidar factura', d: 'Subir factura y calcular precios', admin: true },
  { to: '/dashboard', ico: '📊', t: 'Historial y reportes', d: 'Ver cómo va el negocio', admin: true },
]

export default function Home() {
  const nav = useNavigate()
  const { usuario } = useOutletContext()
  const esAdmin = usuario?.rol === 'admin'
  const cards = CARDS.filter(c => esAdmin || !c.admin)

  const pendientes = getPendientes()
  const pend = pendientes.filter(p => p.estado === 'pendiente').length
  const avisar = pendientes.filter(p => p.estado === 'llego').length
  const facturas = getFacturas()
  const ganMes = facturas.reduce((s, f) => s + (f.ganancia || 0), 0)
  const creditos = esAdmin ? creditosPorVencer(3) : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-mono">Hola, {usuario?.nombre} 👋</h2>
        <p className="text-[#666] text-sm">¿Qué desea hacer hoy?</p>
      </div>

      {creditos.length > 0 && (
        <div className="border-l-[5px] border-[#c0392b] bg-[#fdecea] px-4 py-3">
          <p className="font-mono font-bold text-[#c0392b] text-sm mb-1">⏰ {creditos.length} crédito(s) por vencer o vencido(s)</p>
          <ul className="text-sm text-[#7f1d1d] space-y-0.5">
            {creditos.slice(0, 4).map(c => (
              <li key={c.id} className="font-mono">
                {c.numero} · {provNombre(c.sigla)} · vence {fechaCorta(c.pago.vencimiento)}{' '}
                {c.diasRestantes < 0 ? `(vencido hace ${-c.diasRestantes} día/s)` : c.diasRestantes === 0 ? '(HOY)' : `(en ${c.diasRestantes} día/s)`}
              </li>
            ))}
          </ul>
          <button className="text-[#c0392b] font-mono text-xs font-semibold hover:underline mt-2" onClick={() => nav('/creditos')}>Ir a control de créditos →</button>
        </div>
      )}

      {esAdmin && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
          <div className="kpi" style={{ borderLeftColor: '#d4a017' }}>
            <div className="k-l">Pendientes</div><div className="k-v">{pend}</div>
          </div>
          <div className="kpi" style={{ borderLeftColor: '#c0392b' }}>
            <div className="k-l">Por avisar</div><div className="k-v text-[#c0392b]">{avisar}</div>
          </div>
          <div className="kpi" style={{ borderLeftColor: '#1a6b3c' }}>
            <div className="k-l">Ganancia acumulada</div><div className="k-v text-[#1a6b3c] text-xl">{formatCOP(ganMes)}</div>
          </div>
          <div className="kpi" style={{ borderLeftColor: '#2980b9' }}>
            <div className="k-l">Facturas</div><div className="k-v text-[#2980b9]">{facturas.length}</div>
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        {cards.map(c => (
          <button key={c.to} onClick={() => nav(c.to)}
            className="text-left bg-white border-[3px] border-[#1a1a1a] p-6 transition-all hover:bg-[#1a1a1a] hover:-translate-y-1 group">
            <div className="text-4xl mb-2">{c.ico}</div>
            <div className="text-xl font-bold group-hover:text-white">{c.t}</div>
            <div className="text-sm text-[#666] group-hover:text-[#bbb] mt-1">{c.d}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
