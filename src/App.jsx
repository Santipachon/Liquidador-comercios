import { useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import Home from './screens/Home'
import Pendientes from './screens/Pendientes'
import Catalogo from './screens/Catalogo'
import DetalleProducto from './screens/DetalleProducto'
import Pedidos from './screens/Pedidos'
import Dashboard from './screens/Dashboard'
import Historial from './screens/Historial'
import Liquidador from './screens/Liquidador'
import { guardarLiquidacion } from './lib/db'

// Usuarios demo (en la versión real: tabla de usuarios en Supabase con PIN propio)
const USUARIOS = [
  { nombre: 'Nayibe Talero', corto: 'Nayibe', rol: 'admin', pin: '1234', inicial: 'N', color: '#1a6b3c' },
  { nombre: 'Carlos', corto: 'Carlos', rol: 'empleado', pin: '1111', inicial: 'C', color: '#2980b9' },
]

const NAV = [
  { to: '/', t: 'Inicio', end: true },
  { to: '/pendientes', t: 'Pendientes' },
  { to: '/catalogo', t: 'Catálogo', admin: true },
  { to: '/pedidos', t: 'Pedidos', admin: true },
  { to: '/liquidar', t: 'Liquidar', admin: true },
  { to: '/dashboard', t: 'Reportes', admin: true },
  { to: '/historial', t: 'Historial', admin: true },
]

function Login({ onLogin }) {
  const [sel, setSel] = useState(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)

  function entrar() {
    if (pin === sel.pin) onLogin({ nombre: sel.corto, rol: sel.rol })
    else { setErr(true); setPin('') }
  }

  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border-[3px] border-[#1a1a1a] p-8">
        <h1 className="text-xl font-bold font-mono">ALMACÉN EL ACERO</h1>
        <p className="text-xs text-[#999] font-mono tracking-widest mb-5">Plataforma de gestión · Nayibe Talero</p>

        {!sel ? (<>
          <p className="text-sm text-[#666] mb-3">Elija su usuario</p>
          {USUARIOS.map(u => (
            <button key={u.corto} onClick={() => { setSel(u); setErr(false) }}
              className="flex items-center gap-4 w-full border-2 border-[#1a1a1a] p-4 mt-3 text-left transition-colors hover:bg-[#1a1a1a] hover:text-white group">
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
          <button className="btn-plat w-full mt-4 border-[#1a6b3c] text-[#1a6b3c] hover:bg-[#1a6b3c] hover:text-white" onClick={entrar}>Entrar</button>
          <p className="text-[10px] text-[#bbb] font-mono mt-4 text-center">Demo: Nayibe = 1234 · Carlos = 1111</p>
        </>)}
      </div>
    </div>
  )
}

function Shell({ usuario, onLogout }) {
  const esAdmin = usuario.rol === 'admin'
  const links = NAV.filter(n => esAdmin || !n.admin)
  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <header className="bg-[#1a1a1a] text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-base font-bold font-mono tracking-tight">ALMACÉN EL ACERO</h1>
            <p className="text-[#888] text-[10px] font-mono tracking-widest">Plataforma de gestión</p>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="bg-[#333] px-2.5 py-1">{usuario.nombre} · {usuario.rol}</span>
            <button className="text-[#bbb] hover:text-white" onClick={onLogout}>Salir ✕</button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-2 flex gap-1 overflow-x-auto border-t border-[#333]">
          {links.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `navlink whitespace-nowrap ${isActive ? 'active' : ''}`}>{n.t}</NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet context={{ usuario }} />
      </main>
      <footer className="border-t border-[#e0ddd5] py-5 px-4 mt-10">
        <p className="max-w-6xl mx-auto text-[#bbb] font-mono text-[11px]">ALMACÉN EL ACERO · Plataforma de gestión · datos guardados en este equipo (próximo paso: nube)</p>
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
  const [usuario, setUsuario] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('acero_user')) } catch { return null }
  })
  function login(u) { sessionStorage.setItem('acero_user', JSON.stringify(u)); setUsuario(u) }
  function logout() { sessionStorage.removeItem('acero_user'); setUsuario(null) }

  if (!usuario) return <Login onLogin={login} />

  const admin = (el) => <RequireAdmin usuario={usuario}>{el}</RequireAdmin>

  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell usuario={usuario} onLogout={logout} />}>
          <Route index element={<Home />} />
          <Route path="pendientes" element={<Pendientes />} />
          <Route path="catalogo" element={admin(<Catalogo />)} />
          <Route path="catalogo/:key" element={admin(<DetalleProducto />)} />
          <Route path="pedidos" element={admin(<Pedidos />)} />
          <Route path="liquidar" element={admin(<LiquidarScreen />)} />
          <Route path="dashboard" element={admin(<Dashboard />)} />
          <Route path="historial" element={admin(<Historial />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
