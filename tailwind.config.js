/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#1B3A4B",
          dark: "#0F2027",
          blue: "#2E75B6",
          gold: "#D4A843",
          green: "#2ECC71",
        },
      },
    },
  },
  plugins: [],
};
