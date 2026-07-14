/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Indigo-dusk surfaces. Hue sits near 232deg, close to complementary with the
         * amber accent (~36deg), so the accent reads warm against it rather than muddy.
         *
         * Contrast rules, measured against dusk-950 / dusk-900:
         *   text     -> 100 (15.8:1), 300 (9.2:1), 400 (5.8:1). These are the ONLY tints
         *               valid for live text; 400 is the accessible floor.
         *   500/600  -> decorative and disabled only. They fail AA as text (3.4:1 and
         *               2.1:1), which is why timestamps and placeholders that used to sit
         *               at gray-600 now sit at dusk-400.
         *   800/700  -> hairline dividers and interactive borders.
         *   950/900  -> surfaces.
         */
        dusk: {
          50: '#F5F6FA',
          100: '#E5E8F0',
          200: '#CBD0E0',
          300: '#ABB2C9',
          400: '#838CAB',
          500: '#5B658C',
          600: '#3C466E',
          700: '#2B3358',
          800: '#1E2540',
          900: '#11162A',
          950: '#0A0D19',
        },

        /**
         * Named `accent`, not `amber`, so Tailwind's built-in amber scale isn't clobbered.
         * Reserved for the active nav state, verification, and borders on key interactive
         * elements -- not a general-purpose colour.
         *
         * White on accent is 2.17:1 and must never be used: a solid accent fill takes dark
         * text (dusk-950 on accent is 8.91:1). `strong` passes AA as text as well
         * (5.2:1 on dusk-950), so it is not border-only.
         */
        accent: {
          DEFAULT: '#EF9F27',
          strong: '#BA7517',
        },

        /** Alerts. Deliberately separate from the brand accent: urgency is not identity. */
        danger: {
          DEFAULT: '#E5484D',
        },

        /**
         * Confirmation. The semantic counterpart to `danger`, not a second accent -- upload
         * succeeded, road snapped. Kept out of the accent so amber never has to mean two
         * things at once. 6.13:1 on dusk-950 and 5.68:1 on dusk-900, so it is valid as text.
         */
        success: {
          DEFAULT: '#30A46C',
        },
      },

      fontFamily: {
        // Overriding `sans` makes Inter the app-wide default via Preflight, with no
        // per-component changes.
        sans: [
          'Inter Variable',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // Opt-in through `font-display`. Wordmark and section headers only.
        display: ['Fraunces Variable', 'ui-serif', 'Georgia', 'serif'],
        // `mono` is intentionally left as Tailwind's system stack: the coordinate readout
        // is the only mono element in the app, and a third webfont isn't worth the bytes
        // on mobile when the system stack is already tabular.
      },
    },
  },
  plugins: [],
};
