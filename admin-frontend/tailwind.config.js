export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#0f1117', light: '#161822', lighter: '#1e2030' },
        accent: { DEFAULT: '#6366f1', hover: '#818cf8' },
        success: '#22c55e',
        warning: '#eab308',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};
