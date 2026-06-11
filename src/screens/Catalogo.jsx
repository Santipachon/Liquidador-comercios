import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCatalogo } from '../lib/db'
import { normalizar, formatCOP, provNombre } from '../lib/shared'

export default function Catalogo() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const catalogo = getCatalogo()
  const t = normalizar(q.trim())
  const list = t ? catalogo.filter(p => normalizar(p.nombre).includes(t) || normalizar(p.sigla).includes(t)) : catalogo

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">🔎 Catálogo de productos</h2>

      {catalogo.length === 0 ? (
        <div className="pcard text-center py-10">
          <p className="text-[#666]">El catálogo se llena solo a medida que liquida facturas.</p>
          <button className="btn-plat mt-4 border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => nav('/liquidar')}>Ir a liquidar una factura →</button>
        </div>
      ) : (
        <div className="pcard">
          <input className="input-plat" placeholder="🔍 Buscar producto o sigla de proveedor…" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          <p className="text-xs text-[#999] font-mono mt-2">{list.length} de {catalogo.length} productos</p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full border-collapse text-sm">
              <thead><tr>
                {['Producto', 'Prov.', 'Últ. costo', 'Precio venta', 'Cód. interno', 'Compras', ''].map(h =>
                  <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.key} className="border-b border-[#e0ddd5] hover:bg-[#faf9f6] cursor-pointer" onClick={() => nav('/catalogo/' + encodeURIComponent(p.key))}>
                    <td className="px-3 py-2.5 font-semibold">{p.nombre}</td>
                    <td className="px-3 py-2.5 font-mono" title={provNombre(p.sigla)}>{p.sigla}</td>
                    <td className="px-3 py-2.5 font-mono">{formatCOP(p.ultimo_costo)}</td>
                    <td className="px-3 py-2.5 font-mono text-[#1a6b3c] font-semibold">{formatCOP(p.ultimo_venta)}</td>
                    <td className="px-3 py-2.5"><span className="font-mono text-xs tracking-widest bg-[#f0fdf4] px-2 py-0.5 border border-[#86efac] text-[#166534]">{p.codigo_interno}</span></td>
                    <td className="px-3 py-2.5 font-mono text-center">{p.veces}</td>
                    <td className="px-3 py-2.5 text-[#2980b9] font-mono text-xs">Ver →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
