import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { storageApi } from '../../utils/storage-api';
import { Sucursal } from '../../types';
import { Plus, Pencil, Building2, Users, Activity, GraduationCap, DollarSign, Calendar, CheckCircle, XCircle } from 'lucide-react';

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
            Cerrando sesión y volvé a entrar con tu usuario administrador para usar el panel admin.
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

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sucursales.map((s) => {
          const vence = s.fechaVencimientoCuenta ? new Date(s.fechaVencimientoCuenta + 'T12:00:00') : null;
          const vencePronto = vence && vence.getTime() >= Date.now() && vence.getTime() - Date.now() < 15 * 24 * 60 * 60 * 1000;
          return (
          <div
            key={s.id}
            className="card flex flex-col overflow-hidden hover:shadow-lg transition-shadow border border-gray-200/80"
          >
            {/* Header: logo + nombre + estado */}
            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center ring-2 ring-white shadow-sm">
                {s.fotoPerfil ? (
                  <img src={s.fotoPerfil} alt={s.nombreLugar} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-6 h-6 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 truncate leading-tight">
                  {s.nombreLugar || 'Sin nombre'}
                </h2>
                <div className="mt-1.5 flex items-center gap-2">
                  {s.activa !== false ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-md">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Activa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-md">
                      <XCircle className="w-3.5 h-3.5" />
                      Desactivada
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Usuario y datos de cuenta */}
            <div className="py-3 space-y-2">
              <p className="text-sm text-gray-600">
                <span className="text-gray-500">Usuario:</span>{' '}
                <span className="font-medium text-gray-800">{s.usuario}</span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                <span className="inline-flex items-center gap-1.5 text-gray-700">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  {s.pagoMensual != null ? `$${Number(s.pagoMensual).toLocaleString('es-AR')}/mes` : '—'}
                </span>
                <span className={`inline-flex items-center gap-1.5 ${vencePronto ? 'text-amber-700' : 'text-gray-700'}`}>
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {s.fechaVencimientoCuenta
                    ? (vencePronto ? 'Vence: ' : 'Vence: ') + new Date(s.fechaVencimientoCuenta + 'T12:00:00').toLocaleDateString('es-AR')
                    : 'Sin vencimiento'}
                </span>
              </div>
              {vencePronto && (
                <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  Vencimiento próximo
                </p>
              )}
            </div>

            {/* Estadísticas */}
            <div className="py-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center bg-gray-50/60 rounded-lg">
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

            <div className="mt-auto pt-3">
              <Link
                to={`/admin/sucursales/${s.id}/editar`}
                className="block w-full text-center inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors border border-primary-200/60"
              >
                <Pencil className="w-4 h-4" />
                Editar sucursal
              </Link>
            </div>
          </div>
          );
        })}
      </div>

      {sucursales.length === 0 && (
        <div className="card text-center py-12 text-gray-500">
          No hay sucursales. Creá la primera desde &quot;Nueva sucursal&quot;.
        </div>
      )}
    </div>
  );
}
