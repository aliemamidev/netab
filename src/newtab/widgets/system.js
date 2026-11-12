// System monitor: CPU load, memory, battery and NeTab storage usage.

import { h, formatBytes, isExtension, fill } from "../../lib/utils.js";
import { t, fmtNumber, locale } from "../../lib/i18n.js";

function meter(label, value, detail, cls = "") {
  const pct = Math.max(0, Math.min(100, value));
  return h(
    "div",
    { class: `sys-row ${cls}` },
    h("div", { class: "sys-head" }, h("span", {}, label), h("strong", {}, `${fmtNumber(Math.round(pct))}%`)),
    h("div", { class: "sys-bar" }, h("div", { class: `sys-fill ${pct > 85 ? "hot" : pct > 65 ? "warm" : ""}`, style: { width: `${pct}%` } })),
    detail ? h("small", { class: "muted" }, detail) : null,
  );
}

export default {
  id: "system",
  icon: "cpu",
  size: "sm",
  title: () => t("w.system"),
  desc: () => t("w.system.desc"),

  mount(body) {
    let prevCpu = null;
    const wrap = h("div", { class: "sys" });
    body.append(wrap);

    async function cpuLoad() {
      if (!chrome.system?.cpu) return null;
      const info = await chrome.system.cpu.getInfo();
      const totals = info.processors.map((p) => p.usage);
      let pct = null;
      if (prevCpu) {
        let used = 0;
        let total = 0;
        totals.forEach((u, i) => {
          const p = prevCpu[i];
          used += u.user + u.kernel - (p.user + p.kernel);
          total += u.total - p.total;
        });
        pct = total > 0 ? (used / total) * 100 : 0;
      }
      prevCpu = totals;
      return { pct, model: info.modelName, cores: info.numOfProcessors };
    }

    async function render() {
      const rows = [];
      if (isExtension) {
        try {
          const cpu = await cpuLoad();
          if (cpu) rows.push(meter(t("sys.cpu"), cpu.pct ?? 0, `${cpu.model.replace(/\s+/g, " ").trim()} · ${t("sys.cores", { n: cpu.cores })}`));
        } catch {
          /* permission missing */
        }
        try {
          if (chrome.system?.memory) {
            const m = await chrome.system.memory.getInfo();
            const used = m.capacity - m.availableCapacity;
            rows.push(meter(t("sys.memory"), (used / m.capacity) * 100, `${formatBytes(used, locale())} / ${formatBytes(m.capacity, locale())}`));
          }
        } catch {
          /* ignore */
        }
      }
      try {
        const battery = await navigator.getBattery?.();
        if (battery && !(battery.charging && battery.level === 1 && battery.chargingTime === 0 && battery.dischargingTime === Infinity)) {
          rows.push(meter(t("sys.battery"), battery.level * 100, battery.charging ? t("sys.charging") : t("sys.onBattery"), "battery"));
        }
      } catch {
        /* ignore */
      }
      try {
        const est = await navigator.storage?.estimate?.();
        const local = isExtension ? await chrome.storage.local.getBytesInUse(null) : 0;
        if (est) rows.push(h("div", { class: "sys-foot muted small" }, t("sys.storage", { a: formatBytes(local, locale()), b: formatBytes(est.usage || 0, locale()) })));
      } catch {
        /* ignore */
      }
      fill(wrap, ...(rows.length ? rows : [h("div", { class: "muted small" }, t("tabs.extOnly"))]));
    }

    render();
    const timer = setInterval(() => document.visibilityState === "visible" && render(), 2000);
    return { destroy: () => clearInterval(timer) };
  },
};
