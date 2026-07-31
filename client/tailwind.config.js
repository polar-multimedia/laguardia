/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#5b8dee',
        accent2: '#8b5cf6',
      },
    },
  },
  plugins: [],
};
