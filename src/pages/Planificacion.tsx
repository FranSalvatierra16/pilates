import { Navigate } from 'react-router-dom';

/** Compat: la planificación pasó a ser notas por día en Calendario. */
export default function Planificacion() {
  return <Navigate to="/calendario" replace />;
}
