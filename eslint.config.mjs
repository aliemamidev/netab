export default [
  {
    files: ["src/**/*.js", "scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly", location: "readonly", history: "readonly",
        localStorage: "readonly", console: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly", requestAnimationFrame: "readonly", fetch: "readonly",
        URL: "readonly", URLSearchParams: "readonly", Blob: "readonly", Image: "readonly", Node: "readonly",
        Event: "readonly", CustomEvent: "readonly", EventTarget: "readonly", DOMParser: "readonly", CSS: "readonly",
        AbortController: "readonly", TextEncoder: "readonly", TextDecoder: "readonly", ClipboardItem: "readonly", crypto: "readonly", btoa: "readonly", atob: "readonly", indexedDB: "readonly", AudioContext: "readonly", chrome: "readonly",
        globalThis: "readonly", structuredClone: "readonly", Intl: "readonly", matchMedia: "readonly",
        innerWidth: "readonly", innerHeight: "readonly", process: "readonly", performance: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-const-assign": "error",
      "no-self-assign": "error",
      "no-use-before-define": ["error", { functions: false, classes: false, variables: false }],
    },
  },
];
