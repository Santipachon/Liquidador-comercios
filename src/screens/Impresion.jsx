import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFacturas, marcarImpreso, desmarcarImpreso } from '../lib/db'
import { formatCOP, fechaCorta, provNombre } from '../lib/shared'
import {
  soportado, soportadoSerial, conectar, conectarSerial, conectada, nombreImpresora, olvidar, alDesconectar, alRegistrar,
  imprimirPrueba, imprimirFactura, vistaPrevia, etiquetaDeItem, contarEtiquetas, estaImprimiendo, cancelarImpresion,
} from '../lib/printer'

// Traduce errores técnicos a algo que un empleado entienda y pueda accionar.
function mensajeAmigable(e) {
  const m = String(e?.message || e)
  if (/en curso/i.test(m)) return m
  if (/conexi|conectad|COM|GATT|desconect|perdió/i.test(m)) return 'Se perdió la conexión con la impresora. Vuelve a pulsar "Conectar por COM".'
  if (/timeout/i.test(m)) return 'La impresora no respondió. Revisa que esté encendida y con papel, y reintenta.'
  return 'Error al imprimir: ' + m
}

// Pantalla "Etiquetas por imprimir":
//   1. Conectar la Phomemo M110 por Bluetooth (una vez).
//   2. Imprimir la factura liquidada con un botón en su fila.
//   3. Se marca ✅ impresa (se guarda en la nube) para no repetir.
// Requiere Chrome/Edge en Android o PC — iPhone/iPad no imprimen (solo liquidan).
export default function Impresion() {
  const { usuario } = useOutletContext()
  const [, forzar] = useState(0)
  const refrescar = () => forzar(n => n + 1)

  const compatible = soportado()
  const [printer, setPrinter] = useState({ on: conectada(), nombre: nombreImpresora() })
  const [conectando, setConectando] = useState(false)
  const [estado, setEstado] = useState({})    // { [facturaId]: { imprimiendo, hechas, total, error } }
  const [preview, setPreview] = useState(null) // { src, titulo }
  const [filtro, setFiltro] = useState('listas')
  const [aviso, setAviso] = useState('')
  const [logs, setLogs] = useState([])   // diagnóstico en pantalla
  const [impGlobal, setImpGlobal] = useState(false)   // hay un trabajo de impresión en curso

  // Refleja en pantalla si la impresora se desconecta sola (apagada / fuera de rango).
  useEffect(() => {
    alDesconectar(() => setPrinter({ on: false, nombre: null }))
    return () => alDesconectar(null)
  }, [])

  // Captura el log de diagnóstico del módulo de impresión.
  useEffect(() => {
    alRegistrar(m => setLogs(l => [...l.slice(-49), `${new Date().toLocaleTimeString()}  ${m}`]))
    return () => alRegistrar(null)
  }, [])

  // El aviso de éxito se borra solo a los 5 s.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  // Cerrar la vista previa con Escape.
  useEffect(() => {
    if (!preview) return
    const h = e => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [preview])

  const facturas = getFacturas()
  // Una factura está "liquidada" (imprimible) si tiene precio de venta / código en sus ítems.
  const esLiquidada = f => (f.venta || 0) > 0 || (f.items || []).some(it => (it.precio_venta || 0) > 0 || it.codigo_interno)
  const nListas = facturas.filter(f => esLiquidada(f) && !f.impresoAt).length
  const nImp = facturas.filter(f => f.impresoAt).length
  const nFaltan = facturas.filter(f => !esLiquidada(f) && !f.impresoAt).length
  const lista = facturas.filter(f => {
    if (filtro === 'impresas') return !!f.impresoAt
    if (filtro === 'faltan') return !esLiquidada(f) && !f.impresoAt
    return esLiquidada(f) && !f.impresoAt   // 'listas' (por defecto)
  })

  async function conectarImpresora(todos = false) {
    setConectando(true)
    try {
      const nombre = await conectar({ todos })
      setPrinter({ on: true, nombre })
    } catch (e) {
      if (e?.name !== 'NotFoundError') alert(e?.message || 'No se pudo conectar con la impresora.')
      setPrinter({ on: conectada(), nombre: nombreImpresora() })
    } finally { setConectando(false) }
  }

  // Conexión por puerto COM (Web Serial) — la vía confiable en Windows.
  async function conectarCom() {
    setConectando(true)
    try {
      const nombre = await conectarSerial()
      setPrinter({ on: true, nombre })
    } catch (e) {
      if (e?.name !== 'NotFoundError') alert(e?.message || 'No se pudo abrir el puerto COM.')
      setPrinter({ on: conectada(), nombre: nombreImpresora() })
    } finally { setConectando(false) }
  }

  async function prueba() {
    if (estaImprimiendo()) { alert('Ya hay una impresión en curso. Espera a que termine.'); return }
    setLogs([]); setImpGlobal(true)
    try { await imprimirPrueba() }
    catch (e) { alert(mensajeAmigable(e)); setPrinter({ on: conectada(), nombre: nombreImpresora() }) }
    finally { setImpGlobal(false) }
  }

  async function imprimir(f) {
    if (estaImprimiendo()) { alert('Ya hay una impresión en curso. Espera a que termine.'); return }  // lock global síncrono
    if (!printer.on) { alert('Primero conecte la impresora.'); return }
    if (!esLiquidada(f)) { alert('Esta factura aún no está liquidada: no tiene precios ni código. Liquídala primero en 🧾 Liquidar.'); return }
    const total = contarEtiquetas(f)                                // misma cuenta que imprimirá
    if (total === 0) { alert('Esta factura no tiene etiquetas para imprimir.'); return }
    if (total > 30 && !window.confirm(`Se imprimirán ${total} etiquetas de la factura ${f.numero}. ¿Continuar?`)) return
    setLogs([]); setImpGlobal(true)
    setEstado(s => ({ ...s, [f.id]: { imprimiendo: true, hechas: 0, total } }))
    let res = null
    try {
      res = await imprimirFactura(f, {
        onProgreso: (hechas, tot, item) => setEstado(s => ({ ...s, [f.id]: { imprimiendo: true, hechas, total: tot, prod: item?.nombre } })),
      })
    } catch (e) {
      setEstado(s => ({ ...s, [f.id]: { imprimiendo: false, error: mensajeAmigable(e) } }))
      setPrinter({ on: conectada(), nombre: nombreImpresora() })
      setImpGlobal(false)
      return
    }
    setImpGlobal(false)
    setEstado(s => ({ ...s, [f.id]: { imprimiendo: false } }))
    if (res?.cancelado) {
      setAviso(`⏸ Cancelado en ${res.hechas} de ${res.total} etiquetas · factura ${f.numero}`)
      refrescar(); return
    }
    // Confirmar que salieron bien ANTES de marcar impresa: el software no puede saber si
    // se acabó el rollo o se atascó a mitad (los datos igual "salen" sin error).
    const ok = window.confirm(
      `Se enviaron ${res.total} etiqueta(s) de la factura ${f.numero}.\n\n` +
      `¿Salieron TODAS bien?\n\nAceptar = marcar como impresa ✅\nCancelar = no marcar (podrás reimprimir)`
    )
    if (ok) { marcarImpreso(f.id, usuario?.nombre); setAviso(`✅ Factura ${f.numero} marcada como impresa (${res.total} etiquetas).`) }
    else setAviso(`ℹ️ Factura ${f.numero} NO marcada. Puedes reimprimir cuando quieras.`)
    refrescar()
  }

  function verEtiqueta(f) {
    const it = f.items?.[0]
    if (!it) { alert('Esta factura no tiene productos.'); return }
    setPreview({ src: vistaPrevia(etiquetaDeItem(it, f)), titulo: `${f.numero} · ${it.nombre}` })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold font-mono">🏷️ Etiquetas por imprimir</h2>
        <span className="text-sm text-[#777] font-mono">{nListas} listas · {nFaltan} por liquidar</span>
      </div>

      {/* Aviso de éxito (se borra solo) */}
      {aviso && (
        <div className="pcard border-l-[6px] py-2" style={{ borderLeftColor: '#1a6b3c' }}>
          <p className="text-sm text-[#1a6b3c] font-mono">{aviso}</p>
        </div>
      )}

      {/* Aviso de compatibilidad */}
      {!compatible && (
        <div className="pcard border-l-[6px]" style={{ borderLeftColor: '#e67e22' }}>
          <p className="font-bold">⚠️ Este equipo no puede imprimir por Bluetooth</p>
          <p className="text-sm text-[#555] mt-1">
            La impresión directa necesita <b>Chrome</b> o <b>Edge</b> en un <b>Android</b> o <b>PC (Windows/Mac)</b> con Bluetooth.
            En iPhone/iPad no funciona: use esos equipos solo para liquidar, e imprima desde el Android o el PC.
          </p>
        </div>
      )}

      {/* Panel de conexión de la impresora */}
      <div className="pcard flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-3 h-3 rounded-full ${printer.on ? 'bg-[#1a6b3c]' : 'bg-[#c0392b]'}`} />
          <div>
            <p className="font-bold font-mono">{printer.on ? 'Impresora conectada' : 'Impresora desconectada'}</p>
            <p className="text-xs text-[#777] font-mono">{printer.on ? (printer.nombre || 'Phomemo') : 'En Windows: "Conectar por COM" y elija el puerto de la impresora'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!printer.on ? (
            <>
              <button disabled={!soportadoSerial() || conectando} onClick={conectarCom}
                className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white disabled:opacity-40"
                title="Windows: elija 'Standard Serial over Bluetooth link (COMx)'">
                {conectando ? 'Conectando…' : '💻 Conectar por COM (Windows)'}
              </button>
              <button disabled={!compatible || conectando} onClick={() => conectarImpresora(true)}
                className="text-[#2980b9] font-mono text-xs hover:underline disabled:opacity-40"
                title="Bluetooth directo (ideal en Android)">
                o por Bluetooth (Android)
              </button>
            </>
          ) : (
            <>
              <button onClick={prueba} disabled={impGlobal} className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white disabled:opacity-40">🏷️ Imprimir prueba</button>
              <button onClick={() => { olvidar(); setPrinter({ on: false, nombre: null }) }} disabled={impGlobal} className="text-[#777] font-mono text-xs hover:underline disabled:opacity-40">Desconectar</button>
            </>
          )}
        </div>
      </div>

      {/* Panel de diagnóstico — muestra paso a paso qué pasa al imprimir */}
      {logs.length > 0 && (
        <div className="pcard">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold font-mono text-sm">🔎 Diagnóstico de impresión</p>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(logs.join('\n')); setAviso('Diagnóstico copiado') }} className="text-[#2980b9] font-mono text-xs hover:underline">Copiar</button>
              <button onClick={() => setLogs([])} className="text-[#777] font-mono text-xs hover:underline">Limpiar</button>
            </div>
          </div>
          <pre className="bg-[#1e1e1e] text-[#d4d4d4] text-[11px] leading-relaxed font-mono p-3 overflow-auto max-h-56 whitespace-pre-wrap">{logs.join('\n')}</pre>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 font-mono text-sm">
        {[['listas', `Listas (${nListas})`], ['impresas', `Ya impresas (${nImp})`], ['faltan', `Faltan liquidar (${nFaltan})`]].map(([k, txt]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`px-3 py-1.5 border-2 ${filtro === k ? 'bg-[#33302b] text-white border-[#33302b]' : 'border-[#d8d4cc] text-[#555] hover:border-[#33302b]'}`}>
            {txt}
          </button>
        ))}
      </div>

      {/* Lista de facturas */}
      {lista.length === 0 ? (
        <div className="pcard text-center py-10"><p className="text-[#666]">
          {filtro === 'listas' ? '🎉 No hay facturas liquidadas por imprimir.' : filtro === 'faltan' ? 'No hay facturas pendientes por liquidar.' : 'Aún no has impreso ninguna.'}
        </p></div>
      ) : (
        <div className="space-y-3">
          {lista.map(f => {
            const st = estado[f.id] || {}
            const imp = !!f.impresoAt
            const liq = esLiquidada(f)
            const nEti = contarEtiquetas(f)
            return (
              <div key={f.id} className={`pcard flex items-center justify-between flex-wrap gap-3 ${imp ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <p className={`font-bold font-mono ${imp ? 'line-through text-[#888]' : ''}`}>
                    {f.numero} <span className="text-[#999] font-normal">· {f.sigla} {provNombre(f.sigla)}</span>
                  </p>
                  <p className="text-xs text-[#777] font-mono mt-0.5">
                    {fechaCorta(f.fecha)} · {f.num_productos} productos{liq ? <> · <b>{nEti} etiquetas</b> · venta {formatCOP(f.venta)}</> : ' · sin precio/código'}
                  </p>
                  {imp && <p className="text-xs text-[#1a6b3c] font-mono mt-1">✅ Impresa{f.impresoPor ? ` por ${f.impresoPor}` : ''} · {fechaCorta(f.impresoAt)}</p>}
                  {st.error && <p className="text-xs text-[#c0392b] font-mono mt-1">⚠️ {st.error}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {st.imprimiendo ? (
                    <div className="flex items-center gap-3">
                      <div className="min-w-[150px]">
                        <div className="font-mono text-sm text-[#2980b9]">Imprimiendo {st.hechas}/{st.total}…</div>
                        {st.prod && <div className="font-mono text-[10px] text-[#999] truncate max-w-[170px]">{st.prod}</div>}
                        <div className="h-1.5 bg-[#e5e5e5] mt-1 w-40"><div className="h-full bg-[#2980b9]" style={{ width: `${st.total ? Math.round((st.hechas / st.total) * 100) : 0}%` }} /></div>
                      </div>
                      <button onClick={cancelarImpresion} className="btn-plat border-[#c0392b] text-[#c0392b] hover:bg-[#c0392b] hover:text-white text-sm py-1.5">✕ Cancelar</button>
                    </div>
                  ) : (<>
                    <button onClick={() => verEtiqueta(f)} className="btn-plat border-[#8e44ad] text-[#8e44ad] hover:bg-[#8e44ad] hover:text-white text-sm py-1.5">👁 Ver</button>
                    {imp ? (
                      <button onClick={() => { desmarcarImpreso(f.id); refrescar() }} disabled={impGlobal} className="text-[#777] font-mono text-xs hover:underline disabled:opacity-40">Desmarcar</button>
                    ) : liq ? (
                      <button onClick={() => imprimir(f)} disabled={!printer.on || nEti === 0 || impGlobal}
                        title={nEti === 0 ? 'Esta factura no tiene etiquetas' : ''}
                        className="btn-plat border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-sm py-1.5">
                        🖨️ Imprimir {nEti}
                      </button>
                    ) : (
                      <span className="font-mono text-xs text-[#b45309] bg-[#fef3c7] border border-[#fde68a] px-2 py-1" title="Falta ponerle margen/precio en 🧾 Liquidar">⚠ Falta liquidar</span>
                    )}
                  </>)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Vista previa de la etiqueta */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" aria-label="Vista previa de la etiqueta"
            className="bg-white border-[3px] border-[#33302b] p-4 max-w-xs" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-xs text-[#777] mb-2 truncate">{preview.titulo}</p>
            <img src={preview.src} alt="Etiqueta" className="border border-[#ccc] w-full" style={{ imageRendering: 'pixelated' }} />
            <p className="text-[10px] text-[#999] font-mono mt-2">Vista aproximada (30×20 mm). El tamaño real depende de la etiqueta cargada.</p>
            <button onClick={() => setPreview(null)} className="btn-plat w-full mt-3 border-[#33302b] text-[#33302b] hover:bg-[#33302b] hover:text-white">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
