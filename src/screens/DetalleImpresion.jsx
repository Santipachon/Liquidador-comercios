import { useState, useEffect } from 'react'
import { formatCOP, fechaCorta, provNombre, coincide } from '../lib/shared'
import {
  codigoDeItem, esImprimible, nEtiquetasDeItem, vistaPrevia, etiquetaDeItem,
  imprimirProductos, cancelarImpresion, estaImprimiendo,
} from '../lib/printer'

// Traduce errores técnicos a algo accionable para el empleado.
function mensajeErr(e) {
  const m = String(e?.message || e)
  if (/en curso/i.test(m)) return m
  if (/conexi|conectad|COM|GATT|desconect|perdió/i.test(m)) return 'Se perdió la conexión con la impresora. Reconéctala arriba.'
  if (/timeout/i.test(m)) return 'La impresora no respondió. Revisa que esté encendida y con papel.'
  return 'Error al imprimir: ' + m
}

// Detalle de una factura liquidada para imprimir sus etiquetas en el orden que se desee:
// buscar, elegir cuántas etiquetas por producto, imprimir uno / seleccionados / todos,
// y ver tachados los que ya salieron.
export default function DetalleImpresion({ factura, printerOn, onVolver, onFacturaImpresa }) {
  const items = factura.items || []
  const [etiq, setEtiq] = useState(() => Object.fromEntries(items.map((it, i) => [i, nEtiquetasDeItem(it)])))
  const [sel, setSel] = useState(() => new Set())
  const [impresos, setImpresos] = useState(() => new Set())
  const [busqueda, setBusqueda] = useState('')
  const [prog, setProg] = useState(null)      // { hechas, total, prod }
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [imprimiendo, setImprimiendo] = useState(false)

  useEffect(() => {
    if (!preview) return
    const h = e => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [preview])

  const idxImprimibles = items.map((it, i) => i).filter(i => esImprimible(items[i]))
  const nImpresos = idxImprimibles.filter(i => impresos.has(i)).length
  const idxPend = idxImprimibles.filter(i => !impresos.has(i))
  const idxSelValidos = [...sel].filter(i => esImprimible(items[i]) && (etiq[i] ?? 0) > 0)

  // Filtro por nombre o por código de empresa del producto (it.codigo).
  const filtrados = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => !busqueda.trim() || coincide(`${it.nombre || ''} ${it.codigo || ''}`, busqueda))

  function toggle(i) { setSel(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n }) }
  function toggleTodos() {
    const visiblesImpr = filtrados.filter(({ i }) => esImprimible(items[i])).map(({ i }) => i)
    const todosMarcados = visiblesImpr.every(i => sel.has(i))
    setSel(s => { const n = new Set(s); visiblesImpr.forEach(i => todosMarcados ? n.delete(i) : n.add(i)); return n })
  }
  function cambiarEtiq(i, v) {
    const num = Math.max(0, Math.min(999, Math.round(Number(v) || 0)))
    setEtiq(e => ({ ...e, [i]: num }))
  }
  function ver(it) { setPreview({ src: vistaPrevia(etiquetaDeItem(it, factura)), titulo: it.nombre }) }

  async function imprimirLista(indices) {
    if (!printerOn) { setError('Primero conecta la impresora (arriba).'); return }
    if (estaImprimiendo()) { setError('Ya hay una impresión en curso.'); return }
    const productos = indices
      .filter(i => esImprimible(items[i]) && (etiq[i] ?? 0) > 0)
      .map(i => ({ it: items[i], etiquetas: etiq[i], _idx: i }))
    if (!productos.length) { setError('No hay etiquetas para imprimir en esa selección.'); return }
    setError(''); setImprimiendo(true)
    setProg({ hechas: 0, total: productos.reduce((n, p) => n + p.etiquetas, 0), prod: '' })
    let res = null
    try {
      res = await imprimirProductos(factura, productos, {
        onEtiqueta: (hechas, total, it) => setProg({ hechas, total, prod: it?.nombre || '' }),
        onProductoListo: pi => { const idx = productos[pi]._idx; setImpresos(s => { const n = new Set(s); n.add(idx); return n }) },
      })
    } catch (e) {
      setError(mensajeErr(e)); setProg(null); setImprimiendo(false); return
    }
    setProg(null); setImprimiendo(false)
    if (res?.cancelado) setError(`⏸ Cancelado: salieron ${res.hechas} de ${res.total} etiquetas.`)
  }

  function marcarFacturaImpresa() {
    const ok = window.confirm(
      `¿Marcar la factura ${factura.numero} como IMPRESA?\n\n` +
      `Impresos: ${nImpresos} de ${idxImprimibles.length} productos.\n\n` +
      `Hazlo solo si ya salieron todas las etiquetas que necesitabas.`
    )
    if (ok) onFacturaImpresa()
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button className="text-[#2980b9] font-mono text-sm hover:underline" onClick={onVolver} disabled={imprimiendo}>← Volver a la lista</button>
        <span className="text-sm text-[#777] font-mono">
          <b className="text-[#1a6b3c]">{nImpresos}</b> de {idxImprimibles.length} productos impresos
        </span>
      </div>
      <div className="pcard">
        <h2 className="text-xl font-bold font-mono">Factura {factura.numero}</h2>
        <p className="text-sm text-[#666] font-mono mt-1">{provNombre(factura.sigla)} ({factura.sigla}) · {fechaCorta(factura.fecha)} · {items.length} productos</p>
      </div>

      {/* Barra de herramientas */}
      <div className="pcard flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={toggleTodos} disabled={imprimiendo} className="btn-plat border-[#33302b] text-[#33302b] hover:bg-[#33302b] hover:text-white text-sm py-1.5 disabled:opacity-40">☑ Marcar/desmarcar todos</button>
          <button onClick={() => imprimirLista(idxSelValidos)} disabled={imprimiendo || !printerOn || idxSelValidos.length === 0}
            className="btn-plat border-[#2980b9] text-[#2980b9] hover:bg-[#2980b9] hover:text-white text-sm py-1.5 disabled:opacity-40">
            🖨️ Imprimir seleccionados ({idxSelValidos.length})
          </button>
          <button onClick={() => imprimirLista(idxPend)} disabled={imprimiendo || !printerOn || idxPend.length === 0}
            className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white text-sm py-1.5 disabled:opacity-40">
            🖨️ Imprimir pendientes ({idxPend.length})
          </button>
        </div>
        <button onClick={marcarFacturaImpresa} disabled={imprimiendo}
          className="btn-plat border-[#8e44ad] text-[#8e44ad] hover:bg-[#8e44ad] hover:text-white text-sm py-1.5 disabled:opacity-40">✅ Marcar factura impresa</button>
      </div>

      {/* Buscador dentro de la factura */}
      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} disabled={imprimiendo}
        placeholder="🔎 Buscar producto por nombre o código de la empresa…"
        className="w-full border-2 border-[#d8d4cc] px-3 py-2 font-mono text-sm focus:border-[#33302b] outline-none disabled:opacity-60" />

      {/* Progreso / error */}
      {prog && (
        <div className="pcard border-l-[6px] flex items-center justify-between gap-3" style={{ borderLeftColor: '#2980b9' }}>
          <div className="min-w-0">
            <p className="font-mono text-sm text-[#2980b9]">Imprimiendo {prog.hechas}/{prog.total} etiquetas…</p>
            {prog.prod && <p className="font-mono text-[10px] text-[#999] truncate max-w-[240px]">{prog.prod}</p>}
            <div className="h-1.5 bg-[#e5e5e5] mt-1 w-56"><div className="h-full bg-[#2980b9]" style={{ width: `${prog.total ? Math.round((prog.hechas / prog.total) * 100) : 0}%` }} /></div>
          </div>
          <button onClick={cancelarImpresion} className="btn-plat border-[#c0392b] text-[#c0392b] hover:bg-[#c0392b] hover:text-white text-sm py-1.5">✕ Cancelar</button>
        </div>
      )}
      {error && <div className="pcard border-l-[6px] py-2" style={{ borderLeftColor: '#c0392b' }}><p className="text-sm text-[#c0392b] font-mono">{error}</p></div>}

      {/* Tabla de productos */}
      <div className="pcard overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>{['', 'Producto', 'Cód. empresa', 'Código', 'Precio', 'Margen', 'Etiq.', ''].map((h, i) =>
              <th key={i} className="bg-[#33302b] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtrados.map(({ it, i }) => {
              const impr = esImprimible(it)
              const hecho = impresos.has(i)
              return (
                <tr key={i} className={`border-b border-[#e0ddd5] ${hecho ? 'bg-[#f0fdf4]' : ''} ${!impr ? 'opacity-50' : ''}`}>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" disabled={!impr || imprimiendo} checked={sel.has(i)} onChange={() => toggle(i)} className="w-4 h-4 accent-[#1a6b3c]" />
                  </td>
                  <td className={`px-3 py-2 font-semibold ${hecho ? 'line-through text-[#888]' : ''}`}>{it.nombre}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#777]">{it.codigo || '—'}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs tracking-widest bg-[#f0fdf4] px-2 py-0.5 border border-[#86efac] text-[#166534]">{codigoDeItem(it) || '—'}</span></td>
                  <td className="px-3 py-2 font-mono text-[#1a6b3c] font-semibold">{it.precio_venta != null ? formatCOP(it.precio_venta) : '—'}</td>
                  <td className="px-3 py-2 font-mono text-center">{it.margen != null ? it.margen + '%' : '—'}</td>
                  <td className="px-2 py-2 text-center">
                    <input type="number" min={0} value={etiq[i] ?? 0} disabled={!impr || imprimiendo}
                      onChange={e => cambiarEtiq(i, e.target.value)}
                      className="w-14 border border-[#d8d4cc] px-1 py-1 font-mono text-center text-sm focus:border-[#33302b] outline-none disabled:opacity-50" />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {impr ? (
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => ver(it)} className="text-[#8e44ad] font-mono text-xs hover:underline">👁 Ver</button>
                        <button onClick={() => imprimirLista([i])} disabled={imprimiendo || !printerOn || (etiq[i] ?? 0) === 0}
                          className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white text-xs py-1 disabled:opacity-40">
                          🖨️ {hecho ? 'Reimprimir' : 'Imprimir'}
                        </button>
                        {hecho && <span className="text-[#1a6b3c] font-mono text-xs">✓</span>}
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] text-[#b45309]">sin precio/código</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[#999] font-mono text-sm">Ningún producto coincide con la búsqueda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Vista previa */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" aria-label="Vista previa de la etiqueta"
            className="bg-white border-[3px] border-[#33302b] p-4 max-w-xs" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-xs text-[#777] mb-2 truncate">{preview.titulo}</p>
            <img src={preview.src} alt="Etiqueta" className="border border-[#ccc] w-full" style={{ imageRendering: 'pixelated' }} />
            <p className="text-[10px] text-[#999] font-mono mt-2">Vista aproximada (30×20 mm).</p>
            <button onClick={() => setPreview(null)} className="btn-plat w-full mt-3 border-[#33302b] text-[#33302b] hover:bg-[#33302b] hover:text-white">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
