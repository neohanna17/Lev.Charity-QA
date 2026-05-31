/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Accent = levcharity blue.
        brand: {
          DEFAULT: '#2f6df6',
          600: '#1f5be0',
          700: '#1847c0',
        },
        // Secondary brand accents from the logo.
        gold: '#fbbc09',
        coral: '#ea4d3d',
        // Light neutral surface scale. 800 = card/white, lower numbers get
        // progressively greyer for borders and recessed panels.
        ink: {
          900: '#ffffff',
          800: '#ffffff',
          700: '#eef1f6',
          600: '#e3e7ef',
          500: '#cdd4e0',
        },
      },
    },
  },
  plugins: [],
};
