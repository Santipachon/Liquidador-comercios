import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

// ─── Config ───────────────────────────────────────────────────────────────────
const LETRA_MAP = {
  1: 'R', 2: 'E', 3: 'P', 4: 'U', 5: 'B',
  6: 'L', 7: 'I', 8: 'C', 9: 'A', 0: 'S',
}

// ─── Parser XML DIAN ──────────────────────────────────────────────────────────
function parsearFacturaDIAN(xmlText) {
  let xmlFactura = xmlText
  if (xmlText.includes('AttachedDocument')) {
    const cdataMatches = [...xmlText.matchAll(/\<!\[CDATA\[([\s\S]*?)\]\]\>/g)]
    for (const match of cdataMatches) {
      if (match[1].includes('InvoiceLine') || match[1].includes('<Invoice')) {
        xmlFactura = match[1]
        break
      }
    }
  }
  const lineas = []
  let re = /<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>/g
  let m
  while ((m = re.exec(xmlFactura)) !== null) lineas.push(m[1])
  if (lineas.length === 0) {
    re = /<InvoiceLine>([\s\S]*?)<\/InvoiceLine>/g
    while ((m = re.exec(xmlFactura)) !== null) lineas.push(m[1])
  }
  if (lineas.length === 0) return []
  return lineas.map((linea, idx) => {
    const nombre = getTag(linea, 'cbc:Description') || getTag(linea, 'Description') || `Producto ${idx + 1}`
    const codigoMatch = linea.match(/<cac:SellersItemIdentification>[\s\S]*?<cbc:ID[^>]*>(.*?)<\/cbc:ID>/i)
    const codigo = codigoMatch ? codigoMatch[1].trim() : `COD${String(idx + 1).padStart(3, '0')}`
    const cantidad = parseFloat(getTag(linea, 'cbc:InvoicedQuantity') || '1') || 1
    const precio_unitario = parseFloat(getTag(linea, 'cbc:PriceAmount') || '0') || 0
    const subtotal = parseFloat(getTag(linea, 'cbc:LineExtensionAmount') || '0') || (precio_unitario * cantidad)
    const iva = parseFloat(getTag(linea, 'cbc:TaxAmount') || '0') || 0
    return {
      nombre: nombre.replace(/\t/g, ' ').trim().substring(0, 80),
      codigo: codigo.trim().substring(0, 30),
      cantidad: Math.round(cantidad),
      precio_unitario: Math.round(precio_unitario),
      subtotal: Math.round(subtotal),
      iva: Math.round(iva),
      total: Math.round(subtotal + iva),
    }
  })
}

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : ''
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function numToLetras(num) {
  return String(Math.round(num)).split('').map(d => LETRA_MAP[parseInt(d)] ?? d).join('')
}

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function aproximar(n) {
  // Aproxima al siguiente múltiplo de 100
  return Math.ceil(n / 100) * 100
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconUpload() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  )
}

function IconExcel() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ onFile, loading }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      className={`upload-zone rounded-none p-12 flex flex-col items-center justify-center gap-5 cursor-pointer select-none ${dragging ? 'dragging' : ''}`}
      onClick={() => !loading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".xml,.zip" className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }}
        disabled={loading} />
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-[#1a1a1a] border-t-transparent rounded-full animate-spin" />
          <p className="text-2xl font-semibold text-[#1a1a1a]">Procesando factura...</p>
          <p className="text-base text-[#666]">Por favor espere</p>
        </div>
      ) : (
        <>
          <div className="text-[#1a1a1a] pulse-ring"><IconUpload /></div>
          <div className="text-center">
            <p className="text-3xl font-bold text-[#1a1a1a] tracking-tight">+ Subir factura</p>
            <p className="text-lg text-[#666] mt-2">Haga clic aquí o arrastre su archivo</p>
          </div>
          <span className="text-sm font-mono text-[#999] bg-[#e8e6e0] px-3 py-1">Archivos .xml o .zip</span>
        </>
      )}
    </div>
  )
}

// ─── Product Row ──────────────────────────────────────────────────────────────
function ProductRow({ product, index, onUpdate }) {
  const { nombre, codigo, cantidad, precio_unitario, margen, tieneIva, aproximado } = product

  // Base: precio unitario
  let precio = precio_unitario
  // Aplicar margen
  precio = precio * (1 + margen / 100)
  // Aplicar IVA si aplica
  if (tieneIva) precio = precio * 1.19
  // Aproximar si aplica
  if (aproximado) precio = aproximar(precio)
  else precio = Math.round(precio)

  const codigoLetras = numToLetras(precio)

  return (
    <tr className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
      <td className="table-cell font-semibold text-sm">{nombre}</td>
      <td className="table-cell font-mono text-[#555] text-sm">{codigo}</td>
      <td className="table-cell text-center font-mono font-semibold">{cantidad}</td>
      <td className="table-cell font-mono text-sm">{formatCOP(precio_unitario)}</td>
      <td className="table-cell">
        <div className="flex items-center gap-1">
          <input type="number" min="0" max="999" value={margen}
            onChange={(e) => onUpdate(index, 'margen', parseFloat(e.target.value) || 0)}
            className="margin-input" />
          <span className="text-[#999] font-mono text-xs">%</span>
        </div>
      </td>
      <td className="table-cell">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={tieneIva}
            onChange={(e) => onUpdate(index, 'tieneIva', e.target.checked)}
            className="w-4 h-4 cursor-pointer accent-[#1a6b3c]" />
          <span className="text-sm font-mono text-[#555]">19%</span>
        </label>
      </td>
      <td className="table-cell">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={aproximado}
            onChange={(e) => onUpdate(index, 'aproximado', e.target.checked)}
            className="w-4 h-4 cursor-pointer accent-[#1a6b3c]" />
          <span className="text-xs font-mono text-[#555]">↑100</span>
        </label>
      </td>
      <td className="table-cell"><span className="calculated-cell">{formatCOP(precio)}</span></td>
      <td className="table-cell"><span className="code-cell">{codigoLetras}</span></td>
    </tr>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null
  const colors = { error: 'bg-[#c0392b] text-white', success: 'bg-[#1a6b3c] text-white', info: 'bg-[#1a1a1a] text-white' }
  return <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 font-semibold text-base shadow-xl fade-in max-w-sm ${colors[type] || colors.info}`}>{message}</div>
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)

  function showToast(message, type = 'info', duration = 3500) {
    setToast({ message, type })
    setTimeout(() => setToast(null), duration)
  }

  async function processXml(xmlText) {
    const data = parsearFacturaDIAN(xmlText)
    if (!data || data.length === 0)
      throw new Error('No se encontraron productos. Verifique que sea una factura electrónica DIAN válida.')
    setProducts(data.map(p => ({
      ...p,
      margen: 30,
      tieneIva: false,
      aproximado: false,
    })))
    showToast(`✓ ${data.length} producto(s) cargados`, 'success')
  }

  async function handleFile(file) {
    setFileName(file.name)
    setError(null)
    setLoading(true)
    setPdfUrl(null)

    try {
      if (file.name.endsWith('.zip')) {
        // Procesar ZIP: extraer XML y PDF
        const zip = await JSZip.loadAsync(file)

        let xmlText = null
        let pdfBlob = null

        for (const [name, entry] of Object.entries(zip.files)) {
          if (!entry.dir) {
            const lower = name.toLowerCase()
            if (lower.endsWith('.xml') && !xmlText) {
              xmlText = await entry.async('string')
            }
            if (lower.endsWith('.pdf') && !pdfBlob) {
              const pdfData = await entry.async('blob')
              pdfBlob = new Blob([pdfData], { type: 'application/pdf' })
            }
          }
        }

        if (pdfBlob) {
          const url = URL.createObjectURL(pdfBlob)
          setPdfUrl(url)
        }

        if (!xmlText) throw new Error('No se encontró un archivo XML dentro del ZIP.')
        await processXml(xmlText)

      } else if (file.name.endsWith('.xml')) {
        const xmlText = await file.text()
        await processXml(xmlText)
      } else {
        throw new Error('Solo se aceptan archivos .xml o .zip')
      }
    } catch (err) {
      const msg = err.message || 'No se pudo procesar la factura.'
      setError(msg)
      showToast(msg, 'error', 6000)
    } finally {
      setLoading(false)
    }
  }

  function handleUpdate(index, field, value) {
    setProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  function handleIvaAll() {
    setProducts(prev => prev.map(p => ({ ...p, tieneIva: true })))
    showToast('IVA 19% aplicado a todos los productos', 'success')
  }

  function handleAproximarAll() {
    setProducts(prev => prev.map(p => ({ ...p, aproximado: true })))
    showToast('Aproximación activada para todos', 'success')
  }

  function handleClear() {
    setProducts([]); setError(null); setFileName(null); setPdfUrl(null)
  }

  function calcPrecio(p) {
    let precio = p.precio_unitario
    precio = precio * (1 + p.margen / 100)
    if (p.tieneIva) precio = precio * 1.19
    if (p.aproximado) precio = aproximar(precio)
    else precio = Math.round(precio)
    return precio
  }

  function handleExport() {
    if (!products.length) return
    const today = new Date()
    const fecha = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    const filas = products.map(p => {
      const precio = calcPrecio(p)
      return {
        'Nombre del producto': p.nombre,
        'Código de producto': p.codigo,
        'Código interno': numToLetras(precio),
        'Fecha de impresión': fecha,
      }
    })
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{ wch: 45 }, { wch: 22 }, { wch: 18 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    const nombreArchivo = `liquidacion_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(wb, nombreArchivo)
    showToast('✓ Excel descargado correctamente', 'success')
  }

  const hasProducts = products.length > 0

  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <header className="bg-[#1a1a1a] text-white px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-mono">LIQUIDACIONES ALMACEN EL ACERO</h1>
            <p className="text-[#aaa] text-sm font-mono tracking-widest mt-0.5">Nayibe Talero</p>
          </div>
          {hasProducts && (
            <span className="font-mono text-[#aaa] text-sm">{products.length} producto{products.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-10 space-y-8">

        <UploadZone onFile={handleFile} loading={loading} />

        {/* Vista previa PDF */}
        {pdfUrl && (
          <div className="border-2 border-[#1a1a1a] bg-white fade-in">
            <div className="bg-[#1a1a1a] text-white px-4 py-2 flex items-center justify-between">
              <span className="font-mono text-sm">Vista previa — Factura PDF</span>
              <button onClick={() => window.open(pdfUrl, '_blank')}
                className="text-xs font-mono text-[#aaa] hover:text-white transition-colors">
                Abrir en pestaña nueva ↗
              </button>
            </div>
            <iframe src={pdfUrl} className="w-full" style={{ height: '500px' }} title="Factura PDF" />
          </div>
        )}

        {error && !loading && (
          <div className="bg-[#fdf2f2] border-l-4 border-[#c0392b] px-6 py-5 fade-in">
            <p className="font-semibold text-[#c0392b] text-lg mb-1">⚠ Hubo un problema</p>
            <p className="text-[#7f1d1d] text-base">{error}</p>
          </div>
        )}

        {hasProducts && (
          <section className="space-y-4 fade-in">
            {/* Barra de acciones globales */}
            <div className="flex gap-3 flex-wrap items-center">
              <div className="bg-[#f0fdf4] border border-[#86efac] px-4 py-2 font-mono text-sm text-[#1a6b3c]">
                ● Precio calculado sobre precio unitario
              </div>
              <button onClick={handleIvaAll}
                className="px-4 py-2 border-2 border-[#2980b9] text-[#2980b9] font-semibold text-sm font-mono hover:bg-[#2980b9] hover:text-white transition-colors">
                + IVA 19% a todos
              </button>
              <button onClick={handleAproximarAll}
                className="px-4 py-2 border-2 border-[#8e44ad] text-[#8e44ad] font-semibold text-sm font-mono hover:bg-[#8e44ad] hover:text-white transition-colors">
                ↑ Aproximar todos
              </button>
            </div>

            <div className="border-2 border-[#1a1a1a] bg-white overflow-x-auto">
              <table className="w-full border-collapse min-w-[1050px]">
                <thead>
                  <tr>
                    <th className="table-header">Producto</th>
                    <th className="table-header">Código</th>
                    <th className="table-header">Cant.</th>
                    <th className="table-header">Precio unitario</th>
                    <th className="table-header">Margen (%)</th>
                    <th className="table-header">IVA</th>
                    <th className="table-header">Aprox.</th>
                    <th className="table-header">Precio venta</th>
                    <th className="table-header">Código letras</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <ProductRow key={i} product={p} index={i} onUpdate={handleUpdate} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 flex-wrap pt-2">
              <button onClick={handleExport}
                className="flex items-center gap-2 font-semibold text-base px-6 py-3 border-2 border-[#1a6b3c] text-[#1a6b3c] bg-transparent transition-all duration-200 hover:bg-[#1a6b3c] hover:text-white cursor-pointer">
                <IconExcel /> Imprimir / Excel
              </button>
              <button className="btn-danger flex items-center gap-2" onClick={handleClear}>
                <IconTrash /> Limpiar
              </button>
            </div>
          </section>
        )}

        {!hasProducts && !loading && !error && (
          <div className="text-center py-8">
            <p className="text-[#aaa] font-mono text-base tracking-wide">Suba una factura XML o ZIP para comenzar</p>
          </div>
        )}

        {hasProducts && (
          <section className="border-t border-[#ddd] pt-6">
            <p className="text-sm font-mono font-semibold text-[#555] uppercase tracking-widest mb-3">Tabla conversión — Código letras</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LETRA_MAP).map(([num, letra]) => (
                <div key={num} className="bg-white border border-[#e0ddd5] px-3 py-1.5 flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[#1a1a1a]">{num}</span>
                  <span className="text-[#ccc]">→</span>
                  <span className="font-mono font-bold text-[#1a6b3c]">{letra}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[#e0ddd5] mt-16 py-6 px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-[#aaa] font-mono text-xs">LIQUIDACIONES ALMACEN EL ACERO · Compatible con facturas electrónicas DIAN Colombia</p>
        </div>
      </footer>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}
