/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          ink: '#0d2b45',
          muted: '#58708a',
          sky: '#0d8adf',
          'sky-dark': '#0a74bd',
          coral: '#ff6f34',
          surface: '#bed4e8',
        },
      },
      boxShadow: {
        panel: '0 28px 80px rgba(13, 43, 69, 0.1)',
        soft: '0 18px 34px rgba(13, 138, 223, 0.28)',
      },
    },
  },
}
