import { ANTECEDENTES_FICHA, DECLARACION_FICHA, FichaSalud, OBJETIVOS_FICHA, SiNo, faltantesFicha, toggleAntecedente } from '../data/fichaSalud';
import { formatDate } from '../utils/date';

type AlumnoFicha = {
  nombre: string;
  apellido: string;
  telefono?: string;
  fechaNacimiento?: string;
};

type Props = {
  ficha: FichaSalud;
  alumno: AlumnoFicha;
  soloLectura?: boolean;
  savia?: boolean;
  guardando?: boolean;
  onChange?: (ficha: FichaSalud) => void;
  onGuardar?: () => void;
};

function fechaLegible(iso?: string | null): string {
  const s = (iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return formatDate(s);
}

export default function FichaSaludForm({ ficha, alumno, soloLectura, savia, guardando, onChange, onGuardar }: Props) {
  const set = (parcial: Partial<FichaSalud>) => onChange?.({ ...ficha, ...parcial });
  const faltan = soloLectura ? [] : faltantesFicha(ficha);
  const nombre = [alumno.apellido, alumno.nombre].filter(Boolean).join(', ') || '—';
  const box = savia
    ? 'rounded-2xl border border-savia-sandSoft bg-white/70 p-4'
    : 'rounded-xl border border-gray-200 bg-gray-50 p-4';
  const titulo = savia ? 'text-sm font-semibold text-savia-ink' : 'text-sm font-semibold text-gray-900';
  const ayuda = savia ? 'text-xs text-savia-muted' : 'text-xs text-gray-500';
  const ink = savia ? 'text-savia-ink' : 'text-gray-800';

  const SiNoControl = ({ valor, onPick, nombreGrupo }: { valor: SiNo; onPick: (v: SiNo) => void; nombreGrupo: string }) => {
    if (soloLectura) {
      return <p className={`text-sm font-semibold ${ink}`}>{valor === 'si' ? 'Sí' : valor === 'no' ? 'No' : 'Sin responder'}</p>;
    }
    return (
      <div className="flex gap-2">
        {(['si', 'no'] as const).map((op) => (
          <label
            key={op}
            className={`flex-1 text-center text-sm font-semibold rounded-xl border px-3 py-2.5 cursor-pointer touch-manipulation ${
              valor === op
                ? savia
                  ? 'bg-savia-olive text-white border-savia-olive'
                  : 'bg-primary-600 text-white border-primary-600'
                : savia
                  ? 'bg-white border-savia-sand text-savia-ink'
                  : 'bg-white border-gray-300 text-gray-700'
            }`}
          >
            <input
              type="radio"
              name={nombreGrupo}
              className="sr-only"
              checked={valor === op}
              onChange={() => onPick(op)}
            />
            {op === 'si' ? 'Sí' : 'No'}
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wide ${savia ? 'text-savia-terra' : 'text-primary-700'}`}>
          Ficha de salud · información confidencial
        </p>
        {soloLectura && ficha.actualizadaEn && (
          <p className={`mt-1 text-xs ${ayuda}`}>Actualizada el {fechaLegible(ficha.actualizadaEn) || '—'}</p>
        )}
      </div>

      <section className={box}>
        <h3 className={titulo}>1. Datos personales</h3>
        <dl className={`mt-3 space-y-1.5 text-sm ${ink}`}>
          <div className="flex justify-between gap-3">
            <dt className={ayuda}>Nombre y apellido</dt>
            <dd className="font-medium text-right">{nombre}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={ayuda}>Fecha de nacimiento</dt>
            <dd className="font-medium text-right">{fechaLegible(alumno.fechaNacimiento) || 'Sin cargar'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={ayuda}>Teléfono</dt>
            <dd className="font-medium text-right">{alumno.telefono?.trim() || 'Sin cargar'}</dd>
          </div>
        </dl>
        <label className="block mt-3">
          <span className={`text-sm font-medium ${ink}`}>Contacto de emergencia y teléfono</span>
          {soloLectura ? (
            <p className={`mt-1 text-sm ${ink}`}>{ficha.contactoEmergencia || '—'}</p>
          ) : (
            <input
              type="text"
              value={ficha.contactoEmergencia}
              onChange={(e) => set({ contactoEmergencia: e.target.value })}
              placeholder="Nombre y teléfono"
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
            />
          )}
        </label>
      </section>

      <section className={box}>
        <h3 className={titulo}>2. Antecedentes de salud</h3>
        <p className={`mt-1 mb-3 ${ayuda}`}>Marcá las opciones que correspondan.</p>
        <div className="space-y-2">
          {ANTECEDENTES_FICHA.map((op) => {
            const marcado = ficha.antecedentes.includes(op.id);
            if (soloLectura && !marcado) return null;
            return (
              <label key={op.id} className={`flex items-start gap-2.5 text-sm ${ink} ${soloLectura ? '' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-300"
                  checked={marcado}
                  disabled={soloLectura}
                  onChange={() => set({ antecedentes: toggleAntecedente(ficha.antecedentes, op.id) })}
                />
                <span>{op.label}</span>
              </label>
            );
          })}
          {soloLectura && ficha.antecedentes.length === 0 && <p className={`text-sm ${ayuda}`}>Sin marcar</p>}
        </div>
        <label className="block mt-3">
          <span className={`text-sm font-medium ${ink}`}>Si marcaste alguna, especificá cuál y si requiere cuidados</span>
          {soloLectura ? (
            <p className={`mt-1 text-sm whitespace-pre-wrap ${ink}`}>{ficha.antecedentesDetalle || '—'}</p>
          ) : (
            <textarea
              value={ficha.antecedentesDetalle}
              onChange={(e) => set({ antecedentesDetalle: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm resize-y"
            />
          )}
        </label>
      </section>

      <section className={box}>
        <h3 className={titulo}>3. Dolor, lesiones y limitaciones</h3>
        <p className={`mt-3 mb-2 text-sm font-medium ${ink}`}>¿Tenés dolor o molestias actualmente?</p>
        <SiNoControl valor={ficha.dolorActual} nombreGrupo="dolor" onPick={(v) => set({ dolorActual: v })} />
        {ficha.dolorActual === 'si' && (
          <label className="block mt-3">
            <span className={`text-sm font-medium ${ink}`}>Zona y movimientos que generan molestias</span>
            {soloLectura ? (
              <p className={`mt-1 text-sm whitespace-pre-wrap ${ink}`}>{ficha.dolorDetalle || '—'}</p>
            ) : (
              <textarea
                value={ficha.dolorDetalle}
                onChange={(e) => set({ dolorDetalle: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm resize-y"
              />
            )}
          </label>
        )}
        <p className={`mt-4 mb-2 text-sm font-medium ${ink}`}>¿Tenés indicación médica de evitar o adaptar algún ejercicio?</p>
        <SiNoControl valor={ficha.indicacionMedica} nombreGrupo="indicacion" onPick={(v) => set({ indicacionMedica: v })} />
        {ficha.indicacionMedica === 'si' && (
          <label className="block mt-3">
            <span className={`text-sm font-medium ${ink}`}>¿Cuál?</span>
            {soloLectura ? (
              <p className={`mt-1 text-sm whitespace-pre-wrap ${ink}`}>{ficha.indicacionDetalle || '—'}</p>
            ) : (
              <textarea
                value={ficha.indicacionDetalle}
                onChange={(e) => set({ indicacionDetalle: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm resize-y"
              />
            )}
          </label>
        )}
      </section>

      <section className={box}>
        <h3 className={titulo}>4. Medicación y actividad física</h3>
        <p className={`mt-3 mb-2 text-sm font-medium ${ink}`}>¿Tomás medicación relevante para la actividad física?</p>
        <SiNoControl valor={ficha.medicacion} nombreGrupo="medicacion" onPick={(v) => set({ medicacion: v })} />
        {ficha.medicacion === 'si' && (
          <label className="block mt-3">
            <span className={`text-sm font-medium ${ink}`}>¿Cuál?</span>
            {soloLectura ? (
              <p className={`mt-1 text-sm ${ink}`}>{ficha.medicacionDetalle || '—'}</p>
            ) : (
              <input
                type="text"
                value={ficha.medicacionDetalle}
                onChange={(e) => set({ medicacionDetalle: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              />
            )}
          </label>
        )}
        <p className={`mt-4 mb-2 text-sm font-medium ${ink}`}>¿Realizás otra actividad física?</p>
        <SiNoControl valor={ficha.otraActividad} nombreGrupo="actividad" onPick={(v) => set({ otraActividad: v })} />
        {ficha.otraActividad === 'si' && (
          <label className="block mt-3">
            <span className={`text-sm font-medium ${ink}`}>¿Cuál?</span>
            {soloLectura ? (
              <p className={`mt-1 text-sm ${ink}`}>{ficha.otraActividadDetalle || '—'}</p>
            ) : (
              <input
                type="text"
                value={ficha.otraActividadDetalle}
                onChange={(e) => set({ otraActividadDetalle: e.target.value })}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              />
            )}
          </label>
        )}
      </section>

      <section className={box}>
        <h3 className={titulo}>5. Objetivos</h3>
        <p className={`mt-1 mb-3 ${ayuda}`}>¿Qué te gustaría trabajar?</p>
        <div className="flex flex-wrap gap-2">
          {OBJETIVOS_FICHA.map((op) => {
            const marcado = ficha.objetivos.includes(op.id);
            if (soloLectura && !marcado) return null;
            return (
              <label
                key={op.id}
                className={`text-sm font-medium rounded-full border px-3 py-1.5 ${soloLectura ? '' : 'cursor-pointer touch-manipulation'} ${
                  marcado
                    ? savia
                      ? 'bg-savia-olive text-white border-savia-olive'
                      : 'bg-primary-600 text-white border-primary-600'
                    : savia
                      ? 'bg-white border-savia-sand text-savia-ink'
                      : 'bg-white border-gray-300 text-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={marcado}
                  disabled={soloLectura}
                  onChange={() =>
                    set({
                      objetivos: marcado ? ficha.objetivos.filter((id) => id !== op.id) : [...ficha.objetivos, op.id],
                    })
                  }
                />
                {op.label}
              </label>
            );
          })}
          {soloLectura && ficha.objetivos.length === 0 && <p className={`text-sm ${ayuda}`}>Sin marcar</p>}
        </div>
        <label className="block mt-3">
          <span className={`text-sm font-medium ${ink}`}>Otra información que consideres importante</span>
          {soloLectura ? (
            <p className={`mt-1 text-sm whitespace-pre-wrap ${ink}`}>{ficha.otraInformacion || '—'}</p>
          ) : (
            <textarea
              value={ficha.otraInformacion}
              onChange={(e) => set({ otraInformacion: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm resize-y"
            />
          )}
        </label>
      </section>

      <section className={box}>
        <h3 className={titulo}>Declaración</h3>
        <p className={`mt-2 text-sm leading-snug ${ink}`}>{DECLARACION_FICHA}</p>
        {soloLectura ? (
          <p className={`mt-3 text-sm font-semibold ${ink}`}>
            {ficha.aceptaDeclaracion ? `Aceptada${fechaLegible(ficha.actualizadaEn) ? ` el ${fechaLegible(ficha.actualizadaEn)}` : ''}. Aclaración: ${nombre}.` : 'Sin aceptar.'}
          </p>
        ) : (
          <label className={`mt-3 flex items-start gap-2.5 text-sm font-medium cursor-pointer ${ink}`}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-gray-300"
              checked={ficha.aceptaDeclaracion}
              onChange={(e) => set({ aceptaDeclaracion: e.target.checked })}
            />
            <span>Acepto la declaración. Mi nombre ({nombre}) queda como aclaración.</span>
          </label>
        )}
      </section>

      {!soloLectura && onGuardar && (
        <div className="space-y-2">
          {faltan.length > 0 && <p className="text-xs text-amber-800">{faltan[0]}</p>}
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando || faltan.length > 0}
            className={`w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-50 touch-manipulation ${
              savia ? 'bg-savia-olive' : 'bg-primary-600'
            }`}
          >
            {guardando ? 'Guardando…' : 'Guardar ficha'}
          </button>
        </div>
      )}
    </div>
  );
}
