// Helpers y constantes compartidas por las pantallas de la plataforma.
// (El liquidador conserva sus propias copias; aquí están para el resto de la app.)

export const LETRA_MAP = { 1: 'R', 2: 'E', 3: 'P', 4: 'U', 5: 'B', 6: 'L', 7: 'I', 8: 'C', 9: 'A', 0: 'S' }

export const numToLetras = n =>
  String(Math.round(n)).split('').map(d => LETRA_MAP[parseInt(d)] ?? d).join('')

export const normalizar = s =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Búsqueda amigable por palabras sueltas: "cuña 8" encuentra cualquier texto que
// contenga TODAS las palabras (en cualquier orden). Ignora tildes y mayúsculas.
export const coincide = (texto, query) => {
  const t = normalizar(texto)
  return normalizar(query).split(/\s+/).filter(Boolean).every(tok => t.includes(tok))
}

export const formatCOP = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

export const fechaCorta = iso => {
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  } catch { return iso }
}

export const PROVEEDORES = [
  { nombre: 'JULIO RAMIREZ', sigla: 'JR', nit: '19141690-6' },
  { nombre: 'DAGO', sigla: 'DG', nit: '901626462-5' },
  { nombre: 'SANTOS HIGUERA', sigla: 'SH', nit: '7213967-7' },
  { nombre: 'RODACOL', sigla: 'RD', nit: '860015737-5' },
  { nombre: 'INTERTRAM', sigla: 'INT', nit: '860516860-3' },
  { nombre: 'IMPORTACIONES INTERTRAM', sigla: 'INT', nit: '830126983-8' },
  { nombre: 'GRUPO COLOMBIANO FERRETERO SAS', sigla: 'COLF', nit: '900396456-8' },
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
export const provNombre = sigla => (PROVEEDORES.find(p => p.sigla === sigla) || {}).nombre || sigla
