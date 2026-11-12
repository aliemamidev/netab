// QR code dialog (popup: current page, new tab: any text via the command palette).

import { h, copyText, downloadFile, dataUrlToBlob } from "./utils.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";
import { dialog, toast } from "./ui.js";
import { qrSvg, qrPngDataUrl } from "./qr.js";

export function showQrDialog(text, { title } = {}) {
  let svg;
  try {
    svg = qrSvg(text, { scale: 5 });
  } catch {
    toast(t("qr.tooLong"), { kind: "error" });
    return Promise.resolve(null);
  }
  svg.classList.add("qr-svg");
  const body = h(
    "div",
    { class: "qr-box" },
    h("div", { class: "qr-frame" }, svg),
    h("p", { class: "qr-hint" }, t("qr.hint")),
    h("div", { class: "qr-text", dir: "ltr", title: text }, text),
    h(
      "div",
      { class: "qr-actions" },
      h(
        "button",
        {
          class: "btn btn-sm",
          type: "button",
          onclick: async () => {
            if (await copyText(text)) toast(t("common.copied"));
          },
        },
        icon("copy", 14),
        t("qr.copy"),
      ),
      h(
        "button",
        {
          class: "btn btn-sm",
          type: "button",
          onclick: () => downloadFile("netab-qr.png", dataUrlToBlob(qrPngDataUrl(text)), "image/png"),
        },
        icon("download", 14),
        t("qr.download"),
      ),
    ),
  );
  return dialog({ title: title || t("qr.title"), body, className: "qr-dialog" });
}
