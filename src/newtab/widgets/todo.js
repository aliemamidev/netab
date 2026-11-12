// Tasks widget: quick capture with tiny syntax (!! = starred, @today, @tomorrow),
// filters, due dates, drag to reorder, inline editing.

import { h, clear, uid, todayKey, dayKeyOffset, fill } from "../../lib/utils.js";
import { KEYS, getList, updateList, subscribe } from "../../lib/storage.js";
import { icon } from "../../lib/icons.js";
import { t, lang } from "../../lib/i18n.js";
import { toast, sortable, emptyState, segmented, openMenu } from "../../lib/ui.js";
import { formatDate } from "../../lib/dates.js";

function parseQuick(text) {
  let clean = String(text || "").trim();
  let star = false;
  let due = null;
  if (/(^|\s)!!(\s|$)/.test(clean) || /(^|\s)!(\s|$)/.test(clean)) {
    star = true;
    clean = clean.replace(/(^|\s)!!?(?=\s|$)/g, " ");
  }
  const dueMatch = /(^|\s)@(today|tomorrow|امروز|فردا|\d{4}-\d{2}-\d{2})(?=\s|$)/i.exec(clean);
  if (dueMatch) {
    const v = dueMatch[2].toLowerCase();
    due = v === "today" || v === "امروز" ? todayKey() : v === "tomorrow" || v === "فردا" ? dayKeyOffset(1) : v;
    clean = clean.replace(dueMatch[0], " ");
  }
  return { text: clean.replace(/\s+/g, " ").trim(), star, due };
}

export function dueLabel(due) {
  if (!due) return null;
  const today = todayKey();
  if (due === today) return { text: t("todo.today"), cls: "today" };
  if (due === dayKeyOffset(1)) return { text: t("todo.tomorrow"), cls: "soon" };
  if (due < today) return { text: t("todo.overdue"), cls: "overdue" };
  const [y, m, d] = due.split("-").map(Number);
  return { text: formatDate(new Date(y, m - 1, d, 12), lang() === "fa" ? "persian" : "gregory", lang(), { month: "short", day: "numeric" }), cls: "" };
}

export async function addTask(text) {
  const parsed = parseQuick(text);
  if (!parsed.text) return null;
  const task = { id: uid("todo"), text: parsed.text.slice(0, 500), done: false, star: parsed.star, due: parsed.due, createdAt: new Date().toISOString() };
  await updateList(KEYS.todos, (list) => [task, ...list]);
  return task;
}

export default {
  id: "todo",
  icon: "todo",
  size: "md",
  title: () => t("w.todo"),
  desc: () => t("w.todo.desc"),

  mount(body, ctx) {
    let filter = "active";
    let tasks = [];

    const input = h("input", {
      class: "input todo-input",
      type: "text",
      placeholder: t("todo.placeholder"),
      maxlength: 500,
      onkeydown: async (e) => {
        if (e.key !== "Enter" || !input.value.trim()) return;
        e.preventDefault();
        await addTask(input.value);
        input.value = "";
        if (filter === "done") {
          filter = "active";
          seg.setValue("active");
        }
      },
    });
    const addBtn = h(
      "button",
      {
        class: "icon-btn sm",
        type: "button",
        title: t("todo.add"),
        onclick: async () => {
          if (!input.value.trim()) return input.focus();
          await addTask(input.value);
          input.value = "";
          input.focus();
        },
      },
      icon("plus", 16),
    );
    const seg = segmented(
      [
        { value: "active", label: t("todo.active") },
        { value: "today", label: t("todo.today") },
        { value: "done", label: t("todo.done") },
        { value: "all", label: t("todo.all") },
      ],
      filter,
      (v) => {
        filter = v;
        render();
      },
      { className: "small" },
    );
    const listEl = h("ul", { class: "todo-list" });
    const footer = h("div", { class: "widget-footer" });

    body.append(h("div", { class: "todo-add" }, input, addBtn), seg, listEl, footer);

    ctx.setMenu?.(() => [
      { label: t("todo.clearDone"), icon: "trash", onClick: clearDone },
      { label: t("todo.syntaxHelp"), icon: "info", onClick: () => toast(t("todo.syntax"), { timeout: 7000 }) },
    ]);

    async function clearDone() {
      const removed = tasks.filter((x) => x.done);
      if (!removed.length) return;
      await updateList(KEYS.todos, (list) => list.filter((x) => !x.done));
      toast(t("todo.cleared", { n: removed.length }), {
        action: () => updateList(KEYS.todos, (list) => [...list, ...removed]),
      });
    }

    function visible() {
      const today = todayKey();
      return tasks
        .map((task, index) => ({ task, index }))
        .filter(({ task }) => {
          if (filter === "active") return !task.done;
          if (filter === "done") return task.done;
          if (filter === "today") return !task.done && task.due && task.due <= today;
          return true;
        });
    }

    function row({ task, index }) {
      const due = dueLabel(task.due);
      const text = h("span", { class: "todo-text", title: t("todo.editHint") }, task.text);
      text.addEventListener("dblclick", () => editInline(text, task));
      const li = h(
        "li",
        { class: `todo-item ${task.done ? "done" : ""} ${task.star ? "starred" : ""}`, draggable: "true", dataset: { index: String(index) } },
        h("input", {
          type: "checkbox",
          checked: task.done,
          "aria-label": task.text,
          onchange: (e) => setTask(task.id, { done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : null }),
        }),
        text,
        due ? h("span", { class: `due ${due.cls}` }, due.text) : null,
        h(
          "span",
          { class: "todo-actions" },
          h(
            "button",
            { class: `icon-btn sm star ${task.star ? "on" : ""}`, type: "button", title: t("todo.star"), onclick: () => setTask(task.id, { star: !task.star }) },
            icon("star", 15),
          ),
          h(
            "button",
            {
              class: "icon-btn sm",
              type: "button",
              title: t("common.more"),
              onclick: (e) =>
                openMenu(e.currentTarget, [
                  { label: t("common.edit"), icon: "edit", onClick: () => editInline(text, task) },
                  { label: t("todo.dueToday"), icon: "calendar", onClick: () => setTask(task.id, { due: todayKey() }) },
                  { label: t("todo.dueTomorrow"), icon: "calendar", onClick: () => setTask(task.id, { due: dayKeyOffset(1) }) },
                  { label: t("todo.pickDate"), icon: "calendar", onClick: () => pickDate(task) },
                  task.due ? { label: t("todo.clearDue"), icon: "x", onClick: () => setTask(task.id, { due: null }) } : null,
                  "separator",
                  { label: t("common.delete"), icon: "trash", danger: true, onClick: () => removeTask(task) },
                ].filter(Boolean)),
            },
            icon("more", 15),
          ),
        ),
      );
      return li;
    }

    function pickDate(task) {
      const picker = h("input", { type: "date", class: "sr-only", value: task.due || todayKey() });
      body.appendChild(picker);
      picker.addEventListener("change", () => {
        if (picker.value) setTask(task.id, { due: picker.value });
        picker.remove();
      });
      picker.addEventListener("blur", () => setTimeout(() => picker.remove(), 300));
      try {
        picker.showPicker();
      } catch {
        picker.click();
      }
    }

    function editInline(textEl, task) {
      const editor = h("input", { class: "input todo-edit", type: "text", value: task.text, maxlength: 500 });
      textEl.replaceWith(editor);
      editor.focus();
      editor.select();
      const commit = async (save) => {
        editor.onblur = null;
        if (save && editor.value.trim() && editor.value.trim() !== task.text) await setTask(task.id, { text: editor.value.trim() });
        else render();
      };
      editor.onkeydown = (e) => {
        if (e.key === "Enter") commit(true);
        if (e.key === "Escape") {
          e.stopPropagation();
          commit(false);
        }
      };
      editor.onblur = () => commit(true);
    }

    async function setTask(id, patch) {
      await updateList(KEYS.todos, (list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    }

    async function removeTask(task) {
      const index = tasks.findIndex((x) => x.id === task.id);
      await updateList(KEYS.todos, (list) => list.filter((x) => x.id !== task.id));
      toast(t("todo.deleted"), {
        action: () =>
          updateList(KEYS.todos, (list) => {
            const copy = [...list];
            copy.splice(Math.max(0, index), 0, task);
            return copy;
          }),
      });
    }

    function render() {
      clear(listEl);
      const items = visible();
      // Starred first among active items, stable otherwise.
      if (filter !== "all") items.sort((a, b) => Number(b.task.star) - Number(a.task.star) || a.index - b.index);
      if (!items.length) {
        listEl.appendChild(h("li", {}, emptyState("check", filter === "done" ? t("todo.noneDone") : t("todo.empty"))));
      } else {
        for (const item of items) listEl.appendChild(row(item));
      }
      const open = tasks.filter((x) => !x.done).length;
      const done = tasks.length - open;
      fill(footer, 
        h("span", {}, t("todo.remaining", { n: open })),
        done ? h("button", { class: "link-btn", type: "button", onclick: clearDone }, t("todo.clearDoneN", { n: done })) : null,
      );
      ctx.setBadge?.(open || "");
    }

    sortable(listEl, ".todo-item", (from, to) =>
      updateList(KEYS.todos, (list) => {
        const copy = [...list];
        const [moved] = copy.splice(from, 1);
        copy.splice(to, 0, moved);
        return copy;
      }),
    );

    const unsub = subscribe(KEYS.todos, (value) => {
      tasks = Array.isArray(value) ? value : [];
      render();
    });
    getList(KEYS.todos).then((list) => {
      tasks = list;
      render();
    });

    return {
      focus: () => input.focus(),
      destroy: unsub,
    };
  },
};
