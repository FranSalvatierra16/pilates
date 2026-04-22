/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /** Verde bosque + acento cálido (marca FitGest / logo circular) */
        primary: {
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

