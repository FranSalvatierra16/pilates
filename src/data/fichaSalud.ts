export type SiNo = 'si' | 'no' | '';

export interface FichaSalud {
  /** Fecha de la ficha (YYYY-MM-DD). Si no hay, se usa la última guardada o el día de hoy. */
  fecha: string;
  contactoNombre: string;
  contactoTelefono: string;
  antecedentes: string[];
  antecedentesDetalle: string;
  dolorActual: SiNo;
  dolorDetalle: string;
  indicacionMedica: SiNo;
  indicacionDetalle: string;
  medicacion: SiNo;
  medicacionDetalle: string;
  otraActividad: SiNo;
  otraActividadDetalle: string;
  objetivos: string[];
  otraInformacion: string;
  aceptaDeclaracion: boolean;
  actualizadaEn?: string | null;
}

export const ANTECEDENTES_FICHA: { id: string; label: string }[] = [
  { id: 'hipertension', label: 'Hipertensión' },
  {
    id: 'hipotension_ortostatica',
    label:
      'Hipotensión ortostática (baja de presión o mareos al incorporarse, por ejemplo, al levantarse de la cama o del reformer)',
  },
  { id: 'cardiacos_respiratorios', label: 'Problemas cardíacos o respiratorios' },
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'osteoporosis', label: 'Osteoporosis / osteopenia' },
  { id: 'columna', label: 'Problemas de columna o hernias' },
  { id: 'lesiones', label: 'Lesiones o cirugías previas' },
  { id: 'vertigo', label: 'Vértigo / problemas de equilibrio' },
  { id: 'embarazo', label: 'Embarazo o posparto reciente' },
  { id: 'otra', label: 'Otra condición' },
  { id: 'ninguna', label: 'Ninguna' },
];

export const OBJETIVOS_FICHA: { id: string; label: string }[] = [
  { id: 'movilidad', label: 'Movilidad' },
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'postura', label: 'Postura' },
  { id: 'core', label: 'Core' },
  { id: 'flexibilidad', label: 'Flexibilidad' },
  { id: 'bienestar', label: 'Bienestar' },
];

export const DECLARACION_FICHA =
  'Declaro que la información brindada es verdadera según mi conocimiento y me comprometo a informar cambios relevantes en mi salud. Comprendo que esta ficha no reemplaza una evaluación médica cuando sea necesaria y autorizo el uso de estos datos únicamente para adaptar la práctica, con confidencialidad.';

const IDS_ANTECEDENTES = new Set(ANTECEDENTES_FICHA.map((o) => o.id));
const IDS_OBJETIVOS = new Set(OBJETIVOS_FICHA.map((o) => o.id));

export function fichaVacia(): FichaSalud {
  return {
    fecha: '',
    contactoNombre: '',
    contactoTelefono: '',
    antecedentes: [],
    antecedentesDetalle: '',
    dolorActual: '',
    dolorDetalle: '',
    indicacionMedica: '',
    indicacionDetalle: '',
    medicacion: '',
    medicacionDetalle: '',
    otraActividad: '',
    otraActividadDetalle: '',
    objetivos: [],
    otraInformacion: '',
    aceptaDeclaracion: false,
    actualizadaEn: null,
  };
}

function siNo(v: unknown): SiNo {
  return v === 'si' || v === 'no' ? v : '';
}

function texto(v: unknown, max = 800): string {
  return String(v ?? '').trim().slice(0, max);
}

/** Deja solo opciones conocidas. "Ninguna" no convive con el resto. */
export function normalizarFichaSalud(raw: unknown): FichaSalud {
  const base = fichaVacia();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  let antecedentes = Array.isArray(r.antecedentes)
    ? [...new Set(r.antecedentes.map((id) => String(id)).filter((id) => IDS_ANTECEDENTES.has(id)))]
    : [];
  if (antecedentes.includes('ninguna')) antecedentes = ['ninguna'];
  const objetivos = Array.isArray(r.objetivos)
    ? [...new Set(r.objetivos.map((id) => String(id)).filter((id) => IDS_OBJETIVOS.has(id)))]
    : [];
  const fecha = texto(r.fecha, 10);
  const contactoViejo = texto(r.contactoEmergencia, 200);
  return {
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : '',
    contactoNombre: texto(r.contactoNombre, 120) || contactoViejo,
    contactoTelefono: texto(r.contactoTelefono, 40),
    antecedentes,
    antecedentesDetalle: texto(r.antecedentesDetalle),
    dolorActual: siNo(r.dolorActual),
    dolorDetalle: texto(r.dolorDetalle),
    indicacionMedica: siNo(r.indicacionMedica),
    indicacionDetalle: texto(r.indicacionDetalle),
    medicacion: siNo(r.medicacion),
    medicacionDetalle: texto(r.medicacionDetalle),
    otraActividad: siNo(r.otraActividad),
    otraActividadDetalle: texto(r.otraActividadDetalle),
    objetivos,
    otraInformacion: texto(r.otraInformacion, 1200),
    aceptaDeclaracion: r.aceptaDeclaracion === true,
    actualizadaEn: typeof r.actualizadaEn === 'string' ? r.actualizadaEn : null,
  };
}

/** Fecha a mostrar: la guardada en la ficha, si no la última actualización, si no el día de hoy. */
export function fechaVisibleFicha(f: FichaSalud, hoy: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return f.fecha;
  const guardada = (f.actualizadaEn || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(guardada)) return guardada;
  return hoy;
}

export function toggleAntecedente(actual: string[], id: string): string[] {
  if (id === 'ninguna') return actual.includes('ninguna') ? [] : ['ninguna'];
  const sin = actual.filter((x) => x !== 'ninguna' && x !== id);
  return actual.includes(id) ? sin : [...sin, id];
}

export function faltantesFicha(f: FichaSalud): string[] {
  const faltan: string[] = [];
  if (!f.contactoNombre.trim()) faltan.push('Completá el nombre del contacto de emergencia.');
  if (!f.contactoTelefono.trim()) faltan.push('Completá el teléfono del contacto de emergencia.');
  if (f.antecedentes.length === 0) faltan.push('Marcá al menos un antecedente, o "Ninguna".');
  if (f.antecedentes.includes('otra') && !f.antecedentesDetalle.trim()) {
    faltan.push('Si marcaste "Otra condición", contá cuál es.');
  }
  if (!f.dolorActual) faltan.push('Respondé si tenés dolor o molestias.');
  if (f.dolorActual === 'si' && !f.dolorDetalle.trim()) faltan.push('Contá en qué zona y con qué movimientos te molesta.');
  if (!f.indicacionMedica) faltan.push('Respondé si tenés indicación médica de evitar o adaptar algún ejercicio.');
  if (f.indicacionMedica === 'si' && !f.indicacionDetalle.trim()) faltan.push('Contá cuál es la indicación médica.');
  if (!f.medicacion) faltan.push('Respondé si tomás medicación relevante para la actividad física.');
  if (f.medicacion === 'si' && !f.medicacionDetalle.trim()) faltan.push('Contá cuál es la medicación.');
  if (!f.otraActividad) faltan.push('Respondé si realizás otra actividad física.');
  if (f.otraActividad === 'si' && !f.otraActividadDetalle.trim()) faltan.push('Contá cuál es la otra actividad.');
  if (!f.aceptaDeclaracion) faltan.push('Tenés que aceptar la declaración para guardar la ficha.');
  return faltan;
}

export function etiquetaOpcion(lista: { id: string; label: string }[], id: string): string {
  return lista.find((o) => o.id === id)?.label || id;
}

const ANTECEDENTE_CORTO: Record<string, string> = {
  hipertension: 'Hipertensión',
  hipotension_ortostatica: 'Hipotensión o mareos',
  cardiacos_respiratorios: 'Problema cardíaco o respiratorio',
  diabetes: 'Diabetes',
  osteoporosis: 'Osteoporosis',
  columna: 'Columna o hernia',
  lesiones: 'Lesión o cirugía',
  vertigo: 'Vértigo',
  embarazo: 'Embarazo o posparto',
  otra: 'Otra condición',
};

export type AvisoFicha = { id: string; texto: string };

/** Lo que la sucursal tiene que tener a la vista: enfermedad, medicación, dolor u otra nota. */
export function avisosFicha(f: FichaSalud | null | undefined): AvisoFicha[] {
  if (!f?.aceptaDeclaracion) return [];
  const avisos: AvisoFicha[] = [];
  for (const id of f.antecedentes) {
    if (id === 'ninguna') continue;
    const base = ANTECEDENTE_CORTO[id] || etiquetaOpcion(ANTECEDENTES_FICHA, id);
    const extra = id === 'otra' && f.antecedentesDetalle.trim() ? `: ${f.antecedentesDetalle.trim()}` : '';
    avisos.push({ id: `ant-${id}`, texto: `${base}${extra}` });
  }
  if (f.antecedentesDetalle.trim() && !f.antecedentes.includes('otra') && !f.antecedentes.includes('ninguna')) {
    avisos.push({ id: 'ant-detalle', texto: f.antecedentesDetalle.trim() });
  }
  if (f.dolorActual === 'si') {
    avisos.push({ id: 'dolor', texto: f.dolorDetalle.trim() ? `Dolor: ${f.dolorDetalle.trim()}` : 'Dolor o molestias' });
  }
  if (f.indicacionMedica === 'si') {
    avisos.push({
      id: 'indicacion',
      texto: f.indicacionDetalle.trim() ? `Indicación médica: ${f.indicacionDetalle.trim()}` : 'Indicación médica',
    });
  }
  if (f.medicacion === 'si') {
    avisos.push({
      id: 'medicacion',
      texto: f.medicacionDetalle.trim() ? `Medicación: ${f.medicacionDetalle.trim()}` : 'Toma medicación',
    });
  }
  if (f.otraInformacion.trim()) {
    avisos.push({ id: 'nota', texto: f.otraInformacion.trim() });
  }
  return avisos;
}
