// Shows a screenshot captured from the popup with copy / download actions.

import { applyI18n, t } from "../lib/i18n.js";
import { applyTheme } from "../lib/theme.js";
import { hydrateIcons } from "../lib/icons.js";
import { loadSettings } from "../lib/storage.js";
import { downloadFile, hostname, dataUrlToBlob } from "../lib/utils.js";
import { toast } from "../lib/ui.js";

const KEY = "netab.shot";

async function main() {
  applyTheme(await loadSettings());
  applyI18n(document);
  hydrateIcons(document);
  document.title = t("shot.title");

  const area = chrome.storage.session || chrome.storage.local;
  const shot = (await area.get(KEY))[KEY];
  if (!shot?.dataUrl) {
    document.getElementById("shotEmpty").classList.remove("hidden");
    for (const id of ["copyBtn", "downloadBtn"]) document.getElementById(id).disabled = true;
    return;
  }
  const img = document.getElementById("shotImage");
  img.src = shot.dataUrl;
  img.alt = shot.title || "";
  document.getElementById("shotTitle").textContent = shot.title || t("shot.title");
  document.getElementById("shotMeta").textContent = `${hostname(shot.url)} · ${new Date(shot.at).toLocaleString(document.documentElement.lang === "fa" ? "fa-IR" : undefined)}`;

  const blob = dataUrlToBlob(shot.dataUrl);
  const name = `screenshot-${hostname(shot.url) || "page"}-${new Date(shot.at).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
  document.getElementById("downloadBtn").addEventListener("click", () => downloadFile(name, blob, "image/png"));
  document.getElementById("copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast(t("shot.copied"), { kind: "success" });
    } catch {
      toast(t("common.error"), { kind: "error" });
    }
  });
}

main();
