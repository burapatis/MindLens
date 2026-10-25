/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./*.html', './js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Noto Sans Thai"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif']
      },
      colors: {
        ink: {
          950: '#07080d',
          900: '#0c0e16',
          800: '#11131d',
          700: '#1a1d2b',
          600: '#262a3b'
        }
      }
    }
  },
  plugins: []
};
