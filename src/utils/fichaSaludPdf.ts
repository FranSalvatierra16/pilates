import { ANTECEDENTES_FICHA, DECLARACION_FICHA, FichaSalud, OBJETIVOS_FICHA, etiquetaOpcion } from '../data/fichaSalud';
import { formatDate } from './date';

function fechaCorta(iso?: string | null): string {
  const s = (iso || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatDate(s) : '—';
}

function siNo(v: string): string {
  if (v === 'si') return 'Sí';
  if (v === 'no') return 'No';
  return 'Sin responder';
}

export async function descargarFichaSaludPdf(opts: {
  ficha: FichaSalud;
  nombre: string;
  apellido: string;
  telefono?: string;
  fechaNacimiento?: string;
  estudio?: string;
}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 16;
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = doc.internal.pageSize.getWidth() - margin * 2;
  let y = 18;
  const ink: [number, number, number] = [61, 52, 44];
  const muted: [number, number, number] = [122, 111, 100];

  const linea = (text: string, opts?: { bold?: boolean; size?: number; gap?: number; color?: [number, number, number] }) => {
    if (opts?.gap) y += opts.gap;
    const size = opts?.size || 11;
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(opts?.color || ink));
    const lines = doc.splitTextToSize(text || '—', maxW);
    const alto = lines.length * (size * 0.38 + 1.4);
    if (y + alto > pageH - 14) {
      doc.addPage();
      y = 18;
    }
    doc.text(lines, margin, y);
    y += alto;
  };

  const marca = opts.ficha.antecedentes.map((id) => etiquetaOpcion(ANTECEDENTES_FICHA, id));
  const objetivos = opts.ficha.objetivos.map((id) => etiquetaOpcion(OBJETIVOS_FICHA, id));
  const nombre = [opts.apellido, opts.nombre].filter(Boolean).join(', ') || '—';
  const fecha = fechaCorta(opts.ficha.fecha || opts.ficha.actualizadaEn);

  linea((opts.estudio || 'Estudio').toUpperCase(), { bold: true, size: 12, color: muted });
  linea('FICHA DE SALUD', { bold: true, size: 18, gap: 1 });
  linea('Información confidencial', { size: 10, color: muted });
  linea(`Fecha: ${fecha}`, { bold: true, size: 12, gap: 4 });

  linea('1. Datos personales', { bold: true, size: 13, gap: 6 });
  linea(`Nombre y apellido: ${nombre}`);
  linea(`Fecha de nacimiento: ${fechaCorta(opts.fechaNacimiento)}`);
  linea(`Teléfono: ${opts.telefono?.trim() || '—'}`);
  linea(`Contacto de emergencia: ${opts.ficha.contactoNombre || '—'}`);
  linea(`Teléfono del contacto: ${opts.ficha.contactoTelefono || '—'}`);

  linea('2. Antecedentes de salud', { bold: true, size: 13, gap: 5 });
  linea(marca.length ? marca.map((t) => `• ${t}`).join('\n') : 'Sin marcar');
  linea(`Detalle: ${opts.ficha.antecedentesDetalle || '—'}`, { gap: 2 });

  linea('3. Dolor, lesiones y limitaciones', { bold: true, size: 13, gap: 5 });
  linea(`Dolor o molestias actualmente: ${siNo(opts.ficha.dolorActual)}`);
  if (opts.ficha.dolorActual === 'si') linea(`Zona y movimientos: ${opts.ficha.dolorDetalle || '—'}`);
  linea(`Indicación médica de evitar o adaptar: ${siNo(opts.ficha.indicacionMedica)}`);
  if (opts.ficha.indicacionMedica === 'si') linea(`Cuál: ${opts.ficha.indicacionDetalle || '—'}`);

  linea('4. Medicación y actividad física', { bold: true, size: 13, gap: 5 });
  linea(`Medicación relevante: ${siNo(opts.ficha.medicacion)}${opts.ficha.medicacion === 'si' ? ` — ${opts.ficha.medicacionDetalle || '—'}` : ''}`);
  linea(`Otra actividad física: ${siNo(opts.ficha.otraActividad)}${opts.ficha.otraActividad === 'si' ? ` — ${opts.ficha.otraActividadDetalle || '—'}` : ''}`);

  linea('5. Objetivos', { bold: true, size: 13, gap: 5 });
  linea(objetivos.length ? objetivos.join(' · ') : 'No indicó objetivo.');
  linea(`Otra información: ${opts.ficha.otraInformacion || '—'}`, { gap: 2 });

  linea('Declaración', { bold: true, size: 13, gap: 5 });
  linea(DECLARACION_FICHA, { size: 10 });
  linea(opts.ficha.aceptaDeclaracion ? `Aceptada. Aclaración: ${nombre}.` : 'Sin aceptar.', { bold: true, gap: 3 });

  const archivo = `ficha-salud-${(opts.apellido || 'alumno').toLowerCase()}.pdf`.replace(/\s+/g, '-');
  doc.save(archivo);
}
