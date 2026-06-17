/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Tipografía cálida y redondeada (amigable para 60+).
        // 'mono' se reasigna a Nunito a propósito: así todo el uso de font-mono
        // de la app deja de verse rígido/máquina de escribir, sin tocar cada archivo.
        sans: ['Nunito', 'sans-serif'],
        mono: ['Nunito', 'sans-serif'],
        display: ['Poppins', 'Nunito', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
