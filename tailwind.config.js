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
        /** Portal alumno Savia Pilates (logo) */
        savia: {
          cream: '#FAF7F2',
          creamDeep: '#F3EDE4',
          sand: '#C9B28D',
          sandSoft: '#E8DFD0',
          terra: '#8F664C',
          terraDeep: '#6F4E37',
          terraSoft: '#E9DDD2',
          olive: '#768158',
          oliveDeep: '#5C6644',
          oliveSoft: '#E4E8D8',
          ink: '#3D342C',
          muted: '#7A6F64',
        },
      },
      fontFamily: {
        saviaDisplay: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        savia: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'savia-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'savia-soft-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'savia-breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
      },
      animation: {
        'savia-fade-up': 'savia-fade-up 0.55s ease-out both',
        'savia-soft-in': 'savia-soft-in 0.5s ease-out both',
        'savia-breathe': 'savia-breathe 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
