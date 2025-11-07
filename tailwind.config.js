/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
        'primary': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        'mono': ['Fira Code', 'Consolas', 'Monaco', 'monospace'],
      },
      colors: {
        primary: {
          50: '#e6f2ff',
          100: '#bae0ff',
          200: '#7cc4fa',
          300: '#47a3f3',
          400: '#2186eb',
          500: '#0967d2',
          600: '#0552b5',
          700: '#03449e',
          800: '#01337d',
          900: '#002159',
        },
      },
      spacing: {
        '0': '0',
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '20': '5rem',
        '24': '6rem',
        '32': '8rem',
      },
      borderRadius: {
        'sm': '0.375rem',
        'md': '0.625rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
}