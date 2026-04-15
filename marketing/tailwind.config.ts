import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#060d1a',
          900: '#0b1628',
          800: '#0e1e3a',
          700: '#14264d',
        },
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(ellipse 90% 65% at 50% -5%, rgba(37,99,235,0.32) 0%, rgba(16,185,129,0.14) 55%, transparent 75%)',
        'green-glow':
          'radial-gradient(ellipse 70% 50% at 50% 110%, rgba(16,185,129,0.18) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
};

export default config;
