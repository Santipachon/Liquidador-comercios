import { useNavigate, useOutletContext } from 'react-router-dom'
import { getPendientes, creditosPorVencer } from '../lib/db'
import { provNombre, fechaCorta } from '../lib/shared'

// El Inicio es el centro de navegación: botones grandes, uno por tarea.
const CARDS = [
  { to: '/pendientes', ico: '🛒', t: 'Lo que pide la gente', d: 'Anotar lo que piden los clientes' },
  { to: '/liquidar', ico: '🧾', t: 'Liquidar factura', d: 'Subir factura y calcular precios', admin: true },
  { to: '/pedidos', ico: '📋', t: 'Pedidos a proveedores', d: 'Armar y descargar el pedido', admin: true },
  { to: '/creditos', ico: '💳', t: 'Créditos', d: 'Pagos a proveedores y vencimientos', admin: true },
  { to: '/catalogo', ico: '🔎', t: 'Catálogo de productos', d: 'Buscar productos y ver precios', admin: true },
  { to: '/dashboard', ico: '📊', t: 'Reportes', d: 'Ver cómo va el negocio', admin: true },
]

export default function Home() {
  const nav = useNavigate()
  const { usuario } = useOutletContext()
  const esAdmin = usuario?.rol === 'admin'
  const cards = CARDS.filter(c => esAdmin || !c.admin)
  const creditos = esAdmin ? creditosPorVencer(3) : []
  const porAvisar = getPendientes().filter(p => p.estado === 'llego')

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-3xl font-bold font-mono">Hola, {usuario?.nombre} 👋</h2>
        <p className="text-[#555] text-lg mt-1">¿Qué desea hacer? Toque una opción.</p>
      </div>

      {/* Avisos accionables (solo lo importante, nada de relleno) */}
      {creditos.length > 0 && (
        <button onClick={() => nav('/creditos')}
          className="block w-full text-left border-l-[6px] border-[#c0392b] bg-[#fdecea] px-5 py-4 hover:bg-[#fbdbd7] transition-colors">
          <p className="font-mono font-bold text-[#c0392b] text-lg mb-1">⏰ {creditos.length} crédito(s) por vencer o vencido(s)</p>
          <p className="text-[#7f1d1d] font-mono text-sm">
            {creditos.slice(0, 2).map(c => `${provNombre(c.sigla)} vence ${fechaCorta(c.pago.vencimiento)}`).join(' · ')}
            {creditos.length > 2 ? ' …' : ''} — toque para ver
          </p>
        </button>
      )}
      {porAvisar.length > 0 && (
        <button onClick={() => nav('/dashboard')}
          className="block w-full text-left border-l-[6px] border-[#1a6b3c] bg-[#f0fdf4] px-5 py-4 hover:bg-[#dcfce7] transition-colors">
          <p className="font-mono font-bold text-[#1a6b3c] text-lg">📲 {porAvisar.length} cliente(s) por avisar — su pedido llegó</p>
        </button>
      )}

      {/* Botones grandes (la navegación principal) */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        {cards.map(c => (
          <button key={c.to} onClick={() => nav(c.to)}
            className="text-left bg-white border-[3px] border-[#1a1a1a] p-7 transition-all hover:bg-[#1a1a1a] hover:-translate-y-1 group"
            style={{ minHeight: 150 }}>
            <div className="text-5xl mb-3">{c.ico}</div>
            <div className="text-2xl font-bold group-hover:text-white">{c.t}</div>
            <div className="text-base text-[#555] group-hover:text-[#ccc] mt-1">{c.d}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
