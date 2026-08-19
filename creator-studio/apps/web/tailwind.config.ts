import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        elevated: 'hsl(var(--surface-elevated) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        muted: 'hsl(var(--muted-foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        glass: 'hsl(var(--glass) / <alpha-value>)',
        'glass-border': 'hsl(var(--glass-border) / <alpha-value>)',
        'node-inspiration': 'hsl(var(--node-inspiration) / <alpha-value>)',
        'node-topic': 'hsl(var(--node-topic) / <alpha-value>)',
        'node-structure': 'hsl(var(--node-structure) / <alpha-value>)',
        'node-script': 'hsl(var(--node-script) / <alpha-value>)',
        'node-image': 'hsl(var(--node-image) / <alpha-value>)',
        'node-audio': 'hsl(var(--node-audio) / <alpha-value>)',
        'node-video': 'hsl(var(--node-video) / <alpha-value>)',
        'node-action': 'hsl(var(--node-action) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Bricolage Grotesque Variable', 'Noto Sans SC Variable', 'sans-serif'],
        body: ['Noto Sans SC Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        utility: ['IBM Plex Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        float: 'var(--shadow-float)',
        focus: '0 0 0 3px hsl(var(--primary) / 0.28)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        normal: 'var(--motion-normal)',
      },
    },
  },
  plugins: [],
} satisfies Config
