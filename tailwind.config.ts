import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { forest: '#105c4c', canvas: '#f6f7f5' },
      fontFamily: { sans: ['"DM Sans Variable"', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
