/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dataviz status palette (fixed — never themed)
        good: '#0ca30c',
        critical: '#d03b3b',
        // Categorical slot 1 (blue) for primary/neutral stat accents
        brand: '#2a78d6',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,11,11,0.04), 0 8px 24px -8px rgba(11,11,11,0.10)',
      },
    },
  },
  plugins: [],
};
