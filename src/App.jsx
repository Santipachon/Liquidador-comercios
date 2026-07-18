import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import Home from './screens/Home'
import Pendientes from './screens/Pendientes'
import Catalogo from './screens/Catalogo'
import DetalleProducto from './screens/DetalleProducto'
import Pedidos from './screens/Pedidos'
import Creditos from './screens/Creditos'
import Dashboard from './screens/Dashboard'
import Historial from './screens/Historial'
import Impresion from './screens/Impresion'
import Liquidador from './screens/Liquidador'
import { guardarLiquidacion, inicializar } from './lib/db'
import { supabase } from './lib/supabase'

// Usuarios: cuenta real de Supabase (email sintético) con el PIN como contraseña.
// El email no se muestra; en pantalla solo se elige el nombre y se escribe el PIN.
const USUARIOS = [
  { nombre: 'Nayibe Talero', corto: 'Nayibe', rol: 'admin', email: 'nayibe@elacero.app', inicial: 'N', color: '#1a6b3c' },
  { nombre: 'Daniel', corto: 'Daniel', rol: 'empleado', email: 'daniel@elacero.app', inicial: 'D', color: '#2980b9' },
]
const usuarioDeEmail = email => {
  const u = USUARIOS.find(x => x.email === email)
  return u ? { nombre: u.corto, rol: u.rol } : { nombre: email, rol: 'empleado' }
}


function Login() {
  const [sel, setSel] = useState(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    if (cargando) return
    setCargando(true); setErr(false)
    const { error } = await supabase.auth.signInWithPassword({ email: sel.email, password: pin })
    setCargando(false)
    if (error) { setErr(true); setPin('') }
    // Éxito: el listener de sesión en App entra y carga los datos.
  }

  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border-[3px] border-[#33302b] p-8">
        <h1 className="text-xl font-bold font-mono">ALMACÉN EL ACERO</h1>
        <p className="text-xs text-[#999] font-mono tracking-widest mb-5">Plataforma de gestión · Nayibe Talero</p>

        {!sel ? (<>
          <p className="text-sm text-[#666] mb-3">Elija su usuario</p>
          {USUARIOS.map(u => (
            <button key={u.corto} onClick={() => { setSel(u); setErr(false) }}
              className="flex items-center gap-4 w-full border-2 border-[#33302b] p-4 mt-3 text-left transition-colors hover:bg-[#33302b] hover:text-white group">
              <span className="w-11 h-11 flex items-center justify-center text-white font-bold font-mono text-lg" style={{ background: u.color }}>{u.inicial}</span>
              <span><span className="block font-bold">{u.nombre}</span>
                <span className="block text-xs text-[#999] font-mono group-hover:text-[#bbb]">{u.rol === 'admin' ? 'Dueña · ve todo' : 'Empleado · captura pendientes'}</span></span>
            </button>
          ))}
        </>) : (<>
          <button className="text-[#2980b9] font-mono text-sm hover:underline mb-3" onClick={() => { setSel(null); setPin(''); setErr(false) }}>← Cambiar usuario</button>
          <p className="text-sm text-[#666] mb-2">Hola <b>{sel.corto}</b>, escriba su PIN</p>
          <input autoFocus type="password" inputMode="numeric" maxLength={4} value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErr(false) }}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            className="input-plat text-center text-2xl tracking-[0.5em]" placeholder="••••" />
          {err && <p className="text-[#c0392b] text-sm font-mono mt-2">PIN incorrecto</p>}
          <button disabled={cargando || pin.length < 4} className="btn-plat w-full mt-4 border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" onClick={entrar}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        </>)}
      </div>
    </div>
  )
}

function Shell({ usuario, onLogout }) {
  const nav = useNavigate()
  const location = useLocation()
  const enInicio = location.pathname === '/'
  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <header className="bg-[#33302b] text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <button onClick={() => nav('/')} className="text-left" title="Ir al inicio">
            <h1 className="text-lg font-bold font-mono tracking-tight">ALMACÉN EL ACERO</h1>
            <p className="text-[#888] text-[11px] font-mono tracking-widest">Plataforma de gestión</p>
          </button>
          <div className="flex items-center gap-3 font-mono text-sm">
            {!enInicio && (
              <button onClick={() => nav('/')}
                className="bg-white text-[#33302b] font-semibold px-4 py-2 hover:bg-[#eee]">🏠 Inicio</button>
            )}
            <span className="bg-[#333] px-3 py-2 hidden sm:inline">{usuario.nombre}</span>
            <button className="text-[#ccc] hover:text-white px-2 py-2" onClick={onLogout}>Salir ✕</button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet context={{ usuario }} />
      </main>
      <footer className="border-t border-[#e0ddd5] py-5 px-4 mt-10">
        <p className="max-w-6xl mx-auto text-[#999] font-mono text-xs">ALMACÉN EL ACERO · Plataforma de gestión</p>
      </footer>
    </div>
  )
}

function LiquidarScreen() {
  const nav = useNavigate()
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h2 className="text-2xl font-bold font-mono">🧾 Liquidar factura</h2>
        <button className="text-[#2980b9] font-mono text-sm hover:underline" onClick={() => nav('/dashboard')}>Ver reportes →</button>
      </div>
      <Liquidador onGuardar={guardarLiquidacion} />
    </div>
  )
}

function RequireAdmin({ usuario, children }) {
  if (usuario.rol !== 'admin') return <Navigate to="/pendientes" replace />
  return children
}

export default function App() {
  const [estado, setEstado] = useState('cargando') // 'cargando' | 'login' | 'listo'
  const [usuario, setUsuario] = useState(null)

  useEffect(() => {
    let activo = true
    async function aplicar(session) {
      if (!activo) return
      if (!session) { setUsuario(null); setEstado('login'); return }
      setUsuario(usuarioDeEmail(session.user.email))
      setEstado('cargando')
      await inicializar()
      if (activo) setEstado('listo')
    }
    supabase.auth.getSession().then(({ data }) => aplicar(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => aplicar(session))
    return () => { activo = false; sub?.subscription?.unsubscribe() }
  }, [])

  function logout() { supabase.auth.signOut() }

  if (estado === 'login') return <Login />
  if (estado === 'cargando' || !usuario) return (
    <div className="min-h-screen bg-[#f7f4ee] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-[#e0ddd5] border-t-[#1a6b3c] rounded-full animate-spin" />
      <p className="text-[#666] font-mono text-sm">Cargando…</p>
    </div>
  )

  const admin = (el) => <RequireAdmin usuario={usuario}>{el}</RequireAdmin>

  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell usuario={usuario} onLogout={logout} />}>
          <Route index element={<Home />} />
          <Route path="pendientes" element={<Pendientes />} />
          <Route path="imprimir" element={<Impresion />} />
          <Route path="catalogo" element={admin(<Catalogo />)} />
          <Route path="catalogo/:key" element={admin(<DetalleProducto />)} />
          <Route path="pedidos" element={admin(<Pedidos />)} />
          <Route path="creditos" element={admin(<Creditos />)} />
          <Route path="liquidar" element={admin(<LiquidarScreen />)} />
          <Route path="dashboard" element={admin(<Dashboard />)} />
          <Route path="historial" element={admin(<Historial />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
