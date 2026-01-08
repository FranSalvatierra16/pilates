import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Calendario from './pages/Calendario';
import Alumnos from './pages/Alumnos';
import Actividades from './pages/Actividades';
import Acceso from './pages/Acceso';
import Pagos from './pages/Pagos';
import Caja from './pages/Caja';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/alumnos" element={<Alumnos />} />
          <Route path="/actividades" element={<Actividades />} />
          <Route path="/acceso" element={<Acceso />} />
          <Route path="/pagos" element={<Pagos />} />
          <Route path="/caja" element={<Caja />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

