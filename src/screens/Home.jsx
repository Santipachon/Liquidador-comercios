import { useNavigate, useOutletContext } from 'react-router-dom'
import { getPendientes, creditosPorVencer, getBandeja, getFacturas } from '../lib/db'

// El Inicio sigue el CICLO del negocio:
// pedir (pendiente) → pedido → crédito → liquidar → inventario → reportes
const CARDS = [
  { to: '/pendientes', ico: '📋', t: 'Pendientes', d: 'Lo que piden los clientes y no hay' },
  { to: '/pedidos', ico: '🛒', t: 'Pedidos', d: 'Armar y enviar pedidos a proveedores', admin: true },
  { to: '/creditos', ico: '💳', t: 'Créditos', d: 'Pagos a proveedores y vencimientos', admin: true },
  { to: '/liquidar', ico: '🧾', t: 'Liquidar', d: 'Facturas que llegaron y poner precios', admin: true },
  { to: '/imprimir', ico: '🏷️', t: 'Imprimir etiquetas', d: 'Imprimir liquidaciones en la Phomemo' },
  { to: '/catalogo', ico: '📦', t: 'Inventario', d: 'Stock, precios y alertas', admin: true },
  { to: '/dashboard', ico: '📊', t: 'Reportes', d: 'Cómo va el negocio', admin: true },
]

export default function Home() {
  const nav = useNavigate()
  const { usuario } = useOutletContext()
  const esAdmin = usuario?.rol === 'admin'
  const cards = CARDS.filter(c => esAdmin || !c.admin)

  const pendientes = getPendientes()
  const pendAbiertos = pendientes.filter(p => p.estado === 'pendiente')
  const porAvisar = pendientes.filter(p => p.estado === 'llego')
  const creditos = esAdmin ? creditosPorVencer(3) : []
  const bandeja = esAdmin ? getBandeja() : []
  const porImprimir = getFacturas().filter(f => !f.impresoAt).length

  // "Qué me toca hoy": tareas accionables, en orden del ciclo
  const tareas = [
    pendAbiertos.length && { ico: '📋', n: pendAbiertos.length, t: 'pendiente(s) por conseguir', to: '/pendientes', color: '#8e44ad' },
    bandeja.length && { ico: '🧾', n: bandeja.length, t: 'factura(s) por liquidar', to: '/liquidar', color: '#2980b9' },
    porImprimir && { ico: '🏷️', n: porImprimir, t: 'factura(s) por imprimir', to: '/imprimir', color: '#d35400' },
    creditos.length && { ico: '⏰', n: creditos.length, t: 'crédito(s) por vencer', to: '/creditos', color: '#c0392b' },
    porAvisar.length && { ico: '📲', n: porAvisar.length, t: 'cliente(s) por avisar', to: '/pendientes', color: '#1a6b3c' },
  ].filter(Boolean)

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-3xl font-bold font-mono">Hola, {usuario?.nombre} 👋</h2>
        <p className="text-[#555] text-lg mt-1">{tareas.length ? 'Esto es lo que le toca hoy:' : 'Todo al día. ¿Qué desea hacer?'}</p>
      </div>

      {tareas.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {tareas.map((x, i) => (
            <button key={i} onClick={() => nav(x.to)}
              className="text-left bg-white border-l-[6px] px-4 py-3 hover:bg-[#faf9f6] transition-colors flex items-center gap-3"
              style={{ borderLeftColor: x.color }}>
              <span className="text-3xl">{x.ico}</span>
              <span>
                <span className="block text-2xl font-bold font-mono" style={{ color: x.color }}>{x.n}</span>
                <span className="block text-sm text-[#555]">{x.t}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Navegación principal — en el orden del ciclo del negocio */}
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-[#999] mb-2">El ciclo del negocio</p>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {cards.map(c => (
            <button key={c.to} onClick={() => nav(c.to)}
              className="text-left bg-white border-[3px] border-[#33302b] p-6 transition-all hover:bg-[#33302b] hover:-translate-y-1 group"
              style={{ minHeight: 130 }}>
              <div className="text-4xl mb-2">{c.ico}</div>
              <div className="text-xl font-bold group-hover:text-white">{c.t}</div>
              <div className="text-sm text-[#555] group-hover:text-[#ccc] mt-1">{c.d}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
