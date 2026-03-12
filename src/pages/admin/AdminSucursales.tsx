import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { storageApi } from '../../utils/storage-api';
import { Sucursal } from '../../types';
import { Plus, Pencil, Building2, Users, Activity, GraduationCap, DollarSign, Calendar } from 'lucide-react';

export default function AdminSucursales() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    storageApi.admin
      .getSucursales()
      .then((data) => {
        if (!cancelled) setSucursales(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Error al cargar sucursales');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Cargando sucursales...</p>
      </div>
    );
  }

  if (error) {
    const isUnauth = /no autorizado|unauthorized|401|403/i.test(error);
    return (
      <div className="card border-red-200 bg-red-50 text-red-800">
        <p className="font-medium">{error}</p>
        {isUnauth && (
          <p className="mt-2 text-sm">
            Cerrando sesión y volvé a entrar con usuario <strong>adminF</strong> para usar el panel admin.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Sucursales</h1>
        <Link
          to="/admin/sucursales/nueva"
          className="btn-primary inline-flex items-center gap-2 w-fit"
        >
          <Plus className="w-4 h-4" />
          Nueva sucursal
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sucursales.map((s) => (
          <div
            key={s.id}
            className="card flex flex-col hover:shadow-xl transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                {s.fotoPerfil ? (
                  <img
                    src={s.fotoPerfil}
                    alt={s.nombreLugar}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-lg text-gray-900 truncate">
                    {s.nombreLugar || 'Sin nombre'}
                  </h2>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      s.activa !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {s.activa !== false ? 'Activa' : 'Desactivada'}
                  </span>
                </div>
                <p className="text-sm text-gray-500">Usuario: {s.usuario}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {s.pagoMensual != null ? `$${Number(s.pagoMensual).toLocaleString('es-AR')}/mes` : '—'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {s.fechaVencimientoCuenta ? `Vence: ${new Date(s.fechaVencimientoCuenta + 'T12:00:00').toLocaleDateString('es-AR')}` : 'Sin vencimiento'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col items-center gap-0.5">
                <Users className="w-5 h-5 text-primary-600" />
                <span className="text-lg font-semibold text-gray-900">{s.cantidadAlumnos}</span>
                <span className="text-xs text-gray-500">Alumnos</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Activity className="w-5 h-5 text-primary-600" />
                <span className="text-lg font-semibold text-gray-900">{s.cantidadActividades}</span>
                <span className="text-xs text-gray-500">Actividades</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <GraduationCap className="w-5 h-5 text-primary-600" />
                <span className="text-lg font-semibold text-gray-900">{s.cantidadProfesores}</span>
                <span className="text-xs text-gray-500">Profesores</span>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Link
                to={`/admin/sucursales/${s.id}/editar`}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Editar
              </Link>
            </div>
          </div>
        ))}
      </div>

      {sucursales.length === 0 && (
        <div className="card text-center py-12 text-gray-500">
          No hay sucursales. Creá la primera desde &quot;Nueva sucursal&quot;.
        </div>
      )}
    </div>
  );
}
