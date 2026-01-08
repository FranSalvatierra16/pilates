import { createClient } from '@supabase/supabase-js';

// Estas variables se configurarán en Vercel
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Tipos para las tablas
export interface Database {
  public: {
    Tables: {
      alumnos: {
        Row: {
          id: string;
          nombre: string;
          apellido: string;
          dni: string;
          telefono: string;
          email: string;
          fecha_vencimiento_cuota: string;
          actividad_id: string;
          created_at: string;
        };
      };
      actividades: {
        Row: {
          id: string;
          nombre: string;
          precio: number;
          created_at: string;
        };
      };
      pagos: {
        Row: {
          id: string;
          alumno_id: string;
          monto: number;
          metodo_pago: 'efectivo' | 'transferencia';
          fecha: string;
          created_at: string;
        };
      };
      gastos: {
        Row: {
          id: string;
          descripcion: string;
          monto: number;
          metodo_pago: 'efectivo' | 'transferencia';
          fecha: string;
          created_at: string;
        };
      };
      turnos: {
        Row: {
          id: string;
          dia_semana: number;
          hora: string;
          alumno_ids: string[];
          created_at: string;
        };
      };
    };
  };
}

