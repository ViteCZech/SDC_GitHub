/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'slide-in': {
          '0%': { opacity: '0', transform: 'translate(-50%, 12px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        'high-score-pop': {
          '0%': { transform: 'scale(0)', opacity: '1' },
          '15%': { transform: 'scale(1.2)' },
          '25%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.05)' },
          '55%': { transform: 'scale(1)' },
          '66%': { opacity: '1', transform: 'scale(1) translateY(0)' },
          '100%': { opacity: '0', transform: 'scale(1) translateY(-24px)' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.25s ease-out forwards',
        'high-score-pop': 'high-score-pop 1.5s ease-out forwards',
      },
    },
  },
  plugins: [],
}