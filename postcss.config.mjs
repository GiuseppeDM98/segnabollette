// Tailwind through PostCSS: it serves both `next build --webpack` and `next dev` with Turbopack.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
