/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1C2B5A', 50: '#EEF2FA', 100: '#DCE4F5', 700: '#24366F', 800: '#1C2B5A', 900: '#0F1A3D' },
        brand: { DEFAULT: '#2F6FED', 50: '#EEF4FF', 100: '#DCE7FF', 600: '#2F6FED', 700: '#1F55C7' },
        gold: { DEFAULT: '#F5B700', 50: '#FFF8E1' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], display: ['Poppins', 'Inter', 'sans-serif'] },
    },
  },
  plugins: [],
}
