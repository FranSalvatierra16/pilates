import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Activity, DollarSign, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatCurrency } from '../utils/format';
import { isCuotaVencida } from '../utils/date';

const Dashboard = () => {
  const { sucursalNombre } = useAuth();
  const nombreSucursal = sucursalNombre || (import.meta.env.VITE_APP_NAME || 'Sistema de Gestión');
  const [stats, setStats] = useState({
    totalAlumnos: 0,
    totalActividades: 0,
    cuotasVencidas: 0,
    /** Ingresos - gastos (misma lógica que la página Caja) */
    totalCajaNeto: 0,
  });

  useEffect(() => {
    (async () => {
      const [alumnos, actividades, pagos, gastos] = await Promise.all([
        storageHybrid.alumnos.getAll(),
        storageHybrid.actividades.getAll(),
        storageHybrid.pagos.getAll(),
        storageHybrid.gastos.getAll(),
      ]);

      const cuotasVencidas = alumnos.filter(a => isCuotaVencida(a.fechaVencimientoCuota));

      const totalEfectivo = pagos
        .filter(p => p.metodoPago === 'efectivo')
        .reduce((sum, p) => sum + p.monto, 0);

      const totalTransferencia = pagos
        .filter(p => p.metodoPago === 'transferencia')
        .reduce((sum, p) => sum + p.monto, 0);

      const gastosEfectivo = gastos
        .filter(g => g.metodoPago === 'efectivo')
        .reduce((sum, g) => sum + g.monto, 0);

      const gastosTransferencia = gastos
        .filter(g => g.metodoPago === 'transferencia')
        .reduce((sum, g) => sum + g.monto, 0);

      const totalCajaNeto =
        totalEfectivo - gastosEfectivo + (totalTransferencia - gastosTransferencia);

      setStats({
        totalAlumnos: alumnos.length,
        totalActividades: actividades.length,
        cuotasVencidas: cuotasVencidas.length,
        totalCajaNeto,
      });
    })();
  }, []);

  const cards = [
    {
      title: 'Total Alumnos',
      value: stats.totalAlumnos,
      icon: Users,
      color: 'bg-blue-500',
      link: '/alumnos',
    },
    {
      title: 'Actividades',
      value: stats.totalActividades,
      icon: Activity,
      color: 'bg-green-500',
      link: '/actividades',
    },
    {
      title: 'Cuotas Vencidas',
      value: stats.cuotasVencidas,
      icon: AlertTriangle,
      color: 'bg-red-500',
      link: '/alumnos',
    },
    {
      title: 'Saldo neto en caja',
      value: formatCurrency(stats.totalCajaNeto),
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
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
                  <p className="text-2xl font-bold text-gray-900">
                    {card.value}
                  </p>
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
            Sistema de gestión para {nombreSucursal}. Desde aquí puedes gestionar alumnos,
            actividades, controlar accesos, registrar pagos, ver el estado de la caja y gestionar turnos.
          </p>
          <div className="bg-primary-50 p-4 rounded-lg">
            <p className="text-sm text-primary-800">
              💡 <strong>Tip:</strong> Usa el menú superior para navegar entre las diferentes secciones del sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

