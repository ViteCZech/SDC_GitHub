/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
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
        'high-score-pop': 'high-score-pop 1.5s ease-out forwards',
      },
    },
  },
  plugins: [],
}