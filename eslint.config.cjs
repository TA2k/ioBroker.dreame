const globals = require('globals');
const js = require('@eslint/js');

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = [
  {
    ignores: ['**/.prettierrc.js', '**/.eslintrc.js', 'admin/words.js', '.docu/**'],
  },
  ...compat.extends('eslint:recommended'),
  {
    plugins: {},

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
      },

      ecmaVersion: 'latest',
      sourceType: 'commonjs',
    },

    rules: {
      indent: [
        'error',
        2,
        {
          SwitchCase: 1,
        },
      ],

      'no-console': 'off',

      'no-unused-vars': [
        'off',
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
        },
      ],
      'no-useless-escape': 'off',
      'no-var': 'error',
      'no-trailing-spaces': 'error',
      'prefer-const': 'error',

      quotes: [
        'error',
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: true,
        },
      ],

      semi: ['error', 'always'],
    },
  },
  {
    files: ['www/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // www/js/karte/*.js und main.js teilen sich einen einzigen globalen Scope ueber mehrere
    // <script>-Tags (kein Bundler, keine Module — bewusst, siehe WIDGET_UMBAU_PLAN.md Etappe B,
    // Regel 0.4: Ricardos Karten-Renderer wird 1:1 uebernommen, nicht auf ES-Module umgebaut).
    // no-undef kann Querverweise zwischen diesen Dateien grundsaetzlich nicht aufloesen — jede
    // Funktion/Variable, die eine andere Datei definiert, waere sonst ein Fehler, obwohl der
    // Code zur Laufzeit (alle Scripts im selben Dokument) korrekt funktioniert. Eine Positivliste
    // aller ca. 150 gemeinsamen Namen waere staendiger Pflegeaufwand und bei jedem neuen
    // Etappe-C/D-Panel wieder veraltet — deshalb hier bewusst abgeschaltet statt gepflegt.
    // Verifiziert wird das stattdessen einmalig pro betroffenem Commit ueber ein verkettetes
    // Skript mit echten Browser-Globals (siehe WIDGET_SESSION_STATUS.md, Commit B5).
    //
    // prefer-const/no-unassigned-vars sind aus demselben Grund abgeschaltet: Variablen wie
    // robotMk/scale/META werden aus Sicht EINER Datei nie zugewiesen bzw. nie neu zugewiesen,
    // obwohl eine andere Datei genau das zur Laufzeit tut (gemeinsamer Scope).
    //
    // indent/no-empty sind fuer www/js/karte/**/*.js abgeschaltet, weil dort Ricardos
    // Original-Formatierung/-Idiome (mehrzeilige Ausdruecke mit visueller statt strikter
    // Einrueckung, leere catch-Bloecke als bewusstes "Fehler hier ignorieren") unveraendert
    // uebernommen wurden (Regel 0.4: "inhaltlich unveraendert") — nicht fuer main.js, das ist
    // neuer Code ohne dieses Erbe.
    files: ['www/js/karte/**/*.js', 'www/js/main.js'],
    rules: {
      'no-undef': 'off',
      'prefer-const': 'off',
      'no-unassigned-vars': 'off',
    },
  },
  {
    files: ['www/js/karte/**/*.js'],
    rules: {
      indent: 'off',
      'no-empty': 'off',
    },
  },
];
