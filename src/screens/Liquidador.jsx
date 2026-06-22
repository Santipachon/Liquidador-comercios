import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { getBandeja, addABandeja, quitarDeBandeja, getProveedores, addProveedor } from '../lib/db'
import { supabase } from '../lib/supabase'

// ─── Config ───────────────────────────────────────────────────────────────────
const LETRA_MAP = {
  1: 'R', 2: 'E', 3: 'P', 4: 'U', 5: 'B',
  6: 'L', 7: 'I', 8: 'C', 9: 'A', 0: 'S',
}

// Tabla de proveedores del almacén: el NIT identifica la sigla a asignar
const PROVEEDORES = [
  { nombre: 'JULIO RAMIREZ', sigla: 'JR', nit: '19141690-6' },
  { nombre: 'DAGO', sigla: 'DG', nit: '901626462-5' },
  { nombre: 'SANTOS HIGUERA', sigla: 'SH', nit: '7213967-7' },
  { nombre: 'RODACOL', sigla: 'RD', nit: '860015737-5' },
  { nombre: 'INTERNACIONAL DE RODAMIENTOS', sigla: 'IRT', nit: '860516860-3' },
  { nombre: 'IMPORTACIONES INTERTRAM', sigla: 'INT', nit: '830126983-8' },
  { nombre: 'GRUPO COLOMBIANO FERRETERO SAS', sigla: 'COLF', nit: '900811868' },
  { nombre: 'LUBRIECONOMICOS', sigla: 'LECO', nit: '901358696-1' },
  { nombre: 'MULTIFILTROS MOTORLUB', sigla: 'MULTIF', nit: '804004105-1' },
  { nombre: 'MOTOR KOTE SONIA GARCIA', sigla: 'MOTORK', nit: '23350702' },
  { nombre: 'LUBESOL', sigla: 'LB', nit: '900387475-0' },
  { nombre: 'TECNIGRAPAS', sigla: 'TG', nit: '860403249-7' },
  { nombre: 'IMPORTADORA LA HORMIGA', sigla: 'HG', nit: '900538118-5' },
  { nombre: 'SOLHICOL', sigla: 'SOLH', nit: '901148180-2' },
  { nombre: 'JAIME CASTAÑO', sigla: 'JC', nit: '901790667-9' },
  { nombre: 'EMPACAR LIMITADA', sigla: 'EMP', nit: '860060222-5' },
  { nombre: 'RODAMUNDI', sigla: 'RM', nit: '830115250-0' },
  { nombre: 'DYNA', sigla: 'DY', nit: '890901298-3' },
  { nombre: 'MUNDIAL DE TORNILLOS SA', sigla: 'MT', nit: '830057186-8' },
  { nombre: 'CI FILTERS SAS', sigla: 'CIF', nit: '900528407-6' },
  { nombre: 'INMAGRO (CHUMAZERAS)', sigla: 'ING', nit: '901470900-8' },
  { nombre: 'JAVIER H', sigla: 'JH', nit: '901786153' },
  { nombre: 'GRASAS Y LUBRICANTES DE COLOMBIA', sigla: 'GYL', nit: '901229341-1' },
  { nombre: 'MARKEM', sigla: 'MK', nit: '900588708-4' },
  { nombre: 'DIELCO ELECTRIC', sigla: 'DIELC', nit: '830081566' },
  { nombre: 'FERREIMPORTACIONES MAX LTD.', sigla: 'FMX', nit: '900203050-5' },
  { nombre: 'SELLOS Y SUMINISTROS', sigla: 'SYS', nit: '901212603' },
  { nombre: 'AUTOPERNOS', sigla: 'AUTP', nit: '17054684-1' },
  { nombre: 'EL RODAMIENTO', sigla: 'ELRD', nit: '890700877-55' },
]

// Compara dos NIT tolerando guion, dígito de verificación (DV) y DV pegado al final.
// Genera las variantes completas de cada NIT (con DV, sin DV) y exige igualdad
// exacta entre variantes — así un NIT incompleto o distinto NUNCA coincide.
function nitsCoinciden(a, b) {
  const variantes = (raw) => {
    const s = String(raw).trim()
    const digits = s.replace(/\D/g, '')
    const v = new Set()
    if (digits.length >= 7) v.add(digits)
    if (s.includes('-')) {
      // Con guion: la parte antes del guion es el NIT base
      const base = s.split('-')[0].replace(/\D/g, '')
      if (base.length >= 7) v.add(base)
    } else if (digits.length >= 8) {
      // Sin guion: puede traer el DV pegado al final
      v.add(digits.slice(0, -1))
    }
    return v
  }
  const va = variantes(a)
  for (const x of variantes(b)) if (va.has(x)) return true
  return false
}

// Extrae NIT y nombre del proveedor (emisor) de la factura DIAN
function extraerProveedor(xmlText) {
  const bloque =
    (xmlText.match(/<cac:AccountingSupplierParty>[\s\S]*?<\/cac:AccountingSupplierParty>/i) || [])[0] ||
    (xmlText.match(/<cac:SenderParty>[\s\S]*?<\/cac:SenderParty>/i) || [])[0] || ''
  const nitMatch = bloque.match(/<cbc:CompanyID[^>]*>([^<]+)<\/cbc:CompanyID>/i)
  const nombreMatch = bloque.match(/<cbc:RegistrationName[^>]*>([^<]+)<\/cbc:RegistrationName>/i)
  return {
    nit: nitMatch ? nitMatch[1].trim() : '',
    nombre: nombreMatch ? nombreMatch[1].trim() : '',
  }
}

// Busca el proveedor en la tabla por NIT; null si no hay coincidencia segura
function matchProveedor(nit) {
  if (!nit) return null
  return getProveedores().find(p => nitsCoinciden(p.nit, nit)) || null
}

// Extrae el número de la factura (ej: TGE121432, FEV5369)
function extraerNumeroFactura(xmlText) {
  const m =
    xmlText.match(/<cbc:ParentDocumentID[^>]*>([^<]+)<\/cbc:ParentDocumentID>/i) ||
    xmlText.match(/<Invoice[\s\S]*?<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/i)
  if (!m) return ''
  // Solo caracteres seguros para nombre de archivo
  return m[1].trim().replace(/[^\w-]/g, '')
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
  let re = /<cac:InvoiceLine[^>]*>([\s\S]*?)<\/cac:InvoiceLine>/g
  let m
  while ((m = re.exec(xmlFactura)) !== null) lineas.push(m[1])
  if (lineas.length === 0) {
    re = /<InvoiceLine[^>]*>([\s\S]*?)<\/InvoiceLine>/g
    while ((m = re.exec(xmlFactura)) !== null) lineas.push(m[1])
  }
  if (lineas.length === 0) return []
  return lineas.map((linea, idx) => {
    const nombre = getTag(linea, 'cbc:Description') || getTag(linea, 'Description') || `Producto ${idx + 1}`
    const codigo = codigoDeItem(linea) || `COD${String(idx + 1).padStart(3, '0')}`
    const cantidad = parseFloat(getTag(linea, 'cbc:InvoicedQuantity') || '1') || 1
    const precio_unitario = parseFloat(getTag(linea, 'cbc:PriceAmount') || '0') || 0
    const subtotal = parseFloat(getTag(linea, 'cbc:LineExtensionAmount') || '0') || (precio_unitario * cantidad)
    const iva = parseFloat(getTag(linea, 'cbc:TaxAmount') || '0') || 0
    const iva_percent = extraerIvaPercent(linea)
    return {
      nombre: nombre.replace(/\t/g, ' ').trim().substring(0, 80),
      codigo: codigo.trim().substring(0, 30),
      cantidad: Math.round(cantidad),
      precio_unitario: Math.round(precio_unitario),
      subtotal: Math.round(subtotal),
      iva: Math.round(iva),
      iva_percent,
      total: Math.round(subtotal + iva),
    }
  })
}

// Extrae el % de IVA de una InvoiceLine DIAN:
// cac:TaxTotal > cac:TaxSubtotal > cac:TaxCategory > cbc:Percent (TaxScheme IVA / ID 01)
function extraerIvaPercent(linea) {
  const subtotales = [...linea.matchAll(/<cac:TaxSubtotal>([\s\S]*?)<\/cac:TaxSubtotal>/gi)]
  for (const [, sub] of subtotales) {
    const esIva = /<cbc:Name>\s*IVA\s*<\/cbc:Name>/i.test(sub) || /<cac:TaxScheme>[\s\S]*?<cbc:ID[^>]*>\s*01\s*<\/cbc:ID>/i.test(sub)
    const percentMatch = sub.match(/<cbc:Percent[^>]*>([\d.,]+)<\/cbc:Percent>/i)
    if (esIva && percentMatch) return parseFloat(percentMatch[1]) || 0
  }
  // Fallback: primer cbc:Percent que aparezca en la línea
  const m = linea.match(/<cbc:Percent[^>]*>([\d.,]+)<\/cbc:Percent>/i)
  return m ? (parseFloat(m[1]) || 0) : 0
}

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : ''
}

// Código del producto en una InvoiceLine: prioridad Sellers → Standard → Buyers
// (el primero no vacío). Varios proveedores dejan Sellers vacío y el código real
// va en StandardItemIdentification. Se acota a cada bloque para no capturar IDs ajenos.
function codigoDeItem(linea) {
  for (const wrap of ['SellersItemIdentification', 'StandardItemIdentification', 'BuyersItemIdentification']) {
    const bloque = (linea.match(new RegExp(`<cac:${wrap}>([\\s\\S]*?)<\\/cac:${wrap}>`, 'i')) || [])[1] || ''
    const cod = getTag(bloque, 'cbc:ID').trim()
    if (cod && !/^0+$/.test(cod)) return cod.substring(0, 30)
  }
  return ''
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function numToLetras(num) {
  return String(Math.round(num)).split('').map(d => LETRA_MAP[parseInt(d)] ?? d).join('')
}

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

// ─── Redondeo del precio de venta (siempre hacia arriba) ───
// Opciones del menú: 'auto' (paso según precio), 'exacto', o un paso fijo 50/100/500/1000
const OPCIONES_REDONDEO = [
  ['auto', '⚡ Auto'],
  ['exacto', 'Exacto'],
  ['50', '50'],
  ['100', '100'],
  ['500', '500'],
  ['1000', '1.000'],
]

// Modo Auto: elige el paso según la magnitud del precio
function pasoAuto(n) {
  if (n < 10000) return 100      // tornillos, tuercas, cosas baratas
  if (n < 50000) return 500      // rango medio
  return 1000                    // productos caros: el salto grande no molesta
}

function redondear(n, modo) {
  if (modo === 'exacto') return Math.round(n)
  const paso = modo === 'auto' ? pasoAuto(n) : parseInt(modo)
  if (!paso || paso <= 0) return Math.round(n)
  return Math.ceil(n / paso) * paso // siempre hacia arriba
}

// Normaliza texto para búsqueda: minúsculas y sin tildes
function normalizar(s) {
  return String(s).toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
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
          <div className="w-14 h-14 border-4 border-[#33302b] border-t-transparent rounded-full animate-spin" />
          <p className="text-2xl font-semibold text-[#33302b]">Procesando factura...</p>
          <p className="text-base text-[#666]">Por favor espere</p>
        </div>
      ) : (
        <>
          <div className="text-[#33302b] pulse-ring"><IconUpload /></div>
          <div className="text-center">
            <p className="text-3xl font-bold text-[#33302b] tracking-tight">+ Subir factura</p>
            <p className="text-lg text-[#666] mt-2">Haga clic aquí o arrastre su archivo</p>
          </div>
          <span className="text-sm font-mono text-[#999] bg-[#e8e6e0] px-3 py-1">Archivos .xml o .zip</span>
        </>
      )}
    </div>
  )
}

// ─── Product Row ──────────────────────────────────────────────────────────────
function ProductRow({ product, index, origIndex, onUpdate, rowRef, highlighted }) {
  const { nombre, codigo, cantidad, precio_unitario, margen, iva_percent, redondeo, revisado, etiquetas } = product

  // Base: precio unitario × margen, luego redondeo (el IVA es solo informativo)
  const precio = redondear(precio_unitario * (1 + margen / 100), redondeo)

  const codigoLetras = numToLetras(precio)

  // Posible revisión: más de 50 unidades, o es tornillería/tuercas (no requieren etiqueta por unidad)
  const requiereRevision = cantidad > 50 || /tornill|tuerc/.test(normalizar(nombre))
  const baseRow = revisado ? 'row-revisado' : requiereRevision ? 'row-revisar' : index % 2 === 0 ? 'row-even' : 'row-odd'

  return (
    <tr ref={rowRef} className={`${highlighted ? 'row-highlight ' : ''}${baseRow}`}>
      <td className="table-cell text-center">
        <button onClick={() => onUpdate(origIndex, 'revisado', !revisado)}
          title={revisado ? 'Desmarcar revisado' : 'Marcar como revisado'}
          className={`w-7 h-7 border-2 font-bold text-sm leading-none transition-colors ${revisado ? 'bg-[#1a6b3c] border-[#1a6b3c] text-white' : 'bg-white border-[#ccc] text-transparent hover:border-[#1a6b3c] hover:text-[#86efac]'}`}>
          ✓
        </button>
      </td>
      <td className="table-cell font-semibold text-sm">
        <span className="flex items-center gap-2">
          {requiereRevision && !revisado && (
            <span title="Posible revisión: más de 50 unidades o tornillería/tuercas" className="text-[#c0392b] font-bold">⚠</span>
          )}
          {nombre}
        </span>
      </td>
      <td className="table-cell text-center font-mono font-semibold">{cantidad}</td>
      <td className="table-cell">
        <div className="flex items-center gap-1">
          <input type="number" min="0" max="9999" value={etiquetas}
            onChange={(e) => onUpdate(origIndex, 'etiquetas', Math.max(0, parseInt(e.target.value) || 0))}
            title="Cuántas etiquetas imprimir de este producto (filas repetidas en el Excel)"
            className="w-14 text-center border-2 border-[#8e44ad] bg-white font-mono text-sm py-1 px-1.5 focus:outline-none focus:border-[#6c3483] transition-colors" />
          {etiquetas !== cantidad && (
            <button onClick={() => onUpdate(origIndex, 'etiquetas', cantidad)}
              title={`Volver a la cantidad de la factura (${cantidad})`}
              className="text-[10px] font-mono text-[#8e44ad] hover:underline whitespace-nowrap">= {cantidad}</button>
          )}
        </div>
      </td>
      <td className="table-cell font-mono text-sm">{formatCOP(precio_unitario)}</td>
      <td className="table-cell">
        <div className="flex items-center gap-1">
          <input type="number" min="0" max="999" value={margen}
            onChange={(e) => onUpdate(origIndex, 'margen', parseFloat(e.target.value) || 0)}
            className="margin-input" />
          <span className="text-[#999] font-mono text-xs">%</span>
        </div>
      </td>
      <td className="table-cell text-center">
        <span className={`font-mono text-sm font-semibold ${iva_percent > 0 ? 'text-[#2980b9]' : 'text-[#999]'}`}>
          {iva_percent % 1 === 0 ? iva_percent : iva_percent.toFixed(1)}%
        </span>
      </td>
      <td className="table-cell">
        <select value={redondeo}
          onChange={(e) => onUpdate(origIndex, 'redondeo', e.target.value)}
          title="Cómo redondear el precio de venta (siempre hacia arriba)"
          className="border-2 border-[#8e44ad] bg-white font-mono text-sm py-1 px-1.5 cursor-pointer focus:outline-none focus:border-[#6c3483]">
          {OPCIONES_REDONDEO.map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </td>
      <td className="table-cell"><span className="calculated-cell">{formatCOP(precio)}</span></td>
      <td className="table-cell"><span className="code-cell">{codigoLetras}</span></td>
    </tr>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null
  const colors = { error: 'bg-[#c0392b] text-white', success: 'bg-[#1a6b3c] text-white', info: 'bg-[#33302b] text-white' }
  return <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 font-semibold text-base shadow-xl fade-in max-w-sm ${colors[type] || colors.info}`}>{message}</div>
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function Liquidador({ onGuardar }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfBlob, setPdfBlob] = useState(null)              // PDF del ZIP cargado directo (para subirlo al guardar)
  const [pdfPathActual, setPdfPathActual] = useState(null)  // ruta del PDF ya subido (cuando viene de la bandeja)
  const [margenGlobal, setMargenGlobal] = useState('')
  // ─── Filtro: búsqueda + ordenamiento por columna + rango de precio ───
  const [busqueda, setBusqueda] = useState('')
  const [modoFiltro, setModoFiltro] = useState(false) // false = "ir a", true = ocultar no coincidentes
  const [sortCol, setSortCol] = useState(null)        // columna activa de ordenamiento
  const [sortDir, setSortDir] = useState('nat')       // 'nat' = natural, 'inv' = invertido
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(null)
  const rowRefs = useRef({})
  const highlightTimer = useRef(null)
  // ─── Sigla del proveedor (código interno del almacén) ───
  const [siglaFactura, setSiglaFactura] = useState('')
  const [proveedorXml, setProveedorXml] = useState(null) // { nit, nombre } leído del XML
  const [numeroFactura, setNumeroFactura] = useState('')
  // ─── Bandeja de facturas por liquidar ───
  const [, setBandejaTick] = useState(0)
  const refrescarBandeja = () => setBandejaTick(n => n + 1)
  const bandejaInputRef = useRef(null)

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
      redondeo: 'auto', // por defecto, redondeo inteligente según el precio
      revisado: false,
      etiquetas: p.cantidad, // por defecto, una etiqueta por unidad
    })))

    setNumeroFactura(extraerNumeroFactura(xmlText))

    // Detectar proveedor por NIT y asignar la sigla del almacén automáticamente
    const prov = extraerProveedor(xmlText)
    setProveedorXml(prov.nit || prov.nombre ? prov : null)
    const conocido = matchProveedor(prov.nit)
    setSiglaFactura(conocido ? conocido.sigla : '')

    if (conocido) {
      showToast(`✓ ${data.length} producto(s) · Proveedor: ${conocido.sigla} (${conocido.nombre})`, 'success', 5000)
    } else {
      showToast(`✓ ${data.length} producto(s) cargados`, 'success')
      setTimeout(() => {
        showToast(`⚠ Proveedor no reconocido${prov.nit ? ` (NIT ${prov.nit})` : ''} — asigne la sigla en el resumen`, 'error', 6000)
      }, 1800)
    }
  }

  async function handleFile(file) {
    setFileName(file.name)
    setError(null)
    setLoading(true)
    setPdfUrl(null); setPdfBlob(null); setPdfPathActual(null)

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
          setPdfBlob(pdfBlob)
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

  // ─── Bandeja: leer XML de un archivo (.xml o .zip) ───
  async function leerXmlYpdf(file) {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file)
      let xmlText = null, pdf = null
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        const l = name.toLowerCase()
        if (l.endsWith('.xml') && !xmlText) xmlText = await entry.async('string')
        if (l.endsWith('.pdf') && !pdf) pdf = new Blob([await entry.async('blob')], { type: 'application/pdf' })
      }
      if (!xmlText) throw new Error('El ZIP no contiene un XML')
      return { xmlText, pdfBlob: pdf }
    }
    if (lower.endsWith('.xml')) return { xmlText: await file.text(), pdfBlob: null }
    throw new Error('Solo .xml o .zip')
  }

  // Agrega una o varias facturas a la bandeja "por liquidar" (renombradas: prov_num_nit_fecha)
  async function agregarABandejaArchivos(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    let ok = 0, fail = 0
    for (const file of files) {
      try {
        const { xmlText, pdfBlob } = await leerXmlYpdf(file)
        const data = parsearFacturaDIAN(xmlText)
        if (!data || !data.length) { fail++; continue }
        const prov = extraerProveedor(xmlText)
        const conocido = matchProveedor(prov.nit)
        const sigla = conocido ? conocido.sigla : ''
        const numero = extraerNumeroFactura(xmlText)
        const hoy = new Date()
        const fcorta = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
        const nitDigits = (prov.nit || '').replace(/\D/g, '')
        const etiqueta = `${sigla || (prov.nombre || 'PROV').slice(0, 12).replace(/\s+/g, '')}_${numero || 'sinNum'}_${nitDigits || 'sinNit'}_${fcorta}`
        addABandeja({
          sigla, proveedorNombre: prov.nombre || '', nit: prov.nit || '', numero,
          fechaLlegada: hoy.toISOString(), nombreArchivo: etiqueta, nProductos: data.length, xmlText, pdfBlob,
        })
        ok++
      } catch { fail++ }
    }
    refrescarBandeja()
    showToast(`${ok} factura(s) en la bandeja${fail ? ` · ${fail} no válida(s)` : ''}`, ok ? 'success' : 'error', 5000)
  }

  // Carga una factura de la bandeja en el liquidador (reusa el mismo parseo)
  async function liquidarDeBandeja(item) {
    setError(null); setPdfUrl(null); setPdfBlob(null); setPdfPathActual(item.pdfPath || null); setLoading(true)
    try {
      await processXml(item.xmlText)
      setFileName(item.nombreArchivo)
      // Mostrar el PDF guardado: lo bajamos como blob y lo mostramos desde memoria
      // (las URLs firmadas de un bucket privado no siempre se dejan incrustar en el iframe)
      if (item.pdfPath) {
        try {
          const { data: blob } = await supabase.storage.from('facturas-pdf').download(item.pdfPath)
          if (blob) setPdfUrl(URL.createObjectURL(blob))
        } catch { /* si el PDF no carga, la liquidación igual continúa */ }
      }
      quitarDeBandeja(item.id); refrescarBandeja()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      showToast(e.message || 'No se pudo liquidar esta factura', 'error', 6000)
    } finally { setLoading(false) }
  }

  function handleUpdate(index, field, value) {
    setProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  function handleMargenAll() {
    const valor = parseFloat(margenGlobal)
    if (isNaN(valor) || valor < 0) return
    setProducts(prev => prev.map(p => ({ ...p, margen: valor })))
    showToast(`Margen ${valor}% aplicado a todos los productos`, 'success')
  }

  function handleRedondeoAll(modo) {
    setProducts(prev => prev.map(p => ({ ...p, redondeo: modo })))
    const label = (OPCIONES_REDONDEO.find(([v]) => v === modo) || [, modo])[1]
    showToast(`Redondeo "${label}" aplicado a todos`, 'success')
  }

  function handleEtiquetasAll(valor) {
    // valor numérico fijo, o 'cantidad' para volver al default
    setProducts(prev => prev.map(p => ({ ...p, etiquetas: valor === 'cantidad' ? p.cantidad : valor })))
    showToast(valor === 'cantidad' ? 'Etiquetas = cantidad en todos' : `${valor} etiqueta(s) por producto en todos`, 'success')
  }

  function handleClear() {
    setProducts([]); setError(null); setFileName(null); setPdfUrl(null); setPdfBlob(null); setPdfPathActual(null)
    setBusqueda(''); setSortCol(null); setSortDir('nat'); setHighlightIdx(null)
    setPrecioMin(''); setPrecioMax('')
    setSiglaFactura(''); setProveedorXml(null); setNumeroFactura('')
  }

  function calcPrecio(p) {
    return redondear(p.precio_unitario * (1 + p.margen / 100), p.redondeo)
  }

  // ─── Búsqueda tipo Ctrl+F: coincidencias ordenadas por relevancia ───
  const coincidencias = (() => {
    const q = normalizar(busqueda.trim())
    if (!q) return []
    return products
      .map((p, idx) => {
        const nombre = normalizar(p.nombre)
        const codigo = normalizar(p.codigo)
        let score = -1
        if (nombre.startsWith(q)) score = 0
        else if (nombre.split(/[\s,./-]+/).some(w => w.startsWith(q))) score = 1
        else if (nombre.includes(q)) score = 2
        else if (codigo.includes(q)) score = 3
        return { p, idx, score }
      })
      .filter(c => c.score >= 0)
      .sort((a, b) => a.score - b.score || a.p.nombre.localeCompare(b.p.nombre))
      .slice(0, 8)
  })()

  function irAProducto(idx) {
    setBusqueda('')
    setHighlightIdx(idx)
    // El scroll se hace tras el render para que la fila exista en su posición actual
    requestAnimationFrame(() => {
      rowRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightIdx(null), 2600)
  }

  // ─── Ordenamiento por columna: rotación de 3 toques (natural → invertido → original) ───
  function handleSort(col) {
    if (sortCol !== col) { setSortCol(col); setSortDir('nat') }
    else if (sortDir === 'nat') setSortDir('inv')
    else { setSortCol(null); setSortDir('nat') }
  }

  // Dirección "natural" de cada columna: texto A→Z, números de mayor a menor
  const comparadores = {
    nombre: (a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es'),
    codigo: (a, b) => a.p.codigo.localeCompare(b.p.codigo, 'es'),
    cantidad: (a, b) => b.p.cantidad - a.p.cantidad,
    etiquetas: (a, b) => b.p.etiquetas - a.p.etiquetas,
    precio_unitario: (a, b) => b.p.precio_unitario - a.p.precio_unitario,
    margen: (a, b) => b.p.margen - a.p.margen,
    iva: (a, b) => b.p.iva_percent - a.p.iva_percent,
    precio_venta: (a, b) => calcPrecio(b.p) - calcPrecio(a.p),
    revisado: (a, b) => (b.p.revisado ? 1 : 0) - (a.p.revisado ? 1 : 0),
  }

  // ─── Vista: filtros + ordenamiento (no modifica el orden interno de products) ───
  const vista = (() => {
    let arr = products.map((p, idx) => ({ p, idx }))
    // Filtro por búsqueda (solo en modo ocultar)
    const q = normalizar(busqueda.trim())
    if (modoFiltro && q) {
      arr = arr.filter(({ p }) => normalizar(p.nombre).includes(q) || normalizar(p.codigo).includes(q))
    }
    // Filtro por rango de precio unitario
    const min = parseFloat(precioMin)
    const max = parseFloat(precioMax)
    if (!isNaN(min)) arr = arr.filter(({ p }) => p.precio_unitario >= min)
    if (!isNaN(max)) arr = arr.filter(({ p }) => p.precio_unitario <= max)
    // Ordenamiento por columna activa
    if (sortCol && comparadores[sortCol]) {
      arr = [...arr].sort(comparadores[sortCol])
      if (sortDir === 'inv') arr.reverse()
    }
    return arr
  })()

  // ─── Totales (siempre sobre la factura completa) ───
  const totales = (() => {
    let unidades = 0, costoSinIva = 0, ivaTotal = 0, ventaEstimada = 0, etiquetas = 0
    for (const p of products) {
      unidades += p.cantidad
      costoSinIva += p.subtotal
      ivaTotal += p.iva
      ventaEstimada += calcPrecio(p) * p.cantidad
      etiquetas += Math.max(0, p.etiquetas || 0)
    }
    const costoConIva = costoSinIva + ivaTotal
    return { unidades, etiquetas, costoSinIva, ivaTotal, costoConIva, ventaEstimada, ganancia: ventaEstimada - costoConIva }
  })()
  const revisadosCount = products.filter(p => p.revisado).length

  function handleExport() {
    if (!products.length) return
    const today = new Date()
    const fecha = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    const sigla = siglaFactura.trim().toUpperCase()

    // Hoja 1 "Para imprimir": una fila por cada etiqueta a imprimir del producto
    const filasImpresion = []
    for (const p of products) {
      const precio = calcPrecio(p)
      const veces = Math.max(0, p.etiquetas)
      for (let i = 0; i < veces; i++) {
        filasImpresion.push({
          'Nombre del producto': p.nombre,
          'Código de Proveedor': sigla,
          'Código interno': numToLetras(precio),
          'Fecha de impresión': fecha,
        })
      }
    }

    // Hoja 2 "Resumen": una fila por producto, con cantidad y etiquetas
    const filasResumen = products.map(p => {
      const precio = calcPrecio(p)
      return {
        'Nombre del producto': p.nombre,
        'Cantidad': p.cantidad,
        'Etiquetas': p.etiquetas,
        'Código de Proveedor': sigla,
        'Código interno': numToLetras(precio),
        'Fecha de impresión': fecha,
      }
    })

    const wsImpresion = XLSX.utils.json_to_sheet(filasImpresion)
    wsImpresion['!cols'] = [{ wch: 45 }, { wch: 22 }, { wch: 18 }, { wch: 20 }]
    const wsResumen = XLSX.utils.json_to_sheet(filasResumen)
    wsResumen['!cols'] = [{ wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 20 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsImpresion, 'Para imprimir')
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')
    const fechaArchivo = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const nombreArchivo = numeroFactura
      ? `liquidacion_${numeroFactura}.xlsx`
      : `liquidacion_${fechaArchivo}.xlsx`
    XLSX.writeFile(wb, nombreArchivo)
    showToast('✓ Excel descargado correctamente', 'success')
    if (!siglaFactura.trim()) {
      setTimeout(() => {
        showToast('⚠ El Excel salió SIN sigla de proveedor — asígnela en el resumen y vuelva a exportar', 'error', 6000)
      }, 1800)
    }
    guardarEnHistorial(false)
  }

  // Guarda la liquidación en la plataforma (historial + catálogo). Se llama al exportar
  // y desde el botón "Guardar en historial". Es idempotente por número de factura.
  function guardarEnHistorial(avisar = true) {
    if (!onGuardar || !products.length) return
    const sigla = siglaFactura.trim().toUpperCase()
    const payload = {
      numero: numeroFactura || '',
      sigla,
      nit: proveedorXml?.nit || '',
      proveedorNombre: proveedorXml?.nombre || '',
      fecha: new Date().toISOString(),
      pdfBlob, pdfPath: pdfPathActual,
      items: products.map(p => {
        const precio = calcPrecio(p)
        return {
          nombre: p.nombre, codigo: p.codigo, cantidad: p.cantidad,
          precio_unitario: p.precio_unitario, iva_percent: p.iva_percent,
          margen: p.margen, redondeo: p.redondeo, etiquetas: p.etiquetas,
          precio_venta: precio, codigo_interno: numToLetras(precio),
        }
      }),
    }
    onGuardar(payload)
    if (avisar) showToast('✓ Liquidación guardada en el historial', 'success')
  }

  // Registra un proveedor nuevo con la sigla escrita; valida que la sigla sea única
  async function registrarProveedor() {
    const s = siglaFactura.trim().toUpperCase()
    if (!s) { showToast('Escriba una sigla (apodo) para el proveedor.', 'error'); return }
    if (!proveedorXml?.nit) { showToast('No hay NIT del proveedor en el XML.', 'error'); return }
    const r = await addProveedor({ nit: proveedorXml.nit, sigla: s, nombre: proveedorXml.nombre })
    if (r.error) { showToast(r.error, 'error', 5000); return }
    setSiglaFactura(s)
    showToast(`✓ "${proveedorXml.nombre || 'Proveedor'}" registrado como ${s}`, 'success', 5000)
  }

  const hasProducts = products.length > 0
  const bandeja = getBandeja()

  return (
    <div>
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* ─── Bandeja de facturas por liquidar ─── */}
        <div className="border-2 border-[#2980b9] bg-white">
          <div className="bg-[#2980b9] text-white px-4 py-2 flex items-center justify-between flex-wrap gap-2">
            <span className="font-mono text-sm font-semibold">📥 Facturas por liquidar ({bandeja.length})</span>
            <button onClick={() => bandejaInputRef.current?.click()}
              className="text-xs font-mono bg-white text-[#2980b9] px-3 py-1 font-semibold hover:bg-[#eef6fb]">➕ Agregar facturas</button>
            <input ref={bandejaInputRef} type="file" accept=".xml,.zip" multiple className="hidden"
              onChange={(e) => { agregarABandejaArchivos(e.target.files); e.target.value = '' }} />
          </div>
          <div className="p-3">
            {bandeja.length === 0 ? (
              <p className="text-sm text-[#666] font-mono">No hay facturas en espera. Agregue varias a la vez con “➕ Agregar facturas”.{' '}
                <span className="text-[#999]">(Próximamente llegan solas desde el correo.)</span></p>
            ) : (
              <div className="space-y-2">
                {bandeja.map(item => {
                  const f = item.fechaLlegada ? item.fechaLlegada.slice(0, 10) : '—'
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 border border-[#e0ddd5] bg-[#faf9f6] px-3 py-2 flex-wrap">
                      <div>
                        <div className="font-semibold text-sm">
                          {item.sigla ? item.sigla + ' · ' : ''}{item.proveedorNombre || 'Proveedor desconocido'}
                          {!item.sigla && <span className="ml-2 text-[10px] font-mono bg-[#fef3c7] text-[#b45309] border border-[#fcd34d] px-1.5 py-0.5">sin registrar</span>}
                        </div>
                        <div className="text-xs text-[#999] font-mono">Fact {item.numero || '—'} · NIT {item.nit || '—'} · {item.nProductos} prod · llegó {f}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => liquidarDeBandeja(item)}
                          className="font-mono text-sm font-semibold px-4 py-1.5 border-2 border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white transition-colors">Liquidar →</button>
                        <button onClick={() => { if (confirm('¿Descartar esta factura de la bandeja?')) { quitarDeBandeja(item.id); refrescarBandeja() } }}
                          title="Descartar" className="text-[#c0392b] font-bold px-2">✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <UploadZone onFile={handleFile} loading={loading} />

        {/* Vista previa PDF */}
        {pdfUrl && (
          <div className="border-2 border-[#33302b] bg-white fade-in">
            <div className="bg-[#33302b] text-white px-4 py-2 flex items-center justify-between">
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
            {/* Controles en dos grupos claros (sin saturar) */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>

              {/* Grupo 1 · Aplicar a todos los productos */}
              <div className="bg-white border border-[#e7e2d8] rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#666] mb-3">⚙ Aplicar a todos</p>
                <div className="flex flex-wrap gap-x-6 gap-y-3 items-end">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#666]"><span>Margen %</span>
                    <div className="flex gap-2">
                      <input type="number" min="0" max="999" placeholder="30" value={margenGlobal}
                        onChange={(e) => setMargenGlobal(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleMargenAll()}
                        className="w-16 border-2 border-[#2980b9] py-2 px-2 text-center font-semibold text-[#2980b9] outline-none" />
                      <button onClick={handleMargenAll} disabled={margenGlobal === '' || isNaN(parseFloat(margenGlobal))}
                        className="px-3 py-2 border-2 border-[#2980b9] text-[#2980b9] font-semibold hover:bg-[#2980b9] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Aplicar</button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#666]"><span>Redondeo</span>
                    <select onChange={(e) => { if (e.target.value) { handleRedondeoAll(e.target.value); e.target.value = '' } }}
                      defaultValue=""
                      className="border-2 border-[#8e44ad] text-[#8e44ad] font-semibold py-2 px-2 cursor-pointer outline-none">
                      <option value="" disabled>elegir…</option>
                      {OPCIONES_REDONDEO.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#666]"><span>🏷 Etiquetas</span>
                    <div className="flex gap-2">
                      <button onClick={() => handleEtiquetasAll(1)} title="1 etiqueta por producto (tornillos, tuercas…)"
                        className="px-3 py-2 border-2 border-[#8e44ad] text-[#8e44ad] font-semibold hover:bg-[#8e44ad] hover:text-white transition-colors">Todas a 1</button>
                      <button onClick={() => handleEtiquetasAll('cantidad')} title="Una etiqueta por unidad (= cantidad de la factura)"
                        className="px-3 py-2 border-2 border-[#8e44ad] text-[#8e44ad] font-semibold hover:bg-[#8e44ad] hover:text-white transition-colors">= cantidad</button>
                    </div>
                  </label>
                </div>
              </div>

              {/* Grupo 2 · Buscar y filtrar */}
              <div className="bg-white border border-[#e7e2d8] rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#666] mb-3">🔍 Buscar y filtrar</p>
                <div className="flex flex-wrap gap-x-6 gap-y-3 items-end">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#666] flex-1" style={{ minWidth: 220 }}><span>Buscar producto</span>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input type="text" placeholder="Nombre del producto…" value={busqueda}
                          onChange={(e) => setBusqueda(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !modoFiltro && coincidencias.length > 0) irAProducto(coincidencias[0].idx)
                            if (e.key === 'Escape') setBusqueda('')
                          }}
                          className="w-full border-2 border-[#33302b] py-2 px-3 outline-none focus:border-[#2980b9] transition-colors" />
                        {!modoFiltro && busqueda.trim() !== '' && (
                          <div className="absolute top-full left-0 mt-1 w-96 max-w-[90vw] bg-white border-2 border-[#33302b] rounded-xl shadow-xl z-30 max-h-80 overflow-y-auto">
                            {coincidencias.length === 0 ? (
                              <p className="px-4 py-3 text-sm text-[#999]">Sin coincidencias</p>
                            ) : coincidencias.map(({ p, idx }) => (
                              <button key={idx} onClick={() => irAProducto(idx)}
                                className="w-full text-left px-4 py-2.5 hover:bg-[#fffbe6] border-b border-[#eee] last:border-b-0 transition-colors">
                                <span className="block text-sm font-semibold text-[#33302b] truncate">{p.nombre}</span>
                                <span className="block text-xs font-mono text-[#777]">{p.codigo} · {formatCOP(p.precio_unitario)} · {p.cantidad} und</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => setModoFiltro(v => !v)}
                        title={modoFiltro ? 'Modo: ocultar los que no coinciden. Clic para cambiar a "ir al producto"' : 'Modo: ir al producto. Clic para cambiar a "ocultar los que no coinciden"'}
                        className={`px-3 py-2 border-2 border-[#33302b] font-semibold whitespace-nowrap transition-colors ${modoFiltro ? 'bg-[#33302b] text-white' : 'bg-white text-[#33302b] hover:bg-[#33302b] hover:text-white'}`}>
                        {modoFiltro ? '👁 Ocultar' : '→ Ir a'}
                      </button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#666]"><span>Precio unitario $</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min="0" placeholder="mín" value={precioMin}
                        onChange={(e) => setPrecioMin(e.target.value)}
                        className="w-20 border-2 border-[#33302b] py-2 px-2 text-center outline-none placeholder:text-[#bbb]" />
                      <span className="text-[#999]">—</span>
                      <input type="number" min="0" placeholder="máx" value={precioMax}
                        onChange={(e) => setPrecioMax(e.target.value)}
                        className="w-20 border-2 border-[#33302b] py-2 px-2 text-center outline-none placeholder:text-[#bbb]" />
                      {(precioMin !== '' || precioMax !== '') && (
                        <button onClick={() => { setPrecioMin(''); setPrecioMax('') }} title="Quitar filtro de precio"
                          className="text-[#c0392b] font-bold px-1.5">×</button>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {products.some(p => !p.revisado && (p.cantidad > 50 || /tornill|tuerc/.test(normalizar(p.nombre)))) && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#7f1d1d] bg-[#fdecea] border-l-4 border-[#c0392b] px-3 py-2">
                <span className="font-bold whitespace-nowrap">⚠ Filas en rojo</span>
                <span className="text-[#a13a30]">= posible revisión de etiquetas (más de 50 unidades, o tornillos/tuercas). Ajuste las etiquetas y marque ✓ al revisar.</span>
              </div>
            )}

            <div className="border-2 border-[#33302b] bg-white overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr>
                    {[
                      ['revisado', '✓'],
                      ['nombre', 'Producto'],
                      ['cantidad', 'Cant.'],
                      ['etiquetas', 'Etiquetas'],
                      ['precio_unitario', 'Precio unitario'],
                      ['margen', 'Margen (%)'],
                      ['iva', 'IVA factura'],
                      [null, 'Redondeo'],
                      ['precio_venta', 'Precio venta'],
                      [null, 'Código letras'],
                    ].map(([col, label]) => (
                      <th key={label}
                        onClick={col ? () => handleSort(col) : undefined}
                        title={col ? 'Clic: ordenar · 2º clic: invertir · 3º clic: orden original' : undefined}
                        className={`table-header select-none ${col ? 'cursor-pointer hover:bg-[#333] transition-colors' : ''}`}>
                        <span className="flex items-center gap-1.5">
                          {label}
                          {col && (
                            <span className={sortCol === col ? 'text-[#fde68a]' : 'text-[#555]'}>
                              {sortCol === col ? (sortDir === 'nat' ? '▼' : '▲') : '↕'}
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vista.map(({ p, idx }, i) => (
                    <ProductRow key={idx} product={p} index={i} origIndex={idx} onUpdate={handleUpdate}
                      rowRef={(el) => { rowRefs.current[idx] = el }}
                      highlighted={highlightIdx === idx} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* ─── Resumen de la factura (siempre sobre el total, no sobre lo filtrado) ─── */}
            <div className="border-t-2 border-[#33302b] pt-4">
              <p className="text-sm font-mono font-semibold text-[#555] uppercase tracking-widest mb-3">Resumen de la factura</p>
              <div className="flex flex-wrap gap-3">
                {/* Sigla del proveedor: asignada automáticamente por NIT, editable */}
                <div className={`px-4 py-2.5 min-w-[180px] border-2 ${siglaFactura.trim() ? 'border-[#1a6b3c] bg-[#f0fdf4]' : 'border-[#d4a017] bg-[#fffbe6]'}`}>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-0.5">Sigla proveedor (editable)</p>
                  <input
                    type="text" value={siglaFactura} list="lista-siglas"
                    onChange={(e) => setSiglaFactura(e.target.value.toUpperCase())}
                    placeholder="ASIGNAR..."
                    className="w-full bg-transparent font-mono font-bold text-base text-[#33302b] outline-none uppercase placeholder:text-[#d4a017] placeholder:font-normal"
                  />
                  <datalist id="lista-siglas">
                    {getProveedores().map((p, i) => <option key={i} value={p.sigla}>{p.nombre}</option>)}
                  </datalist>
                  <p className="text-[10px] font-mono text-[#999] mt-0.5 truncate" title={proveedorXml ? `${proveedorXml.nombre} · NIT ${proveedorXml.nit}` : ''}>
                    {proveedorXml ? `${proveedorXml.nombre || 'NIT'} · ${proveedorXml.nit}` : 'Sin datos del emisor en el XML'}
                  </p>
                  {proveedorXml?.nit && !matchProveedor(proveedorXml.nit) && (
                    <div className="mt-1.5 border-t border-[#fcd34d] pt-1.5">
                      <p className="text-[10px] font-mono text-[#b45309] mb-1">⚠ Proveedor sin registrar</p>
                      <button type="button" onClick={registrarProveedor}
                        className="w-full text-[11px] font-mono bg-[#33302b] text-white py-1 hover:bg-[#1a6b3c] transition-colors">
                        ➕ Registrar como “{siglaFactura.trim().toUpperCase() || '…'}”
                      </button>
                    </div>
                  )}
                </div>
                {[
                  ['Factura Nº', numeroFactura || '—'],
                  ['Productos', vista.length === products.length ? products.length : `${vista.length} de ${products.length} (filtro activo)`],
                  ['Unidades', totales.unidades],
                  ['Etiquetas a imprimir', totales.etiquetas],
                  ['Costo sin IVA', formatCOP(totales.costoSinIva)],
                  ['IVA factura', formatCOP(totales.ivaTotal)],
                  ['Costo total (c/IVA)', formatCOP(totales.costoConIva)],
                  ['Venta estimada', formatCOP(totales.ventaEstimada)],
                  ['Ganancia estimada', formatCOP(totales.ganancia)],
                  ['Revisados', `${revisadosCount} / ${products.length}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white border border-[#e0ddd5] px-4 py-2.5 min-w-[130px]">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-0.5">{label}</p>
                    <p className={`font-mono font-semibold text-base ${label === 'Ganancia estimada' ? (totales.ganancia >= 0 ? 'text-[#1a6b3c]' : 'text-[#c0392b]') : 'text-[#33302b]'}`}>{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs font-mono text-[#999] mt-2">Venta estimada = precio de venta × unidades de cada producto · Ganancia = venta estimada − costo total con IVA</p>
            </div>

            <div className="flex gap-3 flex-wrap pt-2">
              <button onClick={handleExport}
                className="flex items-center gap-2 font-semibold text-base px-6 py-3 border-2 border-[#1a6b3c] text-[#1a6b3c] bg-transparent transition-all duration-200 hover:bg-[#1a6b3c] hover:text-white cursor-pointer">
                <IconExcel /> Imprimir / Excel
              </button>
              {onGuardar && (
                <button onClick={() => guardarEnHistorial(true)}
                  className="flex items-center gap-2 font-semibold text-base px-6 py-3 border-2 border-[#2980b9] text-[#2980b9] bg-transparent transition-all duration-200 hover:bg-[#2980b9] hover:text-white cursor-pointer">
                  💾 Guardar en historial
                </button>
              )}
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
                  <span className="font-mono font-bold text-[#33302b]">{num}</span>
                  <span className="text-[#ccc]">→</span>
                  <span className="font-mono font-bold text-[#1a6b3c]">{letra}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}
