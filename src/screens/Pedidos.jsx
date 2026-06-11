import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendientes, updatePendiente, addPedido, getPedidos, getConfig, setConfig, getCatalogo, getProductoPorNombre } from '../lib/db'
import { generarComprobantePDF } from '../lib/pdf'
import { PROVEEDORES, provNombre, formatCOP, fechaCorta, coincide } from '../lib/shared'

const hoyISO = () => new Date().toISOString()
const venceEn = dias => new Date(Date.now() + dias * 86400000).toISOString()

export default function Pedidos() {
  const nav = useNavigate()
  const [, force] = useState(0)
  const refresh = () => force(n => n + 1)

  const [armando, setArmando] = useState(false)
  const [sigla, setSigla] = useState('')
  const [items, setItems] = useState([])
  const [incluyePrecios, setIncluyePrecios] = useState(false)
  const [pagoTipo, setPagoTipo] = useState('contado')
  const [pagoDias, setPagoDias] = useState(30)
  const [lugar, setLugar] = useState(getConfig().ciudad || '')
  const [obs, setObs] = useState('')
  const [editandoDatos, setEditandoDatos] = useState(false)
  const [cfg, setCfg] = useState(getConfig())
  const [buscarCat, setBuscarCat] = useState('')

  const pedidos = getPedidos()
  const catalogo = getCatalogo()

  // ── Nivel 1: pendientes agrupados por proveedor ──
  const porPedir = getPendientes().filter(p => p.estado === 'pendiente')
  const grupos = {}
  porPedir.forEach(p => {
    const g = p.sigla && p.sigla !== '—' ? p.sigla : '—'
    grupos[g] = grupos[g] || { n: 0, und: 0 }
    grupos[g].n++; grupos[g].und += p.cant || 0
  })
  const listaProv = Object.entries(grupos).sort((a, b) => b[1].n - a[1].n)

  function abrirProveedor(grupo) {
    const pend = getPendientes().filter(p => p.estado === 'pendiente' && (grupo === '—' ? (!p.sigla || p.sigla === '—') : p.sigla === grupo))
    setItems(pend.map(p => {
      const cat = getProductoPorNombre(p.prod, grupo)
      return { codigo: p.codigo || cat?.codigo || '', nombre: p.prod, cantidad: p.cant || 1, precio: cat?.ultimo_costo || 0, pendienteId: p.id }
    }))
    setSigla(grupo === '—' ? '' : grupo)
    setArmando(true); setBuscarCat(''); window.scrollTo(0, 0)
  }
  function pedidoEnBlanco() { setItems([]); setSigla(''); setArmando(true); setBuscarCat(''); window.scrollTo(0, 0) }
  function volver() { setArmando(false); setSigla(''); setItems([]); setObs(''); setPagoTipo('contado') }

  // ── Edición de ítems ──
  const matchesCat = buscarCat.trim()
    ? catalogo.filter(p => coincide(`${p.nombre} ${p.codigo || ''}`, buscarCat) && (!sigla || p.sigla === sigla || p.sigla === '?')).slice(0, 7)
    : []
  function agregarDelCatalogo(p) { setItems([...items, { codigo: p.codigo || '', nombre: p.nombre, cantidad: 1, precio: p.ultimo_costo || 0 }]); setBuscarCat('') }
  const setItem = (i, campo, val) => setItems(items.map((it, j) => j === i ? { ...it, [campo]: val } : it))
  const addFila = () => setItems([...items, { codigo: '', nombre: '', cantidad: 1, precio: 0 }])
  const quitarFila = i => setItems(items.filter((_, j) => j !== i))

  function guardarCfg() { setConfig(cfg); setEditandoDatos(false); refresh() }

  const totalUnidades = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0)
  const totalDinero = items.reduce((s, it) => s + (Number(it.precio) || 0) * (Number(it.cantidad) || 0), 0)
  const prov = PROVEEDORES.find(p => p.sigla === sigla)
  const puede = sigla && items.length > 0 && items.every(it => it.nombre.trim())

  function generar() {
    if (!puede) return
    const pedido = {
      sigla, proveedorNombre: provNombre(sigla), nit: prov?.nit || '',
      fecha: hoyISO(), lugar: lugar.trim(),
      items: items.map(it => ({ codigo: it.codigo.trim(), nombre: it.nombre.trim(), cantidad: Number(it.cantidad) || 0, precio: Number(it.precio) || 0 })),
      incluyePrecios, observaciones: obs.trim(),
      pago: pagoTipo === 'credito' ? { tipo: 'credito', dias: Number(pagoDias) || 30, vencimiento: venceEn(Number(pagoDias) || 30) } : { tipo: 'contado' },
      totalUnidades, totalDinero: incluyePrecios ? totalDinero : 0,
    }
    const saved = addPedido(pedido)
    generarComprobantePDF(saved, getConfig())
    items.forEach(it => { if (it.pendienteId) updatePendiente(it.pendienteId, { estado: 'pedido' }) })
    volver(); refresh()
  }

  // ════════════════════════ NIVEL 2: ARMAR COMPROBANTE ════════════════════════
  if (armando) return (
    <div className="space-y-5">
      <button className="text-[#2980b9] font-mono text-sm hover:underline" onClick={volver}>← Volver a proveedores</button>
      <h2 className="text-2xl font-bold font-mono">📄 Armar comprobante {sigla && <span className="text-[#666]">· {sigla}</span>}</h2>

      {/* Paso 1: Productos */}
      <div className="pcard space-y-3">
        <h3 className="font-mono font-semibold text-lg">1 · Productos a pedir</h3>
        {items.length === 0 && <p className="text-sm text-[#999] font-mono">Agregue productos del catálogo o filas manuales abajo.</p>}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr>
                {['Código', 'Producto', 'Cant.', ...(incluyePrecios ? ['V. Unit.', 'Total'] : []), ''].map(h =>
                  <th key={h} className="bg-[#1a1a1a] text-white text-left px-2 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-[#e0ddd5]">
                    <td className="px-2 py-1.5"><input className="input-plat py-1" style={{ width: 90 }} value={it.codigo} onChange={e => setItem(i, 'codigo', e.target.value)} /></td>
                    <td className="px-2 py-1.5"><input className="input-plat py-1" style={{ minWidth: 220, width: '100%' }} value={it.nombre} onChange={e => setItem(i, 'nombre', e.target.value)} placeholder="Nombre del producto" /></td>
                    <td className="px-2 py-1.5"><input type="number" min="1" className="input-plat py-1 text-center" style={{ width: 70 }} value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} /></td>
                    {incluyePrecios && <td className="px-2 py-1.5"><input type="number" min="0" className="input-plat py-1 text-right" style={{ width: 100 }} value={it.precio} onChange={e => setItem(i, 'precio', e.target.value)} /></td>}
                    {incluyePrecios && <td className="px-2 py-1.5 font-mono text-right text-[#1a6b3c]">{formatCOP((Number(it.precio) || 0) * (Number(it.cantidad) || 0))}</td>}
                    <td className="px-2 py-1.5 text-center"><button className="text-[#c0392b] font-bold" onClick={() => quitarFila(i)} title="Quitar de este pedido (no borra el pendiente)">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex gap-4 flex-wrap items-start">
          <div className="relative" style={{ minWidth: 320, flex: 1 }}>
            <input className="input-plat" placeholder="🔍 Agregar producto del catálogo (código y costo automáticos)…"
              value={buscarCat} onChange={e => setBuscarCat(e.target.value)} autoComplete="off" />
            {buscarCat.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-[#1a1a1a] z-20 max-h-64 overflow-y-auto shadow-xl">
                {matchesCat.length === 0 ? <p className="px-3 py-2 text-sm text-[#999] font-mono">Sin coincidencias en el catálogo</p> :
                  matchesCat.map((p, i) => (
                    <button key={i} onClick={() => agregarDelCatalogo(p)} className="block w-full text-left px-3 py-2 border-b border-[#eee] hover:bg-[#fffbe6]">
                      <span className="block font-semibold text-sm">{p.nombre}</span>
                      <span className="block text-xs text-[#999] font-mono">{p.codigo || 'sin código'} · {p.sigla} · costo {formatCOP(p.ultimo_costo)}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button className="text-[#2980b9] font-mono text-sm hover:underline pt-2" onClick={addFila}>+ Fila manual (vacía)</button>
        </div>
      </div>

      {/* Paso 2: Condiciones */}
      <div className="pcard space-y-4">
        <h3 className="font-mono font-semibold text-lg">2 · Condiciones del pedido</h3>
        <div className="flex gap-4 flex-wrap items-end">
          <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Proveedor</span>
            <select className="input-plat" style={{ width: 260 }} value={sigla} onChange={e => setSigla(e.target.value)}>
              <option value="">— Elegir proveedor —</option>
              {PROVEEDORES.map((p, i) => <option key={i} value={p.sigla}>{p.sigla} · {p.nombre}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Lugar de emisión</span>
            <input className="input-plat" style={{ width: 170 }} placeholder="Ciudad" value={lugar} onChange={e => setLugar(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Forma de pago</span>
            <select className="input-plat" value={pagoTipo} onChange={e => setPagoTipo(e.target.value)}>
              <option value="contado">Contado</option><option value="credito">Crédito</option>
            </select></label>
          {pagoTipo === 'credito' && (
            <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Plazo</span>
              <select className="input-plat" value={pagoDias} onChange={e => setPagoDias(e.target.value)}>
                {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} días</option>)}
              </select></label>
          )}
          {pagoTipo === 'credito' && <div className="font-mono text-sm text-[#8a6d0f] bg-[#fffbe6] border border-[#d4a017] px-3 py-2 self-end">Vence: <b>{fechaCorta(venceEn(Number(pagoDias) || 30))}</b></div>}
        </div>
        <div className="flex gap-6 flex-wrap items-center">
          <label className="flex items-center gap-2 text-sm font-mono text-[#666] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#1a6b3c]" checked={incluyePrecios} onChange={e => setIncluyePrecios(e.target.checked)} />
            Incluir precios en el comprobante
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>Observaciones (opcional)</span>
          <input className="input-plat" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej: entregar en horario de la mañana" /></label>
      </div>

      {/* Paso 3: Generar */}
      <div className="pcard flex flex-wrap items-center justify-between gap-4">
        <div className="font-mono text-sm">
          <span className="text-[#999]">Total:</span> <b>{items.length} producto(s) · {totalUnidades} und</b>
          {incluyePrecios && <> · <b className="text-[#1a6b3c]">{formatCOP(totalDinero)}</b></>}
          {!sigla && <span className="text-[#c0392b] block mt-1">⚠ Elija el proveedor para poder generar</span>}
        </div>
        <button disabled={!puede} className="btn-plat text-base px-6 py-3 border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={generar}>📄 Generar comprobante PDF</button>
      </div>
    </div>
  )

  // ════════════════════════ NIVEL 1: PANEL DE PROVEEDORES ════════════════════════
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold font-mono">📋 Pedidos a proveedores</h2>
      <p className="text-[#666] text-sm">Elija un proveedor para armar su pedido con lo que está pendiente, o empiece uno en blanco.</p>

      <div className="sec-title">Pendientes por pedir, por proveedor</div>
      {listaProv.length === 0 ? (
        <div className="pcard"><p className="text-[#666] text-sm">No hay pendientes por pedir. Puede empezar un pedido en blanco abajo. 👇</p></div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {listaProv.map(([g, info]) => (
            <button key={g} onClick={() => abrirProveedor(g)}
              className="text-left bg-white border-2 border-[#1a1a1a] p-4 transition-all hover:bg-[#1a1a1a] hover:-translate-y-0.5 group">
              <div className="flex items-baseline justify-between">
                <span className="font-mono font-bold text-lg">{g === '—' ? 'Sin proveedor' : g}</span>
                <span className="font-mono text-2xl font-bold text-[#1a6b3c] group-hover:text-[#86efac]">{info.n}</span>
              </div>
              <div className="text-xs text-[#666] group-hover:text-[#bbb] font-mono mt-1 truncate">{g === '—' ? 'asignar al armar' : provNombre(g)}</div>
              <div className="text-xs text-[#999] group-hover:text-[#bbb] font-mono mt-2">{info.n} pendiente(s) · {info.und} und · armar →</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-plat border-[#2980b9] text-[#2980b9] hover:bg-[#2980b9] hover:text-white" onClick={pedidoEnBlanco}>+ Pedido en blanco</button>
        <span className="text-xs text-[#999] font-mono">para un proveedor sin pendientes registrados</span>
      </div>

      {/* Comprobantes generados */}
      {pedidos.length > 0 && (<>
        <div className="sec-title">Comprobantes generados ({pedidos.length})</div>
        <div className="pcard overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Nº', 'Proveedor', 'Fecha', 'Unid.', 'Pago', 'Estado', ''].map(h =>
              <th key={h} className="bg-[#1a1a1a] text-white text-left px-3 py-2 text-xs font-mono uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} className="border-b border-[#e0ddd5]">
                  <td className="px-3 py-2 font-mono font-semibold">{p.numero}</td>
                  <td className="px-3 py-2">{p.sigla} · {provNombre(p.sigla)}</td>
                  <td className="px-3 py-2 font-mono">{fechaCorta(p.fecha)}</td>
                  <td className="px-3 py-2 font-mono text-center">{p.totalUnidades}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.pago?.tipo === 'credito' ? `Crédito ${p.pago.dias}d` : 'Contado'}</td>
                  <td className="px-3 py-2">{p.estadoPago === 'pagado'
                    ? <span className="text-[#1a6b3c] font-mono text-xs font-semibold">Pagado ✓</span>
                    : p.pago?.tipo === 'credito' ? <span className="text-[#8a6d0f] font-mono text-xs">Crédito pendiente</span> : <span className="text-[#999] font-mono text-xs">—</span>}</td>
                  <td className="px-3 py-2"><button className="text-[#2980b9] font-mono text-xs hover:underline" onClick={() => generarComprobantePDF(p, getConfig())}>⬇ PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="text-[#8e44ad] font-mono text-sm hover:underline mt-3" onClick={() => nav('/creditos')}>Ver control de créditos →</button>
        </div>
      </>)}

      {/* Datos del almacén (secundario) */}
      <div className="pcard">
        <div className="flex items-center justify-between">
          <h3 className="font-mono font-semibold text-sm text-[#666]">🏢 Datos del almacén (encabezado del comprobante)</h3>
          <button className="text-[#2980b9] font-mono text-sm hover:underline" onClick={() => { setCfg(getConfig()); setEditandoDatos(!editandoDatos) }}>{editandoDatos ? 'Cancelar' : 'Editar'}</button>
        </div>
        {!editandoDatos ? (
          <p className="text-xs text-[#999] mt-1 font-mono">{cfg.nombre} · NIT {cfg.nit}{cfg.ciudad ? ' · ' + cfg.ciudad : ''}{cfg.telefono ? ' · Tel ' + cfg.telefono : ''}
            {!cfg.direccion && !cfg.telefono && <span className="text-[#c0392b]"> — complete dirección y teléfono para un comprobante más formal</span>}</p>
        ) : (
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            {[['nombre', 'Nombre del almacén'], ['nit', 'NIT'], ['propietario', 'Propietario'], ['direccion', 'Dirección'], ['ciudad', 'Ciudad'], ['telefono', 'Teléfono']].map(([k, lbl]) => (
              <label key={k} className="flex flex-col gap-1 text-xs font-mono text-[#666]"><span>{lbl}</span>
                <input className="input-plat" value={cfg[k] || ''} onChange={e => setCfg({ ...cfg, [k]: e.target.value })} /></label>
            ))}
            <div className="flex items-end"><button className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={guardarCfg}>Guardar datos</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
