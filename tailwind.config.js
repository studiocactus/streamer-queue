/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'rgb(var(--color-bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--color-bg-tertiary) / <alpha-value>)',
        },
        brand: {
          purple: 'rgb(var(--theme-primary) / <alpha-value>)',
          'purple-light': 'rgb(var(--theme-primary-light) / <alpha-value>)',
          'purple-dark': 'rgb(var(--theme-primary-dark) / <alpha-value>)',
          green: '#C5FF00',
          'green-dark': '#A8D900',
        },
        content: {
          primary: 'rgb(var(--color-content-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-content-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-content-muted) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          light: 'rgb(var(--color-border-light) / <alpha-value>)',
        },
        status: {
          pending: '#F59E0B',
          approved: '#3B82F6',
          watching: '#9146FF',
          completed: '#22C55E',
          rejected: '#EF4444',
          queued: '#8B5CF6',
        },
      },
      maxWidth: {
        app: '1400px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        skeleton: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'skeleton-gradient': 'linear-gradient(90deg, #17171F 25%, #2A2A36 50%, #17171F 75%)',
        'hero-gradient': 'radial-gradient(ellipse at 50% 0%, rgba(145,70,255,0.15) 0%, transparent 70%)',
        'card-gradient': 'linear-gradient(135deg, rgba(145,70,255,0.05) 0%, transparent 100%)',
      },
    },
  },
  plugins: [],
}
