// Notes widget: multiple notes, autosave, pin, search, export to Markdown.

import { h, clear, uid, debounce, downloadFile, copyText } from "../../lib/utils.js";
import { KEYS, getList, updateList, subscribe } from "../../lib/storage.js";
import { icon } from "../../lib/icons.js";
import { t, lang } from "../../lib/i18n.js";
import { toast, emptyState } from "../../lib/ui.js";
import { relativeTime } from "../../lib/dates.js";

const ACTIVE_KEY = "netab.notes.active";

function titleOf(note) {
  if (note.title?.trim()) return note.title.trim();
  const first = String(note.body || "").split("\n").find((l) => l.trim());
  return first ? first.replace(/^[#>\-*\s]+/, "").slice(0, 60) : t("notes.untitled");
}

export async function createNote(body = "") {
  const now = new Date().toISOString();
  const note = { id: uid("note"), title: "", body, createdAt: now, updatedAt: now, pinned: false };
  await updateList(KEYS.notes, (list) => [note, ...list]);
  try {
    localStorage.setItem(ACTIVE_KEY, note.id);
  } catch {
    /* ignore */
  }
  return note;
}

export default {
  id: "notes",
  icon: "note",
  size: "md",
  title: () => t("w.notes"),
  desc: () => t("w.notes.desc"),

  mount(body, ctx) {
    let notes = [];
    let activeId = null;
    let query = "";
    try {
      activeId = localStorage.getItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }

    const chips = h("div", { class: "note-chips" });
    const titleInput = h("input", { class: "note-title", type: "text", dir: "auto", placeholder: t("notes.titlePlaceholder"), maxlength: 120 });
    const area = h("textarea", { class: "note-area", dir: "auto", placeholder: t("notes.placeholder"), spellcheck: "true" });
    const status = h("span", { class: "note-status" });
    const footer = h("div", { class: "widget-footer" }, status);
    const editor = h("div", { class: "note-editor" }, titleInput, area, footer);
    const emptyBox = h("div", { class: "hidden" });
    body.append(chips, editor, emptyBox);

    const search = h("input", {
      class: "input note-search hidden",
      type: "search",
      placeholder: t("notes.search"),
      oninput: () => {
        query = search.value.trim().toLowerCase();
        renderChips();
      },
    });
    body.insertBefore(search, chips);

    ctx.setActions?.([
      h(
        "button",
        {
          class: "icon-btn sm",
          type: "button",
          title: t("notes.search"),
          onclick: () => {
            search.classList.toggle("hidden");
            if (!search.classList.contains("hidden")) search.focus();
            else {
              search.value = "";
              query = "";
              renderChips();
            }
          },
        },
        icon("search", 16),
      ),
      h("button", { class: "icon-btn sm", type: "button", title: t("notes.new"), onclick: () => newNote() }, icon("plus", 16)),
    ]);
    ctx.setMenu?.(() => menuItems());

    function active() {
      return notes.find((n) => n.id === activeId) || null;
    }

    function setActive(id) {
      activeId = id;
      try {
        localStorage.setItem(ACTIVE_KEY, id || "");
      } catch {
        /* ignore */
      }
      renderChips();
      renderEditor();
    }

    async function newNote() {
      await saveNow();
      const note = await createNote();
      activeId = note.id;
      notes = [note, ...notes];
      renderChips();
      renderEditor();
      area.focus();
    }

    function menuItems() {
      const note = active();
      return [
        { label: note?.pinned ? t("notes.unpin") : t("notes.pin"), icon: "pin", disabled: !note, onClick: () => patch(note.id, { pinned: !note.pinned }) },
        { label: t("notes.copy"), icon: "copy", disabled: !note, onClick: async () => (await copyText(note.body)) && toast(t("common.copied")) },
        { label: t("notes.exportOne"), icon: "download", disabled: !note, onClick: () => downloadFile(`${titleOf(note).replace(/[\\/:*?"<>|]/g, "_")}.md`, note.body, "text/markdown") },
        { label: t("notes.exportAll"), icon: "download", disabled: !notes.length, onClick: exportAll },
        "separator",
        { label: t("common.delete"), icon: "trash", danger: true, disabled: !note, onClick: () => remove(note) },
      ];
    }

    function exportAll() {
      const md = notes.map((n) => `# ${titleOf(n)}\n\n${n.body || ""}`).join("\n\n---\n\n");
      downloadFile(`netab-notes-${new Date().toISOString().slice(0, 10)}.md`, md, "text/markdown");
    }

    async function remove(note) {
      const index = notes.findIndex((n) => n.id === note.id);
      await updateList(KEYS.notes, (list) => list.filter((n) => n.id !== note.id));
      const next = notes.filter((n) => n.id !== note.id)[Math.max(0, index - 1)];
      setActive(next?.id || null);
      toast(t("notes.deleted"), {
        action: () => {
          updateList(KEYS.notes, (list) => {
            const copy = [...list];
            copy.splice(index, 0, note);
            return copy;
          });
          setActive(note.id);
        },
      });
    }

    async function patch(id, values) {
      await updateList(KEYS.notes, (list) => list.map((n) => (n.id === id ? { ...n, ...values } : n)));
    }

    let dirty = false;
    const saveSoon = debounce(async () => {
      const note = active();
      if (!note || !dirty) return;
      dirty = false;
      const values = { title: titleInput.value, body: area.value, updatedAt: new Date().toISOString() };
      Object.assign(note, values);
      await patch(note.id, values);
      status.textContent = t("notes.saved");
    }, 450);
    const saveNow = () => saveSoon.flush();

    const onEdit = () => {
      dirty = true;
      status.textContent = t("notes.saving");
      saveSoon();
      updateCount();
    };
    area.addEventListener("input", onEdit);
    titleInput.addEventListener("input", () => {
      onEdit();
      const chip = chips.querySelector(`[data-id="${CSS.escape(activeId || "")}"] span`);
      if (chip) chip.textContent = titleInput.value || titleOf({ body: area.value });
    });
    area.addEventListener("keydown", (e) => {
      // Tab inserts two spaces; Ctrl/Cmd+S saves immediately.
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        area.setRangeText("  ", area.selectionStart, area.selectionEnd, "end");
        onEdit();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      }
      // Continue Markdown lists / checkboxes on Enter.
      if (e.key === "Enter" && !e.shiftKey) {
        const start = area.value.lastIndexOf("\n", area.selectionStart - 1) + 1;
        const line = area.value.slice(start, area.selectionStart);
        const m = /^(\s*)([-*]|\d+\.|- \[[ x]\])\s+/.exec(line);
        if (m) {
          e.preventDefault();
          if (line.trim() === m[0].trim()) {
            area.setRangeText("", start, area.selectionStart, "end");
          } else {
            let bullet = m[2];
            if (/^\d+\.$/.test(bullet)) bullet = `${Number(bullet.slice(0, -1)) + 1}.`;
            if (bullet.startsWith("- [")) bullet = "- [ ]";
            area.setRangeText(`\n${m[1]}${bullet} `, area.selectionStart, area.selectionEnd, "end");
          }
          onEdit();
        }
      }
    });
    area.addEventListener("blur", saveNow);
    titleInput.addEventListener("blur", saveNow);

    function updateCount() {
      const words = area.value.trim() ? area.value.trim().split(/\s+/).length : 0;
      footer.querySelector(".note-count")?.remove();
      footer.prepend(h("span", { class: "note-count" }, t("notes.words", { n: words })));
    }

    function sorted() {
      return [...notes].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    function renderChips() {
      clear(chips);
      const list = sorted().filter((n) => !query || `${n.title} ${n.body}`.toLowerCase().includes(query));
      for (const n of list) {
        chips.appendChild(
          h(
            "button",
            { class: `note-chip ${n.id === activeId ? "active" : ""}`, type: "button", dataset: { id: n.id }, onclick: () => (saveNow(), setActive(n.id)) },
            n.pinned ? icon("pin", 12) : null,
            h("span", {}, titleOf(n)),
          ),
        );
      }
    }

    function renderEditor() {
      const note = active();
      const has = Boolean(note);
      editor.classList.toggle("hidden", !has);
      emptyBox.classList.toggle("hidden", has);
      if (!has) {
        clear(emptyBox).appendChild(emptyState("note", t("notes.empty"), { label: t("notes.new"), onClick: newNote }));
        return;
      }
      if (document.activeElement !== area) area.value = note.body || "";
      if (document.activeElement !== titleInput) titleInput.value = note.title || "";
      status.textContent = note.updatedAt ? t("notes.edited", { when: relativeTime(note.updatedAt, lang()) }) : "";
      updateCount();
    }

    const unsub = subscribe(KEYS.notes, (value) => {
      notes = Array.isArray(value) ? value : [];
      if (!active() && notes.length) activeId = sorted()[0].id;
      renderChips();
      if (!dirty) renderEditor();
    });

    getList(KEYS.notes).then((list) => {
      notes = list;
      if (!active() && notes.length) activeId = sorted()[0].id;
      renderChips();
      renderEditor();
    });

    return {
      focus: () => area.focus(),
      newNote,
      openNote: (id) => setActive(id),
      destroy: () => {
        saveNow();
        unsub();
      },
    };
  },
};

export { titleOf as noteTitle };
