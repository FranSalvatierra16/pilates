import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Activity, DollarSign, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DashboardGuiaUso from '../components/DashboardGuiaUso';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatCurrency } from '../utils/format';
import { isCuotaVencida } from '../utils/date';
import type { FinanzasEstado, CierreCaja } from '../types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const Dashboard = () => {
  const { sucursalNombre } = useAuth();
  const nombreSucursal = sucursalNombre || (import.meta.env.VITE_APP_NAME || 'Sistema de Gestión');
  const [stats, setStats] = useState({
    totalAlumnos: 0,
    totalActividades: 0,
    cuotasVencidas: 0,
    /** ingresos − gastos − retiros de cierres (como en Caja) */
    totalCajaNeto: 0,
  });
  const [finBloqueado, setFinBloqueado] = useState(false);
  const [cargaIncompleta, setCargaIncompleta] = useState(false);
  const [errorSinConexion, setErrorSinConexion] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [retryToken, setRetryToken] = useState(0);

  const cargarDashboard = useCallback(async (opts?: { maxReintentos?: number }) => {
    const maxReintentos = opts?.maxReintentos ?? 3;
    setDashboardLoading(true);
    setErrorSinConexion(false);
    try {
      let fin: FinanzasEstado | null = null;
      try {
        fin = await storageHybrid.finanzas.getEstado();
      } catch {
        fin = null;
      }
      const bloqueado = !!(fin?.pinConfigurado && !fin.desbloqueado);
      setFinBloqueado(bloqueado);

      let settled = await Promise.allSettled([
        storageHybrid.alumnos.getAll(),
        storageHybrid.actividades.getAll(),
        storageHybrid.pagos.getAll(),
        storageHybrid.gastos.getAll(),
        storageHybrid.cierresCaja.getAll(),
      ]);

      for (let intento = 1; intento < maxReintentos; intento++) {
        const alumnosOk = settled[0].status === 'fulfilled';
        const actividadesOk = settled[1].status === 'fulfilled';
        const todoOk = settled.every((r) => r.status === 'fulfilled');
        if (todoOk || alumnosOk || actividadesOk) break;
        await sleep(500 * intento);
        settled = await Promise.allSettled([
          storageHybrid.alumnos.getAll(),
          storageHybrid.actividades.getAll(),
          storageHybrid.pagos.getAll(),
          storageHybrid.gastos.getAll(),
          storageHybrid.cierresCaja.getAll(),
        ]);
      }

      const alumnos = settled[0].status === 'fulfilled' ? settled[0].value : [];
      const actividades = settled[1].status === 'fulfilled' ? settled[1].value : [];
      const pagos = settled[2].status === 'fulfilled' ? settled[2].value : [];
      const gastos = settled[3].status === 'fulfilled' ? settled[3].value : [];
      const cierres = settled[4].status === 'fulfilled' ? settled[4].value : ([] as CierreCaja[]);

      const falloAlguno = settled.some((r) => r.status === 'rejected');
      const sinDatosUtiles =
        settled[0].status === 'rejected' && settled[1].status === 'rejected';

      if (falloAlguno) {
        settled.forEach((r, i) => {
          if (r.status === 'rejected') {
            const labels = ['alumnos', 'actividades', 'pagos', 'gastos', 'cierres'];
            console.error(`[Dashboard] Falló la carga de ${labels[i]}:`, r.reason);
          }
        });
      }

      setCargaIncompleta(falloAlguno && !sinDatosUtiles);
      setErrorSinConexion(sinDatosUtiles);

      const cuotasVencidas = alumnos.filter((a) => isCuotaVencida(a.fechaVencimientoCuota));

      const totalEfectivo = pagos
        .filter((p) => p.metodoPago === 'efectivo')
        .reduce((sum, p) => sum + p.monto, 0);

      const totalTransferencia = pagos
        .filter((p) => p.metodoPago === 'transferencia')
        .reduce((sum, p) => sum + p.monto, 0);

      const gastosEfectivo = gastos
        .filter((g) => g.metodoPago === 'efectivo')
        .reduce((sum, g) => sum + g.monto, 0);

      const gastosTransferencia = gastos
        .filter((g) => g.metodoPago === 'transferencia')
        .reduce((sum, g) => sum + g.monto, 0);

      const ingresosCaja = totalEfectivo + totalTransferencia;
      const gastosCaja = gastosEfectivo + gastosTransferencia;
      const totalRetiros = cierres.reduce((s, c) => s + (c.montoRetirado ?? 0), 0);
      const totalCajaNeto = ingresosCaja - gastosCaja - totalRetiros;

      if (!sinDatosUtiles) {
        setStats({
          totalAlumnos: alumnos.length,
          totalActividades: actividades.length,
          cuotasVencidas: cuotasVencidas.length,
          totalCajaNeto: bloqueado ? 0 : totalCajaNeto,
        });
      }
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarDashboard({ maxReintentos: 3 });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void cargarDashboard({ maxReintentos: 1 });
    };
    const onOnline = () => {
      void cargarDashboard({ maxReintentos: 3 });
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cargarDashboard, retryToken]);

  const cards: Array<{
    title: string;
    kind: 'count' | 'saldo';
    count?: number;
    subtitle?: string;
    icon: typeof Users;
    color: string;
    link: string;
  }> = [
    {
      title: 'Total Alumnos',
      kind: 'count',
      count: stats.totalAlumnos,
      icon: Users,
      color: 'bg-blue-500',
      link: '/alumnos',
    },
    {
      title: 'Actividades',
      kind: 'count',
      count: stats.totalActividades,
      icon: Activity,
      color: 'bg-green-500',
      link: '/actividades',
    },
    {
      title: 'Cuotas Vencidas',
      kind: 'count',
      count: stats.cuotasVencidas,
      icon: AlertTriangle,
      color: 'bg-red-500',
      link: '/alumnos',
    },
    {
      title: 'Saldo en caja',
      kind: 'saldo',
      subtitle: finBloqueado ? 'Desbloqueá en Caja o Pagos con el PIN para ver montos' : undefined,
      icon: DollarSign,
      color: 'bg-yellow-500',
      link: '/caja',
    },
  ];

  return (
    <div className="pb-6">
      <div className="page-title-wrap mb-6 sm:mb-8">
        <span className="page-title-accent" aria-hidden />
        <h1 className="page-title">Dashboard</h1>
      </div>
      
      {errorSinConexion && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 flex flex-wrap items-center justify-between gap-3">
          <span>
            No pudimos conectar con el servidor (sin señal, timeout o caída). Los números no se cargaron; tocá Reintentar o esperá a tener mejor red.
          </span>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
            onClick={() => setRetryToken((t) => t + 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      {cargaIncompleta && !errorSinConexion && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <span>
            Algunos datos no cargaron (ej. caja o pagos). El resto debería estar bien; el saldo puede estar incompleto.
          </span>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
            onClick={() => setRetryToken((t) => t + 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          const contenidoPrincipal = dashboardLoading ? (
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" aria-label="Cargando" />
          ) : errorSinConexion ? (
            <span className="text-2xl font-bold text-gray-500">—</span>
          ) : card.kind === 'count' ? (
            <span className="text-2xl font-bold text-gray-900">{card.count ?? 0}</span>
          ) : finBloqueado ? (
            <span className="text-2xl font-bold text-gray-900">••••</span>
          ) : (
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalCajaNeto)}</span>
          );
          return (
            <Link
              key={card.title}
              to={card.link}
              className="card hover:shadow-xl transition-shadow transform hover:-translate-y-1"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">
                    {card.title}
                  </p>
                  <div className="min-h-[2rem] flex items-center">{contenidoPrincipal}</div>
                  {card.subtitle && (
                    <p className="text-xs text-gray-500 mt-1 leading-snug">{card.subtitle}</p>
                  )}
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Accesos Rápidos</h2>
          <div className="space-y-3">
            <Link
              to="/calendario"
              className="block p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <h3 className="font-semibold text-purple-900">Calendario de Turnos</h3>
              <p className="text-sm text-purple-700">Gestionar turnos y asignar alumnos a clases</p>
            </Link>
            <Link
              to="/acceso"
              className="block p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <h3 className="font-semibold text-primary-900">Control de Acceso</h3>
              <p className="text-sm text-primary-700">Verificar acceso de alumnos por DNI</p>
            </Link>
            <Link
              to="/pagos"
              className="block p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <h3 className="font-semibold text-green-900">Registrar Pago</h3>
              <p className="text-sm text-green-700">Cargar un nuevo pago de alumno</p>
            </Link>
            <Link
              to="/alumnos"
              className="block p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <h3 className="font-semibold text-blue-900">Nuevo Alumno</h3>
              <p className="text-sm text-blue-700">Agregar un nuevo alumno al sistema</p>
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Bienvenido</h2>
          <p className="text-gray-600 mb-4">
            Sistema de gestión para {nombreSucursal}. Desde aquí podés gestionar alumnos,
            actividades, controlar accesos, registrar pagos, ver el estado de la caja y los turnos.
          </p>
          <div className="bg-primary-50 p-4 rounded-lg space-y-2">
            <p className="text-sm text-primary-800">
              💡 <strong>Tip:</strong> usá el menú superior para moverte entre módulos.
            </p>
            <p className="text-sm text-primary-800">
              <a href="#guia-uso" className="font-semibold underline decoration-primary-400/60 hover:decoration-primary-600">
                Guía del estudio abajo
              </a>{' '}
              — explicación clara de cada pantalla para vender el uso interno y capacitar al equipo.
            </p>
          </div>
        </div>
      </div>

      <DashboardGuiaUso />
    </div>
  );
};

export default Dashboard;

