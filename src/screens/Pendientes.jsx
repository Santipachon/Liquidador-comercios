import { useState } from 'react'
import { getCatalogo, getPendientes, addPendiente, updatePendiente, deletePendiente } from '../lib/db'
import { coincide, formatCOP, provNombre } from '../lib/shared'

const PILL = {
  pendiente: 'bg-[#fffbe6] text-[#8a6d0f] border-[#d4a017]',
  pedido: 'bg-[#eef6fb] text-[#2980b9] border-[#2980b9]',
  llego: 'bg-[#f0fdf4] text-[#1a6b3c] border-[#86efac]',
  avisado: 'bg-[#f3eafa] text-[#8e44ad] border-[#8e44ad]',
}
const PILL_TXT = { pendiente: 'Pendiente', pedido: 'Pedido', llego: 'Llegó ✓', avisado: 'Avisado' }
const ACTIVOS = ['pendiente', 'pedido', 'llego']

export default function Pendientes() {
  const [, force] = useState(0)
  const refresh = () => force(n => n + 1)

  // Captura
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [cant, setCant] = useState(1)
  const [cliente, setCliente] = useState('')
  const [tel, setTel] = useState('')

  // Filtros de la lista
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('activos')
  const [prov, setProv] = useState('')
  const [agrupar, setAgrupar] = useState(false)

  const catalogo = getCatalogo()
  const todos = getPendientes()

  const matches = q.trim() ? catalogo.filter(p => coincide(p.nombre, q)).slice(0, 7) : []

  function elegir(p) { setSel({ nombre: p.nombre, sigla: p.sigla, codigo: p.codigo || '' }); setQ(p.nombre) }
  function elegirLibre() { setSel({ nombre: q.trim(), sigla: '', codigo: '', libre: true }) }
  function agregar() {
    if (!sel) return
    addPendiente({ prod: sel.nombre, codigo: sel.codigo || '', cant: parseInt(cant) || 1, cliente: cliente.trim(), tel: tel.trim(), sigla: sel.sigla || '—' })
    setSel(null); setQ(''); setCant(1); setCliente(''); setTel(''); refresh()
  }

  // Conteos por estado (sobre el total)
  const cuenta = { todos: todos.length, activos: todos.filter(p => ACTIVOS.includes(p.estado)).length }
  for (const e of ['pendiente', 'pedido', 'llego', 'avisado']) cuenta[e] = todos.filter(p => p.estado === e).length

  // Proveedores presentes
  const siglas = [...new Set(todos.map(p => p.sigla).filter(s => s && s !== '—'))].sort()

  // Aplicar filtros
  let lista = todos
  if (estado === 'activos') lista = lista.filter(p => ACTIVOS.includes(p.estado))
  else if (estado !== 'todos') lista = lista.filter(p => p.estado === estado)
  if (prov) lista = lista.filter(p => p.sigla === prov)
  if (busca.trim()) lista = lista.filter(p => coincide(`${p.prod} ${p.cliente || ''}`, busca))

  const grupos = agrupar
    ? Object.entries(lista.reduce((acc, p) => { (acc[p.sigla] = acc[p.sigla] || []).push(p); return acc }, {}))
    : [['', lista]]

  const fila = p => (
    <tr key={p.id} className="border-b border-[#e0ddd5]">
      <td className="px-3 py-2.5 font-semibold">{p.prod}{p.codigo && <span className="text-[#bbb] text-xs font-mono"> · {p.codigo}</span>}</td>
      <td className="px-3 py-2.5 font-mono text-center">{p.cant || '—'}</td>
      <td className="px-3 py-2.5">{p.cliente || <span className="text-[#bbb]">—</span>}{p.tel && <div className="text-xs text-[#999] font-mono">{p.tel}</div>}</td>
      <td className="px-3 py-2.5 font-mono">{p.sigla}</td>
      <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 text-xs font-mono font-semibold border ${PILL[p.estado]}`}>{PILL_TXT[p.estado]}</span></td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1.5 flex-wrap">
          {p.estado === 'pendiente' && <button className="text-xs font-mono text-[#2980b9] hover:underline" onClick={() => { updatePendiente(p.id, { estado: 'pedido' }); refresh() }}>→ Pedido</button>}
          {p.estado === 'pedido' && <button className="text-xs font-mono text-[#1a6b3c] hover:underline" onClick={() => { updatePendiente(p.id, { estado: 'llego' }); refresh() }}>✓ Llegó</button>}
          {p.estado === 'llego' && <button className="text-xs font-mono text-[#8e44ad] hover:underline" onClick={() => { updatePendiente(p.id, { estado: 'avisado' }); refresh() }}>📲 Avisé</button>}
          {p.estado === 'avisado' && <button className="text-xs font-mono text-[#999] hover:underline" onClick={() => { updatePendiente(p.id, { estado: 'pendiente' }); refresh() }}>↩ Reabrir</button>}
          <button className="text-xs font-mono text-[#c0392b] hover:underline" onClick={() => { if (confirm('¿Eliminar este pendiente?')) { deletePendiente(p.id); refresh() } }}>✕</button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold font-mono">🛒 Lo que pide la gente</h2>

      {/* Captura */}
      <div className="pcard space-y-3">
        <h3 className="font-mono font-semibold text-lg">➕ Cliente pidió…</h3>
        <div className="relative">
          <input className="input-plat" placeholder="🔍 Escriba el producto (ej: cuña 8, rodamiento, aceite)…"
            value={q} onChange={e => { setQ(e.target.value); setSel(null) }} autoComplete="off" />
          {q.trim() && !sel && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-[#33302b] z-20 max-h-72 overflow-y-auto shadow-xl">
              {matches.map((p, i) => (
                <button key={i} onClick={() => elegir(p)} className="block w-full text-left px-3 py-2.5 border-b border-[#eee] hover:bg-[#fffbe6]">
                  <span className="block font-semibold text-sm">{p.nombre}</span>
                  <span className="block text-xs text-[#999] font-mono">{p.codigo ? p.codigo + ' · ' : ''}{p.sigla} · {formatCOP(p.ultimo_venta)} · {p.veces} compras</span>
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
      </div>

      {/* Lista con filtros */}
      <div className="pcard">
        <div className="flex flex-wrap gap-3 items-center mb-3">
          <h3 className="font-mono font-semibold text-lg">Pendientes</h3>
          <input className="input-plat flex-1" style={{ minWidth: 200, width: 'auto' }}
            placeholder="🔍 Buscar por producto o cliente (palabras sueltas)…" value={busca} onChange={e => setBusca(e.target.value)} autoComplete="off" />
        </div>

        {/* Chips de estado */}
        <div className="flex flex-wrap gap-2 mb-3">
          {[['activos', `Activos (${cuenta.activos})`], ['pendiente', `Pendientes (${cuenta.pendiente})`], ['pedido', `Pedidos (${cuenta.pedido})`],
            ['llego', `Por avisar (${cuenta.llego})`], ['avisado', `Atendidos (${cuenta.avisado})`], ['todos', `Todos (${cuenta.todos})`]].map(([k, t]) => (
            <button key={k} onClick={() => setEstado(k)}
              className={`px-3 py-1.5 font-mono text-xs border-2 transition-colors ${estado === k ? 'bg-[#33302b] text-white border-[#33302b]' : 'bg-white text-[#555] border-[#ddd] hover:border-[#33302b]'}`}>{t}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-center mb-3">
          {siglas.length > 0 && (
            <select className="input-plat" style={{ width: 'auto' }} value={prov} onChange={e => setProv(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {siglas.map(s => <option key={s} value={s}>{s} · {provNombre(s)}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm font-mono text-[#666] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#33302b]" checked={agrupar} onChange={e => setAgrupar(e.target.checked)} />
            Agrupar por proveedor
          </label>
          <span className="text-xs text-[#999] font-mono ml-auto">Mostrando {lista.length} de {todos.length}</span>
        </div>

        {lista.length === 0 ? (
          <p className="text-[#999] font-mono text-sm py-4">{todos.length === 0 ? 'Aún no hay pendientes. Agregue el primero arriba.' : 'Ningún pendiente con estos filtros.'}</p>
        ) : grupos.map(([sig, rows]) => (
          <div key={sig || 'all'} className="mb-5">
            {agrupar && <p className="font-mono text-sm font-semibold text-[#33302b] bg-[#f0f0ec] px-3 py-1.5 border-l-4 border-[#33302b]">{sig === '—' || !sig ? 'Sin proveedor' : `${sig} · ${provNombre(sig)}`} <span className="text-[#999] font-normal">({rows.length})</span></p>}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr>{['Producto', 'Cant.', 'Cliente', 'Prov.', 'Estado', 'Acciones'].map(h =>
                  <th key={h} className="bg-[#33302b] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody>{rows.map(fila)}</tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="text-xs text-[#999] font-mono mt-1">🟡 Pendiente · 🔵 Ya se pidió · 🟢 Llegó (¡avisar!) · 🟣 Atendido</p>
      </div>
    </div>
  )
}
