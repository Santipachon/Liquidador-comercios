import { useState } from 'react'
import { getCatalogo, getPendientes, addPendiente, updatePendiente, deletePendiente } from '../lib/db'
import { normalizar, formatCOP, PROVEEDORES } from '../lib/shared'

const PILL = {
  pendiente: 'bg-[#fffbe6] text-[#8a6d0f] border-[#d4a017]',
  pedido: 'bg-[#eef6fb] text-[#2980b9] border-[#2980b9]',
  llego: 'bg-[#f0fdf4] text-[#1a6b3c] border-[#86efac]',
  avisado: 'bg-[#f3eafa] text-[#8e44ad] border-[#8e44ad]',
}
const PILL_TXT = { pendiente: 'Pendiente', pedido: 'Pedido', llego: 'Llegó ✓', avisado: 'Avisado' }

export default function Pendientes() {
  const [, force] = useState(0)
  const refresh = () => force(n => n + 1)

  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null) // {nombre, sigla, libre}
  const [cant, setCant] = useState(1)
  const [cliente, setCliente] = useState('')
  const [tel, setTel] = useState('')

  const catalogo = getCatalogo()
  const pendientes = getPendientes()

  const t = normalizar(q.trim())
  const matches = t ? catalogo.filter(p => normalizar(p.nombre).includes(t)).slice(0, 7) : []

  function elegir(p) { setSel({ nombre: p.nombre, sigla: p.sigla, codigo: p.codigo || '' }); setQ(p.nombre) }
  function elegirLibre() { setSel({ nombre: q.trim(), sigla: '', codigo: '', libre: true }); }

  function agregar() {
    if (!sel) return
    addPendiente({ prod: sel.nombre, codigo: sel.codigo || '', cant: parseInt(cant) || 1, cliente: cliente.trim(), tel: tel.trim(), sigla: sel.sigla || '—' })
    setSel(null); setQ(''); setCant(1); setCliente(''); setTel('')
    refresh()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold font-mono">🛒 Lo que pide la gente</h2>

      <div className="pcard space-y-3">
        <h3 className="font-mono font-semibold text-lg">➕ Cliente pidió…</h3>
        <div className="relative">
          <input className="input-plat" placeholder="🔍 Escriba el producto (ej: rodamiento, tuerca, aceite)…"
            value={q} onChange={e => { setQ(e.target.value); setSel(null) }} autoComplete="off" />
          {q.trim() && !sel && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-[#1a1a1a] z-20 max-h-72 overflow-y-auto shadow-xl">
              {matches.map((p, i) => (
                <button key={i} onClick={() => elegir(p)}
                  className="block w-full text-left px-3 py-2.5 border-b border-[#eee] hover:bg-[#fffbe6]">
                  <span className="block font-semibold text-sm">{p.nombre}</span>
                  <span className="block text-xs text-[#999] font-mono">{p.sigla} · {formatCOP(p.ultimo_venta)} · {p.veces} compras</span>
                </button>
              ))}
              <button onClick={elegirLibre} className="block w-full text-left px-3 py-2.5 bg-[#fafafa] hover:bg-[#fffbe6]">
                <span className="block font-semibold text-sm">➕ Usar “{q.trim()}” (texto libre)</span>
                <span className="block text-xs text-[#999] font-mono">no está en el catálogo</span>
              </button>
            </div>
          )}
        </div>

        {sel && (
          <div className="space-y-3">
            <div className="bg-[#f0fdf4] border-2 border-[#86efac] px-4 py-3 font-semibold">{sel.nombre}
              {!sel.libre && <span className="text-[#999] font-normal text-sm"> · {sel.sigla}</span>}</div>
            <div className="flex gap-3 flex-wrap items-end">
              <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Cantidad</span>
                <input type="number" min="1" className="input-plat w-24" value={cant} onChange={e => setCant(e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Cliente (opcional)</span>
                <input className="input-plat w-44" placeholder="Nombre" value={cliente} onChange={e => setCliente(e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Teléfono (para avisar)</span>
                <input className="input-plat w-40" placeholder="3xx ..." value={tel} onChange={e => setTel(e.target.value)} /></label>
              <button className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={agregar}>Agregar pendiente</button>
            </div>
          </div>
        )}
        <p className="text-xs text-[#8a6d0f] bg-[#fffbe6] border border-dashed border-[#d4a017] px-3 py-2 font-mono">
          🎤 Próxima iteración: botón de voz para dictar. El autocompletado sale del catálogo que crece con cada factura.
        </p>
      </div>

      <div className="pcard">
        <h3 className="font-mono font-semibold text-lg mb-3">Pendientes anotados ({pendientes.length})</h3>
        {pendientes.length === 0 ? (
          <p className="text-[#999] font-mono text-sm">Aún no hay pendientes. Agregue el primero arriba.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr>
                {['Producto', 'Cant.', 'Cliente', 'Prov.', 'Estado', 'Acciones'].map(h =>
                  <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody>
                {pendientes.map(p => (
                  <tr key={p.id} className="border-b border-[#e0ddd5]">
                    <td className="px-3 py-2.5 font-semibold">{p.prod}</td>
                    <td className="px-3 py-2.5 font-mono text-center">{p.cant || '—'}</td>
                    <td className="px-3 py-2.5">{p.cliente || <span className="text-[#bbb]">—</span>}{p.tel && <div className="text-xs text-[#999] font-mono">{p.tel}</div>}</td>
                    <td className="px-3 py-2.5 font-mono">{p.sigla}</td>
                    <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 text-xs font-mono font-semibold border ${PILL[p.estado]}`}>{PILL_TXT[p.estado]}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5 flex-wrap">
                        {p.estado === 'pendiente' && <button className="text-xs font-mono text-[#2980b9] hover:underline" onClick={() => { updatePendiente(p.id, { estado: 'pedido' }); refresh() }}>→ Pedido</button>}
                        {p.estado === 'pedido' && <button className="text-xs font-mono text-[#1a6b3c] hover:underline" onClick={() => { updatePendiente(p.id, { estado: 'llego' }); refresh() }}>✓ Llegó</button>}
                        {p.estado === 'llego' && <button className="text-xs font-mono text-[#8e44ad] hover:underline" onClick={() => { updatePendiente(p.id, { estado: 'avisado' }); refresh() }}>📲 Avisé</button>}
                        <button className="text-xs font-mono text-[#c0392b] hover:underline" onClick={() => { deletePendiente(p.id); refresh() }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-[#999] font-mono mt-3">🟡 Pendiente · 🔵 Ya se pidió · 🟢 Llegó (¡avisar!) · 🟣 Avisado</p>
      </div>
    </div>
  )
}
