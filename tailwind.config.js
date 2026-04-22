/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /** App (sucursal, módulos): azul original */
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        /** Solo landing (marca FitGest / logo) */
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#3d8f52',
          600: '#2d6b3f',
          700: '#245334',
          800: '#1a3d27',
          900: '#132a1a',
        },
        /** Acento cálido (CTA landing) */
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#f58220',
          700: '#ea580c',
          800: '#c2410c',
          900: '#9a3412',
        },
      },
    },
  },
  plugins: [],
}
