import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFacturas } from '../lib/db'
import { formatCOP, fechaCorta, provNombre } from '../lib/shared'

export default function Historial() {
  const nav = useNavigate()
  const facturas = getFacturas()
  const [abierta, setAbierta] = useState(null)
  const fac = facturas.find(f => f.id === abierta)

  if (fac) {
    return (
      <div className="space-y-5">
        <button className="text-[#2980b9] font-mono text-sm hover:underline" onClick={() => setAbierta(null)}>← Volver al historial</button>
        <div className="pcard">
          <h2 className="text-xl font-bold font-mono">Factura {fac.numero}</h2>
          <p className="text-sm text-[#666] font-mono mt-1">{provNombre(fac.sigla)} ({fac.sigla}) · {fechaCorta(fac.fecha)}</p>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <div className="kpi" style={{ borderLeftColor: '#2980b9' }}><div className="k-l">Costo c/IVA</div><div className="k-v text-lg text-[#2980b9]">{formatCOP(fac.costoConIva)}</div></div>
          <div className="kpi" style={{ borderLeftColor: '#1a6b3c' }}><div className="k-l">Venta estimada</div><div className="k-v text-lg text-[#1a6b3c]">{formatCOP(fac.venta)}</div></div>
          <div className="kpi"><div className="k-l">Ganancia</div><div className="k-v text-lg">{formatCOP(fac.ganancia)}</div></div>
          <div className="kpi"><div className="k-l">Etiquetas</div><div className="k-v text-lg">{fac.etiquetas}</div></div>
        </div>
        <div className="pcard overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Producto', 'Cant.', 'Costo', 'Margen', 'Precio venta', 'Cód.'].map(h => <th key={h} className="bg-[#33302b] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {fac.items.map((it, i) => (
                <tr key={i} className="border-b border-[#e0ddd5]">
                  <td className="px-3 py-2 font-semibold">{it.nombre}</td>
                  <td className="px-3 py-2 font-mono text-center">{it.cantidad}</td>
                  <td className="px-3 py-2 font-mono">{formatCOP(it.precio_unitario)}</td>
                  <td className="px-3 py-2 font-mono text-center">{it.margen}%</td>
                  <td className="px-3 py-2 font-mono text-[#1a6b3c] font-semibold">{formatCOP(it.precio_venta)}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs tracking-widest bg-[#f0fdf4] px-2 py-0.5 border border-[#86efac] text-[#166534]">{it.codigo_interno}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => nav('/liquidar')}>Volver a liquidar / reexportar →</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">🧾 Historial de facturas</h2>
      {facturas.length === 0 ? (
        <div className="pcard text-center py-10"><p className="text-[#666]">Aún no hay facturas guardadas.</p></div>
      ) : (
        <div className="pcard overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Factura', 'Proveedor', 'Fecha', 'Productos', 'Costo', 'Ganancia', ''].map(h => <th key={h} className="bg-[#33302b] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {facturas.map(f => (
                <tr key={f.id} className="border-b border-[#e0ddd5] hover:bg-[#faf9f6] cursor-pointer" onClick={() => setAbierta(f.id)}>
                  <td className="px-3 py-2.5 font-mono font-semibold">{f.numero}</td>
                  <td className="px-3 py-2.5">{f.sigla} · {provNombre(f.sigla)}</td>
                  <td className="px-3 py-2.5 font-mono">{fechaCorta(f.fecha)}</td>
                  <td className="px-3 py-2.5 font-mono text-center">{f.num_productos}</td>
                  <td className="px-3 py-2.5 font-mono">{formatCOP(f.costoConIva)}</td>
                  <td className="px-3 py-2.5 font-mono text-[#1a6b3c]">{formatCOP(f.ganancia)}</td>
                  <td className="px-3 py-2.5 text-[#2980b9] font-mono text-xs">Ver →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
