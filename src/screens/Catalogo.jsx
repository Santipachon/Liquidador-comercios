import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCatalogo, getConfig } from '../lib/db'
import { coincide, normalizar, formatCOP, provNombre } from '../lib/shared'

const LIMIT = 60
const UMBRAL_BAJO = 5   // "bajo stock": se avisa cuando quedan ≤ este número (configurable a futuro)

export default function Inventario() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [prov, setProv] = useState('')
  const [orden, setOrden] = useState('relevancia')

  const catalogo = getCatalogo()
  const dia0 = getConfig().inventarioInicio || null   // "Día 0": desde aquí se miden movimientos
  const siglas = [...new Set(catalogo.map(p => p.sigla).filter(s => s && s !== '?'))].sort()

  // Stock por MOVIMIENTOS desde el Día 0: stock = conteo + entradas − salidas.
  // Si el producto no tiene conteo físico, el stock es "sin contar" (solo se miden movimientos).
  function infoStock(p) {
    const desde = dia0 || '9999-99-99'
    const entradas = (p.hist || []).filter(h => (h.fecha || '').slice(0, 10) >= desde).reduce((s, h) => s + (h.cantidad || 0), 0)
    const salidas = (p.ventas || []).filter(v => (v.fecha || '').slice(0, 10) >= desde).reduce((s, v) => s + (v.cantidad || 0), 0)
    const base = p.conteo?.cantidad
    const tieneConteo = base != null
    const stock = tieneConteo ? base + entradas - salidas : null
    return { entradas, salidas, stock, tieneConteo, bajo: tieneConteo && stock <= UMBRAL_BAJO }
  }

  const tokens = normalizar(q.trim()).split(/\s+/).filter(Boolean)
  function score(p) {
    if (!tokens.length) return 0
    const n = normalizar(p.nombre)
    if (n.startsWith(tokens.join(' '))) return 0
    const words = n.split(/[\s,./-]+/)
    if (tokens.every(t => words.some(w => w.startsWith(t)))) return 1
    if (tokens.every(t => n.includes(t))) return 2
    return 3
  }

  let list = catalogo
  if (prov) list = list.filter(p => p.sigla === prov)
  if (q.trim()) list = list.filter(p => coincide(`${p.nombre} ${p.codigo || ''} ${p.sigla}`, q))

  const comp = {
    relevancia: (a, b) => (q.trim() ? score(a) - score(b) : 0) || normalizar(a.nombre).localeCompare(normalizar(b.nombre)),
    nombre: (a, b) => normalizar(a.nombre).localeCompare(normalizar(b.nombre)),
    comprados: (a, b) => b.veces - a.veces,
    caro: (a, b) => b.ultimo_venta - a.ultimo_venta,
    reciente: (a, b) => (b.ultima_fecha || '').localeCompare(a.ultima_fecha || ''),
  }
  list = [...list].sort(comp[orden] || comp.relevancia)
  const total = list.length
  const mostrados = list.slice(0, LIMIT)

  if (catalogo.length === 0) return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">📦 Inventario</h2>
      <div className="pcard text-center py-10">
        <p className="text-[#666]">El inventario se llena solo a medida que liquida facturas.</p>
        <button className="btn-plat mt-4 border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => nav('/liquidar')}>Ir a liquidar una factura →</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">📦 Inventario <span className="text-[#999] text-base font-normal">({catalogo.length})</span></h2>

      <p className="text-xs text-[#777] font-mono bg-[#f7f4ee] border-l-4 border-[#d4a017] px-3 py-2">
        El stock arranca <b>sin contar</b> y se mide por <b>movimientos desde el Día 0</b> ({dia0 ? dia0 : 'sin definir'}):
        entra al liquidar, sale al vender. Con el conteo físico (diciembre) quedará exacto. Las alertas de bajo stock
        aparecen solo en productos ya contados.
      </p>

      <div className="pcard">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1" style={{ minWidth: 220 }}>
            <input autoFocus className="input-plat" placeholder="🔍 Buscar por nombre, código o medida (ej: cuña 8)…"
              value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
            {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#c0392b] font-bold" title="Limpiar">✕</button>}
          </div>
          {siglas.length > 0 && (
            <select className="input-plat" style={{ width: 'auto' }} value={prov} onChange={e => setProv(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {siglas.map(s => <option key={s} value={s}>{s} · {provNombre(s)}</option>)}
            </select>
          )}
          <select className="input-plat" style={{ width: 'auto' }} value={orden} onChange={e => setOrden(e.target.value)}>
            <option value="relevancia">Relevancia</option>
            <option value="nombre">Nombre (A→Z)</option>
            <option value="comprados">Más comprados</option>
            <option value="caro">Más caro</option>
            <option value="reciente">Más reciente</option>
          </select>
        </div>

        <p className="text-xs text-[#999] font-mono mt-2">
          {total === 0 ? 'Sin resultados — pruebe otras palabras' :
            total > LIMIT ? `Mostrando los primeros ${LIMIT} de ${total} — afine la búsqueda para ver menos` :
              `${total} producto${total !== 1 ? 's' : ''}`}
        </p>

        {total > 0 && (
          <div className="overflow-x-auto mt-3">
            <table className="w-full border-collapse text-sm">
              <thead><tr>
                {['Producto', 'Stock', 'Prov.', 'Últ. costo', 'Precio venta', 'Cód. interno', 'Compras', ''].map(h =>
                  <th key={h} className="bg-[#33302b] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider sticky top-0">{h}</th>)}
              </tr></thead>
              <tbody>
                {mostrados.map(p => {
                  const s = infoStock(p)
                  return (
                    <tr key={p.key} className="border-b border-[#e0ddd5] hover:bg-[#faf9f6] cursor-pointer" onClick={() => nav('/catalogo/' + encodeURIComponent(p.key))}>
                      <td className="px-3 py-2.5 font-semibold">{p.nombre}{p.codigo && <span className="block text-[10px] font-mono text-[#999]">cód {p.codigo}</span>}</td>
                      <td className="px-3 py-2.5 font-mono">
                        {s.stock != null
                          ? <span className={s.bajo ? 'text-[#c0392b] font-bold' : 'text-[#33302b] font-semibold'}>{s.stock}{s.bajo && ' 🔴'}</span>
                          : <span className="text-[#999] text-xs">sin contar{(s.entradas || s.salidas) ? <span className="text-[#bbb]"> · +{s.entradas}/−{s.salidas}</span> : ''}</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono" title={provNombre(p.sigla)}>{p.sigla}</td>
                      <td className="px-3 py-2.5 font-mono">{formatCOP(p.ultimo_costo)}</td>
                      <td className="px-3 py-2.5 font-mono text-[#1a6b3c] font-semibold">{formatCOP(p.ultimo_venta)}</td>
                      <td className="px-3 py-2.5"><span className="font-mono text-xs tracking-widest bg-[#f0fdf4] px-2 py-0.5 border border-[#86efac] text-[#166534]">{p.codigo_interno}</span></td>
                      <td className="px-3 py-2.5 font-mono text-center">{p.veces}</td>
                      <td className="px-3 py-2.5 text-[#2980b9] font-mono text-xs whitespace-nowrap">Ver →</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
