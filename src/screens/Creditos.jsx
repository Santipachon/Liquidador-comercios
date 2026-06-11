import { useState } from 'react'
import { getPedidos, updatePedido, getConfig } from '../lib/db'
import { generarComprobantePDF } from '../lib/pdf'
import { provNombre, formatCOP, fechaCorta } from '../lib/shared'

const diasRestantes = venc => Math.ceil((new Date(venc).getTime() - Date.now()) / 86400000)

function badge(d) {
  if (d < 0) return { txt: `Vencido hace ${-d} día(s)`, cls: 'bg-[#fdecea] text-[#c0392b] border-[#c0392b]' }
  if (d === 0) return { txt: 'Vence HOY', cls: 'bg-[#fdecea] text-[#c0392b] border-[#c0392b]' }
  if (d <= 3) return { txt: `Vence en ${d} día(s)`, cls: 'bg-[#fffbe6] text-[#8a6d0f] border-[#d4a017]' }
  return { txt: `En ${d} días`, cls: 'bg-[#eef6fb] text-[#2980b9] border-[#2980b9]' }
}

export default function Creditos() {
  const [, force] = useState(0)
  const refresh = () => force(n => n + 1)
  const [marcando, setMarcando] = useState(null) // id del pedido
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10))
  const [archivo, setArchivo] = useState(null)
  const [err, setErr] = useState('')

  const creditos = getPedidos().filter(p => p.pago?.tipo === 'credito')
  const pendientes = creditos.filter(p => p.estadoPago !== 'pagado').sort((a, b) => (a.pago.vencimiento || '').localeCompare(b.pago.vencimiento || ''))
  const pagados = creditos.filter(p => p.estadoPago === 'pagado')

  function confirmarPago(p) {
    if (!archivo) { setErr('Debe adjuntar el comprobante de pago para registrarlo.'); return }
    const finalizar = (dataUrl) => {
      updatePedido(p.id, {
        estadoPago: 'pagado', fechaPago: new Date(fechaPago).toISOString(),
        comprobantePago: { nombre: archivo.name, dataUrl: dataUrl || null },
      })
      setMarcando(null); setArchivo(null); setErr(''); refresh()
    }
    if (archivo.size < 800 * 1024) {
      const r = new FileReader()
      r.onload = () => finalizar(r.result)
      r.readAsDataURL(archivo)
    } else finalizar(null) // archivo grande: guardamos solo el nombre
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">💳 Control de créditos</h2>
      <p className="text-[#666] text-sm">Pedidos a crédito y sus fechas de pago. El sistema resalta los que vencen pronto. Al pagar, registre la fecha y adjunte el comprobante.</p>

      <div className="sec-title">Por pagar ({pendientes.length})</div>
      {pendientes.length === 0 ? (
        <div className="pcard"><p className="text-[#666] text-sm">No hay créditos pendientes. ✅</p></div>
      ) : pendientes.map(p => {
        const d = diasRestantes(p.pago.vencimiento)
        const b = badge(d)
        return (
          <div key={p.id} className="pcard" style={d <= 3 ? { borderLeft: '5px solid ' + (d <= 0 ? '#c0392b' : '#d4a017') } : {}}>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="font-mono font-semibold">{p.numero} · {p.sigla} · {provNombre(p.sigla)}</div>
                <div className="text-sm text-[#666] font-mono mt-1">
                  Pedido: {fechaCorta(p.fecha)} · Crédito {p.pago.dias} días · Vence: <b>{fechaCorta(p.pago.vencimiento)}</b>
                  {p.totalDinero > 0 && <> · Total: <b className="text-[#1a1a1a]">{formatCOP(p.totalDinero)}</b></>}
                </div>
              </div>
              <span className={`inline-block px-2.5 py-1 text-xs font-mono font-semibold border ${b.cls}`}>{b.txt}</span>
            </div>
            <div className="flex gap-3 mt-3 flex-wrap">
              <button className="text-[#2980b9] font-mono text-xs hover:underline" onClick={() => generarComprobantePDF(p, getConfig())}>⬇ Descargar comprobante</button>
              {marcando !== p.id && <button className="btn-plat py-1 px-3 text-xs border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => { setMarcando(p.id); setArchivo(null); setErr('') }}>✓ Marcar pagado</button>}
            </div>
            {marcando === p.id && (
              <div className="mt-3 border-t border-[#e0ddd5] pt-3 flex flex-wrap gap-3 items-end">
                <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Fecha de pago</span>
                  <input type="date" className="input-plat" value={fechaPago} onChange={e => setFechaPago(e.target.value)} /></label>
                <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Comprobante de pago (obligatorio)</span>
                  <input type="file" accept="image/*,.pdf" className="text-xs" onChange={e => { setArchivo(e.target.files[0]); setErr('') }} /></label>
                <button className="btn-plat py-1 px-3 text-xs border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={() => confirmarPago(p)}>Confirmar pago</button>
                <button className="text-[#999] font-mono text-xs hover:underline" onClick={() => { setMarcando(null); setErr('') }}>Cancelar</button>
                {err && <p className="text-[#c0392b] text-xs font-mono w-full">{err}</p>}
              </div>
            )}
          </div>
        )
      })}

      {pagados.length > 0 && <>
        <div className="sec-title">Pagados ({pagados.length})</div>
        <div className="pcard overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Nº', 'Proveedor', 'Vencía', 'Pagado', 'Comprobante', ''].map(h =>
              <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {pagados.map(p => (
                <tr key={p.id} className="border-b border-[#e0ddd5]">
                  <td className="px-3 py-2 font-mono font-semibold">{p.numero}</td>
                  <td className="px-3 py-2">{p.sigla} · {provNombre(p.sigla)}</td>
                  <td className="px-3 py-2 font-mono">{fechaCorta(p.pago.vencimiento)}</td>
                  <td className="px-3 py-2 font-mono text-[#1a6b3c]">{fechaCorta(p.fechaPago)} ✓</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {p.comprobantePago?.dataUrl
                      ? <a href={p.comprobantePago.dataUrl} download={p.comprobantePago.nombre} className="text-[#2980b9] hover:underline">⬇ {p.comprobantePago.nombre}</a>
                      : <span className="text-[#999]">{p.comprobantePago?.nombre || '—'}</span>}
                  </td>
                  <td className="px-3 py-2"><button className="text-[#2980b9] font-mono text-xs hover:underline" onClick={() => generarComprobantePDF(p, getConfig())}>⬇ Pedido</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  )
}
