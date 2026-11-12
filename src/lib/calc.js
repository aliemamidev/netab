// Safe calculator + unit converter for the search box.
// No eval: a small tokenizer and precedence-climbing parser.

import { toLatinDigits } from "./utils.js";

const FUNCTIONS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  ln: Math.log,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  hypot: Math.hypot,
};

const CONSTANTS = { pi: Math.PI, "π": Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

function tokenize(input) {
  const tokens = [];
  const src = input;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const num = /^(\d+(?:_\d{3})*(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      tokens.push({ type: "num", value: Number(num[0].replace(/_/g, "")) });
      i += num[0].length;
      continue;
    }
    const word = /^[a-zπ][a-z0-9]*/i.exec(src.slice(i));
    if (word) {
      tokens.push({ type: "id", value: word[0].toLowerCase() });
      i += word[0].length;
      continue;
    }
    if (src.startsWith("**", i)) {
      tokens.push({ type: "op", value: "^" });
      i += 2;
      continue;
    }
    const map = { "×": "*", "÷": "/", "−": "-" };
    const op = map[ch] || ch;
    if ("+-*/%^(),!".includes(op)) {
      tokens.push({ type: op === "(" || op === ")" || op === "," ? op : "op", value: op });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected "${ch}"`);
  }
  return tokens;
}

const BINARY = {
  "+": { prec: 1, fn: (a, b) => a + b },
  "-": { prec: 1, fn: (a, b) => a - b },
  "*": { prec: 2, fn: (a, b) => a * b },
  "/": { prec: 2, fn: (a, b) => a / b },
  "%": { prec: 2, fn: (a, b) => a % b },
  "^": { prec: 4, fn: (a, b) => a ** b, right: true },
};

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) throw new Error("factorial domain");
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i += 1) r *= i;
  return r;
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const tok = next();
    if (!tok || tok.type !== type) throw new Error(`Expected ${type}`);
    return tok;
  };

  function primary() {
    const tok = next();
    if (!tok) throw new Error("Unexpected end");
    if (tok.type === "num") return tok.value;
    if (tok.type === "op" && (tok.value === "-" || tok.value === "+")) {
      const v = expression(3);
      return tok.value === "-" ? -v : v;
    }
    if (tok.type === "(") {
      const v = expression(0);
      expect(")");
      return v;
    }
    if (tok.type === "id") {
      if (tok.value in CONSTANTS) return CONSTANTS[tok.value];
      const fn = FUNCTIONS[tok.value];
      if (!fn) throw new Error(`Unknown "${tok.value}"`);
      expect("(");
      const args = [];
      if (peek()?.type !== ")") {
        args.push(expression(0));
        while (peek()?.type === ",") {
          next();
          args.push(expression(0));
        }
      }
      expect(")");
      return fn(...args);
    }
    throw new Error("Unexpected token");
  }

  function postfix() {
    let v = primary();
    while (peek()?.type === "op" && peek().value === "!") {
      next();
      v = factorial(v);
    }
    // Implicit multiplication: 2(3+4), 2pi, (1+2)(3+4)
    while (peek() && (peek().type === "(" || (peek().type === "id" && tokens[pos - 1]?.type !== "id"))) {
      v *= primary();
    }
    return v;
  }

  function expression(minPrec) {
    let left = postfix();
    for (;;) {
      const tok = peek();
      if (!tok || tok.type !== "op" || !BINARY[tok.value]) break;
      const { prec, fn, right } = BINARY[tok.value];
      if (prec < minPrec) break;
      next();
      const rhs = expression(right ? prec : prec + 1);
      left = fn(left, rhs);
    }
    return left;
  }

  const value = expression(0);
  if (pos < tokens.length) throw new Error("Trailing input");
  return value;
}

export function evaluate(expr) {
  const tokens = tokenize(toLatinDigits(expr));
  if (!tokens.length) throw new Error("Empty");
  return parse(tokens);
}

// ---------------------------------------------------------------------------
// Units

const UNIT_GROUPS = {
  length: {
    base: "m",
    units: {
      mm: 0.001, millimeter: 0.001, millimeters: 0.001,
      cm: 0.01, centimeter: 0.01, centimeters: 0.01,
      m: 1, meter: 1, meters: 1, metre: 1,
      km: 1000, kilometer: 1000, kilometers: 1000,
      in: 0.0254, inch: 0.0254, inches: 0.0254,
      ft: 0.3048, foot: 0.3048, feet: 0.3048,
      yd: 0.9144, yard: 0.9144, yards: 0.9144,
      mi: 1609.344, mile: 1609.344, miles: 1609.344,
      nmi: 1852,
    },
  },
  mass: {
    base: "kg",
    units: {
      mg: 1e-6, g: 0.001, gram: 0.001, grams: 0.001,
      kg: 1, kilogram: 1, kilograms: 1,
      t: 1000, ton: 1000, tonne: 1000,
      oz: 0.028349523125, ounce: 0.028349523125, ounces: 0.028349523125,
      lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237,
      st: 6.35029318, stone: 6.35029318,
      mesghal: 0.004608, mithqal: 0.004608,
    },
  },
  data: {
    base: "b",
    units: {
      bit: 0.125, bits: 0.125,
      b: 1, byte: 1, bytes: 1,
      kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15,
      kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
      mbit: 125000, gbit: 125000000,
    },
  },
  time: {
    base: "s",
    units: {
      ms: 0.001, s: 1, sec: 1, second: 1, seconds: 1,
      min: 60, minute: 60, minutes: 60,
      h: 3600, hr: 3600, hour: 3600, hours: 3600,
      d: 86400, day: 86400, days: 86400,
      wk: 604800, week: 604800, weeks: 604800,
      yr: 31557600, year: 31557600, years: 31557600,
    },
  },
  volume: {
    base: "l",
    units: {
      ml: 0.001, l: 1, liter: 1, liters: 1, litre: 1,
      gal: 3.785411784, gallon: 3.785411784, gallons: 3.785411784,
      qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, cups: 0.2365882365,
      floz: 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375,
    },
  },
  speed: {
    base: "ms",
    units: { "m/s": 1, mps: 1, kmh: 1 / 3.6, "km/h": 1 / 3.6, kph: 1 / 3.6, mph: 0.44704, knot: 0.514444, knots: 0.514444, kn: 0.514444 },
  },
  area: {
    base: "m2",
    units: { m2: 1, sqm: 1, km2: 1e6, ft2: 0.09290304, sqft: 0.09290304, ha: 1e4, hectare: 1e4, acre: 4046.8564224, acres: 4046.8564224 },
  },
};

const TEMPERATURE = new Set(["c", "f", "k", "celsius", "fahrenheit", "kelvin", "°c", "°f"]);

function tempToC(v, u) {
  if (u.startsWith("f") || u === "°f") return ((v - 32) * 5) / 9;
  if (u.startsWith("k")) return v - 273.15;
  return v;
}
function tempFromC(v, u) {
  if (u.startsWith("f") || u === "°f") return (v * 9) / 5 + 32;
  if (u.startsWith("k")) return v + 273.15;
  return v;
}

function findGroup(unit) {
  for (const [name, group] of Object.entries(UNIT_GROUPS)) {
    if (unit in group.units) return { name, group };
  }
  return null;
}

const UNIT_RE = /^\s*(-?[\d.,_]+(?:e[+-]?\d+)?)\s*([a-z°/²0-9]+)\s+(?:to|in|as|=|به)\s+([a-z°/²0-9]+)\s*$/i;

export function convertUnits(input, rates = null) {
  const m = UNIT_RE.exec(toLatinDigits(input).replace(/²/g, "2"));
  if (!m) return null;
  const value = Number(m[1].replace(/[,_]/g, ""));
  if (!Number.isFinite(value)) return null;
  const from = m[2].toLowerCase();
  const to = m[3].toLowerCase();

  if (TEMPERATURE.has(from) && TEMPERATURE.has(to)) {
    return { value: tempFromC(tempToC(value, from), to), unit: to.replace(/^°/, "").toUpperCase().slice(0, 1), from: `${value} ${from}` };
  }

  const a = findGroup(from);
  const b = findGroup(to);
  if (a && b && a.name === b.name) {
    return { value: (value * a.group.units[from]) / b.group.units[to], unit: to, from: `${value} ${from}` };
  }

  if (rates && /^[a-z]{3}$/.test(from) && /^[a-z]{3}$/.test(to)) {
    const rf = rates[from.toUpperCase()];
    const rt = rates[to.toUpperCase()];
    if (rf && rt) return { value: (value / rf) * rt, unit: to.toUpperCase(), from: `${value} ${from.toUpperCase()}`, currency: true };
  }
  return null;
}

const PERCENT_OF = /^\s*(-?[\d.]+)\s*%\s*(?:of|از)\s+(.+)$/i;

/**
 * Try to compute `input`. Returns null when the text is not a calculation
 * (so plain words never show a bogus result).
 */
export function calculate(input, { rates = null } = {}) {
  const raw = toLatinDigits(String(input || "")).trim().replace(/^=\s*/, "");
  if (!raw || raw.length > 200) return null;

  const unit = convertUnits(raw, rates);
  if (unit) return { kind: "unit", ...unit };

  const pct = PERCENT_OF.exec(raw);
  if (pct) {
    try {
      const base = evaluate(pct[2]);
      const value = (Number(pct[1]) / 100) * base;
      if (Number.isFinite(value)) return { kind: "math", value };
    } catch {
      /* not a calc */
    }
  }

  // Must contain an operator or function call — "42" alone is not a calculation.
  if (!/[-+*/^%×÷!()]|\b(sqrt|cbrt|sin|cos|tan|log|ln|abs|round|floor|ceil|exp|pow|min|max|hypot|pi)\b/i.test(raw)) return null;
  if (/^[a-z\s]+$/i.test(raw)) return null;
  try {
    const value = evaluate(raw);
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    return { kind: "math", value };
  } catch {
    return null;
  }
}

export function formatResult(value, locale) {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "-∞" : "NaN";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return value.toExponential(6).replace(/\.?0+e/, "e");
  return new Intl.NumberFormat(locale, { maximumFractionDigits: abs < 1 ? 10 : 6 }).format(Number(value.toPrecision(12)));
}
