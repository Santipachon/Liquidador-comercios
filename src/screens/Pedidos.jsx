import { useState } from 'react'
import { getPendientes, updatePendiente } from '../lib/db'
import { provNombre } from '../lib/shared'

export default function Pedidos() {
  const [, force] = useState(0)
  const refresh = () => force(n => n + 1)
  const pendientes = getPendientes().filter(p => p.estado === 'pendiente')

  const porProv = {}
  pendientes.forEach(p => { (porProv[p.sigla] = porProv[p.sigla] || []).push(p) })
  const grupos = Object.keys(porProv)

  function generar(sigla) {
    porProv[sigla].forEach(p => updatePendiente(p.id, { estado: 'pedido' }))
    refresh()
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">📋 Pedidos a proveedores</h2>
      <p className="text-[#666] text-sm">Los pendientes se agrupan por proveedor. Genere el pedido y quedarán marcados como “Pedido”, listos para comparar contra la factura cuando llegue.</p>

      {grupos.length === 0 ? (
        <div className="pcard text-center py-10"><p className="text-[#666]">No hay pendientes sin pedir. ✅</p></div>
      ) : grupos.map(sigla => (
        <div key={sigla} className="pcard">
          <h3 className="font-mono font-semibold text-lg mb-3">{sigla} · {provNombre(sigla)} <span className="text-[#999] text-sm font-normal">({porProv[sigla].length} productos)</span></h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr>{['Producto', 'Cant.', 'Cliente'].map(h =>
                <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>
                {porProv[sigla].map(p => (
                  <tr key={p.id} className="border-b border-[#e0ddd5]">
                    <td className="px-3 py-2 font-semibold">{p.prod}</td>
                    <td className="px-3 py-2 font-mono text-center">{p.cant || '—'}</td>
                    <td className="px-3 py-2">{p.cliente || <span className="text-[#bbb] text-xs">stock</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-plat mt-3 border-[#2980b9] text-[#2980b9] hover:bg-[#2980b9] hover:text-white" onClick={() => generar(sigla)}>📤 Generar pedido a {sigla}</button>
        </div>
      ))}
      <p className="text-xs text-[#999] font-mono">Próxima iteración: al subir la factura del proveedor, se comparará automáticamente contra este pedido (qué llegó, qué no, qué cobran de más).</p>
    </div>
  )
}
