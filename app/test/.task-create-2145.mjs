// src/components/CollectionFilter.jsx
import React, { useId } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ListFilter, X } from "lucide-react";
function CollectionFilter({ label, value, onChange, placeholder = "Filter by name\u2026" }) {
  const inputId = useId();
  return /* @__PURE__ */ React.createElement(Popover.Root, null, /* @__PURE__ */ React.createElement(Popover.Trigger, { asChild: true }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "collection-filter-trigger", "aria-label": label, "data-active": !!value }, /* @__PURE__ */ React.createElement(ListFilter, { size: 16, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, "Filter"), value && /* @__PURE__ */ React.createElement("span", { className: "collection-filter-dot", "aria-label": "Active filter" }))), /* @__PURE__ */ React.createElement(Popover.Portal, null, /* @__PURE__ */ React.createElement(Popover.Content, { className: "collection-filter-popover", align: "end", sideOffset: 8, collisionPadding: 16 }, /* @__PURE__ */ React.createElement("div", { className: "collection-filter-heading" }, /* @__PURE__ */ React.createElement("label", { htmlFor: inputId }, label), /* @__PURE__ */ React.createElement(Popover.Close, { asChild: true }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Close filter" }, /* @__PURE__ */ React.createElement(X, { size: 15 })))), /* @__PURE__ */ React.createElement("input", { id: inputId, autoFocus: true, value, onChange: (event) => onChange(event.target.value), placeholder }), /* @__PURE__ */ React.createElement("div", { className: "collection-filter-foot" }, /* @__PURE__ */ React.createElement("span", null, "Filters this view"), value && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onChange("") }, "Clear")))));
}

// src/lib/dates.js
var dayDate = (value) => {
  if (!value) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00" : value);
  return isNaN(d) ? null : d;
};
var shortDay = (value, fallback = "") => {
  const d = value instanceof Date ? value : dayDate(value);
  if (!d || isNaN(d)) return fallback;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...d.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? {} : { year: "numeric" } });
};

// src/components/workspace/WorkspaceUI.jsx
import React2, { forwardRef, useEffect, useId as useId2, useRef } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover2 from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Switch from "@radix-ui/react-switch";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Avatar from "@radix-ui/react-avatar";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Search, X as X2, LoaderCircle, Check, Minus, ChevronDown, ChevronUp } from "lucide-react";
var cx = (...values) => values.filter(Boolean).join(" ");
function WorkspaceTooltip({ label, children, side = "top", disabled = false }) {
  return /* @__PURE__ */ React2.createElement(Tooltip.Root, null, /* @__PURE__ */ React2.createElement(Tooltip.Trigger, { asChild: true }, children), !disabled && /* @__PURE__ */ React2.createElement(Tooltip.Portal, null, /* @__PURE__ */ React2.createElement(Tooltip.Content, { className: "ws-tooltip", side, sideOffset: 7, collisionPadding: 12 }, label)));
}
var WorkspaceButton = forwardRef(function WorkspaceButton2({ variant = "primary", size = "normal", iconOnly = false, loading = false, tooltip, className, children, type = "button", disabled, ...props }, ref) {
  const button = /* @__PURE__ */ React2.createElement("button", { ref, type, disabled: disabled || loading, className: cx("ws-button", `ws-button--${variant}`, size === "small" && "ws-button--small", iconOnly && "ws-button--icon", className), "aria-busy": loading || void 0, ...props }, loading && /* @__PURE__ */ React2.createElement(LoaderCircle, { className: "ws-spinner", size: 16 }), " ", children);
  return tooltip ? /* @__PURE__ */ React2.createElement(WorkspaceTooltip, { label: tooltip }, button) : button;
});
function WorkspaceFilters({ items, value, onChange, label = "Filter", className }) {
  return /* @__PURE__ */ React2.createElement(ToggleGroup.Root, { type: "single", className: cx("ws-filters", className), "aria-label": label, value, onValueChange: (next) => {
    if (next) onChange(next);
  } }, items.map((item) => {
    const option = typeof item === "string" ? { value: item, label: item } : item;
    return /* @__PURE__ */ React2.createElement(ToggleGroup.Item, { type: "button", key: option.value, value: option.value }, option.label, option.count !== void 0 && /* @__PURE__ */ React2.createElement("span", null, option.count));
  }));
}
var WorkspaceSelect = forwardRef(function WorkspaceSelect2({ options, value, defaultValue, onValueChange, name, required, disabled, placeholder, label, className, id, ...props }, ref) {
  const items = options.map((item) => typeof item === "string" ? { value: item, label: item } : item);
  return /* @__PURE__ */ React2.createElement(Select.Root, { value, defaultValue: defaultValue ?? (placeholder ? void 0 : items[0]?.value), onValueChange, name, required, disabled }, /* @__PURE__ */ React2.createElement(Select.Trigger, { ref, id, className: cx("ws-select", className), "aria-label": label, ...props }, /* @__PURE__ */ React2.createElement(Select.Value, { "data-ws-select-value": "", placeholder }), /* @__PURE__ */ React2.createElement(Select.Icon, { className: "ws-select-icon" }, /* @__PURE__ */ React2.createElement(ChevronDown, { size: 15, "aria-hidden": "true" }))), /* @__PURE__ */ React2.createElement(Select.Portal, null, /* @__PURE__ */ React2.createElement(Select.Content, { className: "ws-select-content", position: "popper", align: "start", sideOffset: 6, collisionPadding: 12, avoidCollisions: true }, /* @__PURE__ */ React2.createElement(Select.ScrollUpButton, { className: "ws-select-scroll" }, /* @__PURE__ */ React2.createElement(ChevronUp, { size: 14 })), /* @__PURE__ */ React2.createElement(Select.Viewport, null, items.map((item) => /* @__PURE__ */ React2.createElement(Select.Item, { key: item.value, value: item.value, disabled: item.disabled, className: "ws-select-item" }, /* @__PURE__ */ React2.createElement(Select.ItemText, { "data-ws-select-label": "" }, item.label), /* @__PURE__ */ React2.createElement(Select.ItemIndicator, { className: "ws-select-check" }, /* @__PURE__ */ React2.createElement(Check, { size: 14 }))))), /* @__PURE__ */ React2.createElement(Select.ScrollDownButton, { className: "ws-select-scroll" }, /* @__PURE__ */ React2.createElement(ChevronDown, { size: 14 })))));
});
function WorkspaceCheckbox({ label, checked, defaultChecked, onCheckedChange, className, ...props }) {
  const control = /* @__PURE__ */ React2.createElement(Checkbox.Root, { type: "button", checked, defaultChecked, onCheckedChange, className: "ws-checkbox", ...props }, /* @__PURE__ */ React2.createElement(Checkbox.Indicator, null, checked === "indeterminate" ? /* @__PURE__ */ React2.createElement(Minus, { size: 12 }) : /* @__PURE__ */ React2.createElement(Check, { size: 12 })));
  return label ? /* @__PURE__ */ React2.createElement("label", { className: cx("ws-choice-label", className) }, control, /* @__PURE__ */ React2.createElement("span", null, label)) : control;
}
function WorkspaceConfirm({ open, onOpenChange, title, description, confirmLabel = "Remove", onConfirm, returnFocusRef }) {
  const previous = useRef(null);
  return /* @__PURE__ */ React2.createElement(AlertDialog.Root, { open, onOpenChange }, /* @__PURE__ */ React2.createElement(AlertDialog.Portal, null, /* @__PURE__ */ React2.createElement(AlertDialog.Overlay, { className: "ws-dialog-scrim ws-confirm-scrim" }), /* @__PURE__ */ React2.createElement(AlertDialog.Content, { className: "ws-dialog ws-confirm", onOpenAutoFocus: () => {
    previous.current = document.activeElement;
  }, onCloseAutoFocus: (event) => {
    event.preventDefault();
    const target = returnFocusRef?.current || previous.current;
    if (target?.isConnected) target.focus();
  } }, /* @__PURE__ */ React2.createElement(AlertDialog.Title, null, title), /* @__PURE__ */ React2.createElement(AlertDialog.Description, null, description), /* @__PURE__ */ React2.createElement("div", { className: "ws-confirm-actions" }, /* @__PURE__ */ React2.createElement(AlertDialog.Cancel, { asChild: true }, /* @__PURE__ */ React2.createElement(WorkspaceButton, { variant: "secondary" }, "Cancel")), /* @__PURE__ */ React2.createElement(AlertDialog.Action, { asChild: true }, /* @__PURE__ */ React2.createElement(WorkspaceButton, { variant: "danger", onClick: onConfirm }, confirmLabel))))));
}

// src/components/TaskWorkspace.jsx
import React6, { useEffect as useEffect4, useMemo, useRef as useRef2, useState as useState4 } from "react";
import * as Dialog2 from "@radix-ui/react-dialog";
import { Plus as Plus2, X as X4, Check as Check3, UserRound } from "lucide-react";

// src/components/StudioViews.jsx
import React4, { useState as useState2 } from "react";
import { Check as Check2, Clock3, FileText, FolderClosed, LayoutGrid, List as List2, Columns3, MessageSquare } from "lucide-react";

// src/lib/workflows.js
var WORKFLOWS = {
  "event-styling": { name: "Events and experiences", project: "event", date: "Event date", place: "Venue / setting", intro: "A shared place for the brief, creative direction and every detail of the setting.", plan: "From first ideas to the final installation, follow the steps your studio has shared.", decision: "Choose the direction that feels right for your event.", guide: ["Brief & references", "Creative direction", "Production & installation"], choiceFacts: ["Installation size", "Setting"] },
  "event-planning": { name: "Event planning", project: "event", date: "Event date", place: "Venue / area", intro: "The people, schedule and decisions behind your gathering, all in one place.", plan: "Follow your event from the first brief through coordination and the day itself.", decision: "Make the choices that shape your event.", guide: ["Event brief", "Suppliers & schedule", "Final coordination"], choiceFacts: ["Location", "Guest capacity"] },
  "wedding-planning": { name: "Weddings", project: "wedding", date: "Wedding date", place: "Venue / area", intro: "The people, plans and decisions for your celebration, brought together.", plan: "Your planning steps, from the first conversation through to the day itself.", decision: "Make the choices that shape your celebration.", guide: ["Planning brief", "Key choices", "Final coordination"], choiceFacts: ["Setting", "Guest capacity"] },
  "floral-design": { name: "Floral design", project: "floral project", date: "Delivery / event date", place: "Delivery / installation", intro: "A home for your floral brief, references and the details of the arrangement.", plan: "See what is taking shape, what needs your input and what your florist is preparing.", decision: "Choose the floral direction that feels like yours.", guide: ["Floral brief", "Stem & arrangement direction", "Preparation & delivery"], choiceFacts: ["Season", "Scale"] },
  "balloon-styling": { name: "Balloon styling", project: "installation", date: "Installation / event date", place: "Installation venue", intro: "The installation brief, visual direction and practical details in one shared place.", plan: "Follow the installation from site details through design, preparation and setup.", decision: "Choose the installation direction that feels right for your event.", guide: ["Site & dimensions", "Design direction", "Preparation & installation"], choiceFacts: ["Size", "Setup"] },
  "interior-design": { name: "Interiors and spaces", project: "space", date: "Target date", place: "Property / room", intro: "A clear record of the spaces, ideas and choices behind your project.", plan: "Follow your space from discovery through design and delivery.", decision: "Choose the direction that belongs in your space.", guide: ["Space & requirements", "Design direction", "Sourcing & installation"], choiceFacts: ["Material", "Lead time"] },
  "creative-studio": { name: "Brand and design", project: "creative project", date: "Launch / delivery date", place: "Brand / location", intro: "The brief, references and feedback for your creative work in one place.", plan: "Follow the work from discovery through concept and delivery.", decision: "Choose the direction that fits your brief.", guide: ["Discovery & brief", "Concept & feedback", "Production & delivery"], choiceFacts: ["Deliverables", "Format"] },
  "bespoke-making": { name: "Made to order", project: "commission", date: "Delivery date", place: "Delivery / collection", intro: "A calm place to shape your commission and keep every detail in view.", plan: "See the work move from specification through making and handover.", decision: "Choose the details that make this piece yours.", guide: ["Specification", "Design & materials", "Making & handover"], choiceFacts: ["Material", "Lead time"] },
  "photo-film": { name: "Photography and film", project: "shoot", date: "Shoot date", place: "Location", intro: "The brief, references and selections for your shoot in one place.", plan: "Follow the work from planning through the shoot to final delivery.", decision: "Choose the images and direction that feel right.", guide: ["Brief & shot list", "Shoot", "Selection & delivery"], choiceFacts: ["Format", "Usage"] },
  "general": { name: "Other creative work", project: "project", date: "Key date", place: "Location", intro: "The brief, references and decisions for your project in one place.", plan: "Follow the work from the first brief through to delivery.", decision: "Choose the direction that feels right.", guide: ["Brief & references", "Direction & feedback", "Making & delivery"], choiceFacts: ["Format", "Timing"] }
};
var DEFAULT_WORKFLOW = "event-styling";
var DEMO_COVERS = {
  "event-styling": "/assets/candlelit-table.webp",
  "event-planning": "/assets/hospitality-studio.webp",
  "wedding-planning": "/assets/blush-celebration.webp",
  "floral-design": "/assets/sage-blush-florals.webp",
  "interior-design": "/assets/interiors-studio.webp",
  "creative-studio": "/assets/campaign-set.webp"
};
var demoCoverFor = (project) => project?.demo ? DEMO_COVERS[project.brief?.workflowType || DEFAULT_WORKFLOW] || null : null;
var GROUPS = ["event-styling", "wedding-planning", "interior-design", "creative-studio", "photo-film", "bespoke-making", "general"];
var workflowOptions = GROUPS.map((id) => ({ id, label: WORKFLOWS[id].name }));

// src/lib/studio-view.js
var fileURL = (p, studio, id) => `/api/projects/${p.id}/files/${id}?studio=${studio.id}`;
function mediaFor(p, studio, item) {
  if (!item) return "";
  if (item.fileId) {
    const file = item.assets?.find((asset) => asset.fileId === item.fileId) || p.inspiration?.find((ref) => ref.fileId === item.fileId);
    if ((item.mime || file?.mime)?.startsWith("image/")) return fileURL(p, studio, item.fileId);
  }
  return item.sample || "";
}
function projectCover(p, studio) {
  return mediaFor(p, studio, p.designs?.at(-1)) || [...p.inspiration || []].reverse().map((item) => mediaFor(p, studio, item)).find(Boolean) || demoCoverFor(p) || "";
}

// src/components/CustomFields.jsx
import React3, { useEffect as useEffect2, useId as useId3, useState } from "react";
import { ArrowDown, ArrowUp, LockKeyhole, Plus, Trash2, X as X3 } from "lucide-react";

// src/components/StudioViews.jsx
function ProjectImage({ p, studio, item, className = "", compact = false }) {
  const src = item ? mediaFor(p, studio, item) : projectCover(p, studio);
  if (src) return /* @__PURE__ */ React4.createElement("img", { className, src, alt: "", loading: "lazy" });
  return /* @__PURE__ */ React4.createElement("span", { className: "studio-image-placeholder " + className, "data-compact": compact || void 0, "aria-hidden": compact || void 0 }, /* @__PURE__ */ React4.createElement("span", { className: "studio-image-placeholder-content" }, /* @__PURE__ */ React4.createElement(FolderClosed, { size: 28, strokeWidth: 1, "aria-hidden": "true" }), !compact && /* @__PURE__ */ React4.createElement("span", { className: "studio-image-placeholder-label" }, p.brief?.occasion || "Project")));
}

// src/components/TaskCollaboration.jsx
import React5, { useEffect as useEffect3, useState as useState3 } from "react";
import { Paperclip, MessageSquare as MessageSquare2 } from "lucide-react";
function TaskCollaboration({ task, studio, request, onAssignment }) {
  const [data, setData] = useState3(null), [error, setError] = useState3(""), [loadError, setLoadError] = useState3(""), [attempt, setAttempt] = useState3(0), [busy, setBusy] = useState3(false), [comment, setComment] = useState3("");
  const endpoint = `/api/task-workspace/${task.kind}/${task.id}?studio=${studio.id}${task.project ? "&project=" + task.project.id : ""}`;
  useEffect3(() => {
    setComment("");
  }, [endpoint]);
  useEffect3(() => {
    let live = true;
    setData(null);
    setError("");
    setLoadError("");
    request(endpoint).then((d) => {
      if (live) {
        setData(d);
        onAssignment?.(task.key, d.assigneeName);
      }
    }).catch((e) => {
      if (live) setLoadError(e.message || "Something went wrong.");
    });
    return () => {
      live = false;
    };
  }, [endpoint, attempt]);
  async function act(body) {
    setBusy(true);
    setError("");
    try {
      const next = await request(endpoint, "POST", body);
      setData(next);
      onAssignment?.(task.key, next.assigneeName);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function attach(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 6e6) {
      setError("Choose a file smaller than 6 MB.");
      return;
    }
    setBusy(true);
    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read this file."));
        reader.readAsDataURL(file);
      });
      await act({ action: "file", name: file.name, content });
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ React5.createElement("section", { className: "task-collaboration" }, /* @__PURE__ */ React5.createElement("h3", null, /* @__PURE__ */ React5.createElement(MessageSquare2, { size: 16 }), "Task discussion"), error && /* @__PURE__ */ React5.createElement("p", { className: "task-error", role: "alert" }, error), !data ? loadError ? /* @__PURE__ */ React5.createElement("div", { className: "task-error", role: "alert" }, /* @__PURE__ */ React5.createElement("p", null, "Task details could not be loaded. ", loadError), /* @__PURE__ */ React5.createElement("button", { type: "button", className: "task-primary", onClick: () => setAttempt((n) => n + 1) }, "Retry")) : /* @__PURE__ */ React5.createElement("p", { role: "status" }, "Loading task details\u2026") : /* @__PURE__ */ React5.createElement(React5.Fragment, null, !data.canAssign && data.assigneeName && task.assignee !== "client" && /* @__PURE__ */ React5.createElement("p", null, "Assigned to ", /* @__PURE__ */ React5.createElement("strong", null, data.assigneeName)), data.canAssign && /* @__PURE__ */ React5.createElement("label", null, "Team member", /* @__PURE__ */ React5.createElement("select", { "aria-label": "Assigned team member", disabled: busy || task.assignee === "client", value: data.assigneeId, onChange: (e) => act({ action: "assign", assigneeId: e.target.value }) }, /* @__PURE__ */ React5.createElement("option", { value: "" }, "Unassigned"), data.assignees.map((p) => /* @__PURE__ */ React5.createElement("option", { key: p.id, value: p.id }, p.name))), task.assignee === "client" && /* @__PURE__ */ React5.createElement("small", null, "This task is the client\u2019s responsibility.")), data.comments.length ? /* @__PURE__ */ React5.createElement("ol", { className: "task-comments" }, data.comments.map((c) => /* @__PURE__ */ React5.createElement("li", { key: c.id }, /* @__PURE__ */ React5.createElement("header", null, /* @__PURE__ */ React5.createElement("strong", null, c.by), /* @__PURE__ */ React5.createElement("time", null, shortDay(c.at))), /* @__PURE__ */ React5.createElement("p", null, c.text)))) : /* @__PURE__ */ React5.createElement("p", { className: "task-collaboration-empty" }, "No comments yet. Keep updates for this task here."), data.canContribute && /* @__PURE__ */ React5.createElement("form", { onSubmit: async (e) => {
    e.preventDefault();
    if (await act({ action: "comment", text: comment })) setComment("");
  } }, /* @__PURE__ */ React5.createElement("label", { className: "sr-only", htmlFor: "comment-" + task.id }, "Task comment"), /* @__PURE__ */ React5.createElement("textarea", { id: "comment-" + task.id, rows: 3, maxLength: 4e3, placeholder: "Add an update or question\u2026", value: comment, onChange: (e) => setComment(e.target.value) }), /* @__PURE__ */ React5.createElement("button", { className: "task-primary", disabled: busy || !comment.trim() }, "Add comment")), /* @__PURE__ */ React5.createElement("h3", null, /* @__PURE__ */ React5.createElement(Paperclip, { size: 16 }), "Files"), data.files.length ? /* @__PURE__ */ React5.createElement("ul", { className: "task-files" }, data.files.map((f) => /* @__PURE__ */ React5.createElement("li", { key: f.id }, /* @__PURE__ */ React5.createElement("a", { href: endpoint.replace("?", `/files/${f.id}?`), download: true }, f.name), /* @__PURE__ */ React5.createElement("small", null, Math.max(1, Math.round(f.size / 1024)), " KB \xB7 ", f.by)))) : /* @__PURE__ */ React5.createElement("p", { className: "task-collaboration-empty" }, "No files attached."), data.canContribute && /* @__PURE__ */ React5.createElement("label", { className: "task-file-upload" }, busy ? "Saving\u2026" : "Attach a file", /* @__PURE__ */ React5.createElement("input", { "aria-label": "Attach a task file", type: "file", accept: "image/png,image/jpeg,image/webp,application/pdf", disabled: busy, onChange: attach }), /* @__PURE__ */ React5.createElement("small", null, "PNG, JPG, WebP or PDF \xB7 up to 6 MB"))));
}

// src/components/TaskWorkspace.jsx
var todayISO2 = () => {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
var date = (v) => v ? shortDay(v) : "No date";
var initials2 = (n) => (n || "Studio").split(" ").map((s) => s[0]).slice(0, 2).join("");
function TaskWorkspace({ studio, projects, request, openProject, openClient, openOpportunity, onProjectUpdate, taskId, navigationKey }) {
  const [assignments, setAssignments] = useState4({});
  const [crm, setCRM] = useState4([]), [clients, setClients] = useState4([]), [opportunities, setOpportunities] = useState4([]), [filter, setFilter] = useState4("All tasks"), [grouping, setGrouping] = useState4("project"), [search, setSearch] = useState4(""), [selected, setSelected] = useState4(taskId ? taskId.includes(":") ? taskId : "crm:" + taskId : null), [creating, setCreating] = useState4(false), [destination, setDestination] = useState4(""), [error, setError] = useState4(""), [loading, setLoading] = useState4(true), [busy, setBusy] = useState4(false), [dirty, setDirty] = useState4(false), [deleting, setDeleting] = useState4(false);
  const detailRef = useRef2(null);
  const lastTrigger = useRef2(null);
  const q = "?studio=" + studio.id;
  useEffect4(() => {
    let live = true;
    setLoading(true);
    Promise.all([request("/api/crm/tasks" + q), request("/api/clients" + q), request("/api/opportunities" + q), request("/api/task-workspace" + q)]).then(([t, c, o, a]) => {
      if (live) {
        setAssignments(a.assignments);
        setCRM(t.tasks);
        setClients(c.clients);
        setOpportunities(o.opportunities);
      }
    }).catch((e) => {
      if (live) setError(e.message);
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [studio.id]);
  useEffect4(() => {
    if (taskId) {
      setSelected(taskId.includes(":") ? taskId : "crm:" + taskId);
      setFilter("All tasks");
      setSearch("");
    } else setSelected(null);
  }, [taskId, navigationKey]);
  useEffect4(() => {
    const url = new URL(location.href);
    if (selected) url.searchParams.set("task", selected);
    else url.searchParams.delete("task");
    history.replaceState(null, "", url.pathname + url.search);
  }, [selected]);
  const tasks = useMemo(() => [...projects.flatMap((p) => (p.tasks || []).map((t) => ({ ...t, key: "project:" + p.id + ":" + t.id, kind: "project", project: p, dueDate: t.due || "", detail: t.detail || "", status: t.completed ? "Completed" : t.status || "To do", assigneeLabel: t.assignee === "client" ? p.brief.name : studio.name, group: p.title }))), ...crm.map((t) => ({ ...t, key: "crm:" + t.id, kind: "crm", status: t.completed ? "Completed" : "To do", assigneeLabel: studio.name, group: t.clientName + " \xB7 Follow-ups" }))], [projects, crm, studio.name]);
  const chosen = tasks.find((t) => t.key === selected), today = todayISO2();
  const visible = tasks.filter((t) => (filter === "All tasks" || filter === "Studio tasks" && !t.completed && (t.kind === "crm" || t.assignee === "studio") || filter === "Overdue" && !t.completed && t.dueDate && t.dueDate < today || filter === "Completed" && t.completed) && `${t.title} ${t.group} ${t.assignee !== "client" && assignments[t.key] || t.assigneeLabel} ${t.opportunityTitle || ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.title.localeCompare(b.title));
  const groups = Object.entries(visible.reduce((out, t) => {
    const key = grouping === "project" ? t.project ? "project:" + t.project.id : "client:" + t.clientId : !t.dueDate ? "No due date" : t.dueDate < today && !t.completed ? "Overdue" : t.dueDate === today ? "Today" : t.dueDate;
    (out[key] ||= []).push(t);
    return out;
  }, {}));
  function choose(t, e) {
    if (dirty && !window.confirm("Discard unsaved task changes?")) return;
    lastTrigger.current = e?.currentTarget;
    setDirty(false);
    setSelected(t?.key || null);
  }
  function close() {
    if (dirty && !window.confirm("Discard unsaved task changes?")) return;
    setSelected(null);
    setDirty(false);
    lastTrigger.current?.focus();
  }
  useEffect4(() => {
    const escape = (e) => {
      if (e.key === "Escape" && selected && !creating) {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selected, dirty, creating]);
  useEffect4(() => {
    if (!chosen || creating || !matchMedia("(max-width:1350px)").matches) return;
    const panel = detailRef.current;
    if (!panel) return;
    const previous = document.activeElement;
    panel.querySelector("button")?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]")].filter((el) => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [chosen?.key, creating]);
  async function update(t, values) {
    setBusy(true);
    setError("");
    try {
      if (t.kind === "project") {
        const d = await request(`/api/projects/${t.project.id}/tasks${q}`, "POST", { taskId: t.id, ...values });
        onProjectUpdate(d.project);
      } else {
        const d = await request("/api/crm/tasks/" + t.id + q, "PATCH", values);
        setCRM((prev) => prev.map((x) => x.id === t.id ? d.task : x));
      }
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function remove(t) {
    setBusy(true);
    setError("");
    try {
      if (t.kind === "project") {
        const d = await request(`/api/projects/${t.project.id}/tasks${q}`, "POST", { taskId: t.id, remove: true });
        onProjectUpdate(d.project);
      } else {
        await request("/api/crm/tasks/" + t.id + q, "PATCH", { remove: true });
        setCRM((prev) => prev.filter((x) => x.id !== t.id));
      }
      setDirty(false);
      setSelected(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (destination.startsWith("project:")) {
        const id = destination.slice(8);
        const d = await request(`/api/projects/${id}/tasks${q}`, "POST", { title: data.title, detail: data.detail, assignee: data.assignee, due: data.dueDate, status: data.status });
        onProjectUpdate(d.project);
        setSelected("project:" + id + ":" + d.project.tasks.at(-1).id);
      } else {
        const d = await request("/api/crm/tasks" + q, "POST", { clientId: destination.slice(7), title: data.title, detail: data.detail, dueDate: data.dueDate, priority: data.priority || "Normal", opportunityId: data.opportunityId || "" });
        setCRM((prev) => [d.task, ...prev]);
        setSelected("crm:" + d.task.id);
      }
      setFilter("All tasks");
      setSearch("");
      setCreating(false);
      setDirty(false);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ React6.createElement("section", { className: "task-workspace" + (chosen ? " has-detail" : "") }, /* @__PURE__ */ React6.createElement("div", { className: "task-ledger" }, /* @__PURE__ */ React6.createElement("header", { className: "task-heading workspace-page-heading" }, /* @__PURE__ */ React6.createElement("div", null, /* @__PURE__ */ React6.createElement("h1", null, "Tasks"), /* @__PURE__ */ React6.createElement("p", null, "Every next step, connected to the work.")), /* @__PURE__ */ React6.createElement("button", { className: "task-primary", onClick: () => {
    setDestination(projects[0] ? "project:" + projects[0].id : "");
    setCreating(true);
  } }, /* @__PURE__ */ React6.createElement(Plus2, { size: 16 }), "New task")), error && /* @__PURE__ */ React6.createElement("p", { className: "task-error", role: "alert" }, error), /* @__PURE__ */ React6.createElement("div", { className: "task-controls" }, /* @__PURE__ */ React6.createElement(WorkspaceFilters, { className: "task-filters", label: "Task view", items: ["All tasks", "Studio tasks", "Overdue", "Completed"], value: filter, onChange: setFilter }), /* @__PURE__ */ React6.createElement("div", { className: "task-tools" }, /* @__PURE__ */ React6.createElement(CollectionFilter, { label: "Filter tasks", placeholder: "Task or project name\u2026", value: search, onChange: setSearch }), /* @__PURE__ */ React6.createElement(WorkspaceSelect, { label: "Group tasks", value: grouping, onValueChange: setGrouping, options: [{ value: "project", label: "By project" }, { value: "date", label: "By due date" }] }))), /* @__PURE__ */ React6.createElement("div", { className: "task-column-head", "aria-hidden": "true" }, /* @__PURE__ */ React6.createElement("span", null), /* @__PURE__ */ React6.createElement("span", null, "Task"), /* @__PURE__ */ React6.createElement("span", null, "Responsible"), /* @__PURE__ */ React6.createElement("span", null, "Due date"), /* @__PURE__ */ React6.createElement("span", null, "Status")), loading ? /* @__PURE__ */ React6.createElement("p", { className: "task-empty", role: "status" }, "Loading tasks\u2026") : groups.length ? groups.map(([label, items]) => /* @__PURE__ */ React6.createElement("section", { className: "task-group", key: label }, /* @__PURE__ */ React6.createElement("header", null, grouping === "project" && (items[0].project ? /* @__PURE__ */ React6.createElement(ProjectImage, { p: items[0].project, studio, compact: true }) : /* @__PURE__ */ React6.createElement("span", { className: "task-group-icon" }, /* @__PURE__ */ React6.createElement(UserRound, { size: 19 }))), /* @__PURE__ */ React6.createElement("div", null, /* @__PURE__ */ React6.createElement("h2", null, grouping === "project" ? items[0].group : /^\d{4}-/.test(label) ? (/* @__PURE__ */ new Date(label + "T12:00:00")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : label), /* @__PURE__ */ React6.createElement("small", null, items.length, " ", items.length === 1 ? "task" : "tasks", items[0].kind === "crm" && grouping === "project" ? " \xB7 Private to your studio" : ""))), items.map((t) => /* @__PURE__ */ React6.createElement("div", { className: "task-ledger-row" + (chosen?.key === t.key ? " is-selected" : "") + (t.completed ? " is-done" : ""), key: t.key }, /* @__PURE__ */ React6.createElement(WorkspaceCheckbox, { checked: t.completed, disabled: busy, "aria-label": (t.completed ? "Reopen " : "Complete ") + t.title, onCheckedChange: (checked) => update(t, { completed: checked === true }) }), /* @__PURE__ */ React6.createElement("button", { className: "task-row-open", "aria-pressed": chosen?.key === t.key, onClick: (e) => choose(t, e) }, /* @__PURE__ */ React6.createElement("strong", null, t.title), grouping === "date" && /* @__PURE__ */ React6.createElement("small", null, t.group)), /* @__PURE__ */ React6.createElement("span", { className: "task-owner" }, /* @__PURE__ */ React6.createElement("i", null, initials2(t.assignee !== "client" && assignments[t.key] || t.assigneeLabel)), /* @__PURE__ */ React6.createElement("span", null, t.assignee !== "client" && assignments[t.key] || t.assigneeLabel)), /* @__PURE__ */ React6.createElement("time", { className: !t.completed && t.dueDate && t.dueDate < today ? "is-overdue" : "" }, date(t.dueDate)), /* @__PURE__ */ React6.createElement("span", { className: "task-row-status" }, t.status))))) : /* @__PURE__ */ React6.createElement("div", { className: "task-empty" }, /* @__PURE__ */ React6.createElement(Check3, { size: 24 }), /* @__PURE__ */ React6.createElement("h2", null, search ? "No matching tasks" : "Nothing in this view"), /* @__PURE__ */ React6.createElement("p", null, search ? "Try a project name, person or another phrase." : "Create a project task or a private client follow-up to get started."))), chosen && /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("button", { className: "task-detail-scrim", "aria-label": "Close task details", onClick: close }), /* @__PURE__ */ React6.createElement("aside", { ref: detailRef, className: "task-detail", "aria-label": "Task details" }, /* @__PURE__ */ React6.createElement("button", { className: "task-detail-close", "aria-label": "Close task details", onClick: close }, /* @__PURE__ */ React6.createElement(X4, { size: 19 })), /* @__PURE__ */ React6.createElement("p", { className: "task-kicker" }, chosen.kind === "project" ? "PROJECT TASK" : "PRIVATE FOLLOW-UP"), /* @__PURE__ */ React6.createElement("h2", null, chosen.title), chosen.project ? /* @__PURE__ */ React6.createElement("button", { className: "task-context", onClick: () => openProject(chosen.project, "Plan") }, /* @__PURE__ */ React6.createElement(ProjectImage, { p: chosen.project, studio, compact: true }), /* @__PURE__ */ React6.createElement("span", null, /* @__PURE__ */ React6.createElement("small", null, "In project"), chosen.project.title)) : /* @__PURE__ */ React6.createElement("button", { className: "task-context", onClick: () => openClient(chosen.clientId) }, /* @__PURE__ */ React6.createElement(UserRound, { size: 20 }), /* @__PURE__ */ React6.createElement("span", null, /* @__PURE__ */ React6.createElement("small", null, "Client"), chosen.clientName)), chosen.opportunityId && /* @__PURE__ */ React6.createElement("button", { className: "task-context", onClick: () => openOpportunity(chosen.opportunityId) }, /* @__PURE__ */ React6.createElement("span", null, /* @__PURE__ */ React6.createElement("small", null, "Opportunity"), chosen.opportunityTitle)), /* @__PURE__ */ React6.createElement("form", { key: chosen.key + chosen.status + chosen.title + chosen.dueDate, onChange: () => setDirty(true), onSubmit: async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (chosen.kind === "project") {
      values.due = values.dueDate;
      delete values.dueDate;
      values.completed = values.status === "Completed";
    } else {
      values.completed = values.status === "Completed";
      delete values.status;
    }
    if (await update(chosen, values)) setDirty(false);
  } }, /* @__PURE__ */ React6.createElement("label", null, "Task", /* @__PURE__ */ React6.createElement("input", { name: "title", defaultValue: chosen.title, required: true, maxLength: 200 })), /* @__PURE__ */ React6.createElement("div", { className: "task-detail-fields" }, /* @__PURE__ */ React6.createElement("label", null, "Status", /* @__PURE__ */ React6.createElement("select", { name: "status", defaultValue: chosen.status }, /* @__PURE__ */ React6.createElement("option", null, "To do"), chosen.kind === "project" && /* @__PURE__ */ React6.createElement("option", null, "In progress"), /* @__PURE__ */ React6.createElement("option", null, "Completed"))), /* @__PURE__ */ React6.createElement("label", null, "Responsible", chosen.kind === "project" ? /* @__PURE__ */ React6.createElement("select", { name: "assignee", defaultValue: chosen.assignee }, /* @__PURE__ */ React6.createElement("option", { value: "studio" }, studio.name), /* @__PURE__ */ React6.createElement("option", { value: "client" }, chosen.project.brief.name)) : /* @__PURE__ */ React6.createElement("span", null, studio.name)), /* @__PURE__ */ React6.createElement("label", null, "Due date", /* @__PURE__ */ React6.createElement("input", { name: "dueDate", type: "date", defaultValue: chosen.dueDate }))), chosen.kind === "crm" && /* @__PURE__ */ React6.createElement("label", null, "Priority", /* @__PURE__ */ React6.createElement("select", { name: "priority", defaultValue: chosen.priority }, /* @__PURE__ */ React6.createElement("option", null, "Normal"), /* @__PURE__ */ React6.createElement("option", null, "High"), /* @__PURE__ */ React6.createElement("option", null, "Low"))), /* @__PURE__ */ React6.createElement("label", null, "Description", /* @__PURE__ */ React6.createElement("textarea", { name: "detail", rows: 4, defaultValue: chosen.detail, maxLength: 2e3, placeholder: "Add the details needed to move this forward\u2026" })), /* @__PURE__ */ React6.createElement("div", { className: "task-detail-actions" }, /* @__PURE__ */ React6.createElement("button", { className: "task-primary", disabled: busy || !dirty }, busy ? "Saving\u2026" : "Save changes"), /* @__PURE__ */ React6.createElement("button", { type: "button", className: "task-delete", disabled: busy, onClick: () => setDeleting(true) }, "Delete task"))), /* @__PURE__ */ React6.createElement(WorkspaceConfirm, { open: deleting, onOpenChange: setDeleting, title: "Delete this task?", description: chosen.kind === "project" ? "It will be removed from the project plan for your studio and the client. This cannot be undone." : "This private follow-up will be removed. This cannot be undone.", confirmLabel: "Delete task", onConfirm: () => remove(chosen) }), /* @__PURE__ */ React6.createElement(TaskCollaboration, { key: chosen.key, task: chosen, studio, request, onAssignment: (key, name) => setAssignments((previous) => ({ ...previous, [key]: name })) }), /* @__PURE__ */ React6.createElement("p", { className: "task-access-note" }, chosen.kind === "project" ? "Shared in the project plan." : "This follow-up is private to your studio."))), /* @__PURE__ */ React6.createElement(Dialog2.Root, { open: creating, onOpenChange: (v) => {
    if (!busy) setCreating(v);
  } }, /* @__PURE__ */ React6.createElement(Dialog2.Portal, null, /* @__PURE__ */ React6.createElement(Dialog2.Overlay, { className: "modal-backdrop" }), /* @__PURE__ */ React6.createElement(Dialog2.Content, { className: "modal task-create" }, /* @__PURE__ */ React6.createElement(Dialog2.Close, { className: "task-detail-close", "aria-label": "Close new task" }, /* @__PURE__ */ React6.createElement(X4, { size: 18 })), /* @__PURE__ */ React6.createElement(Dialog2.Title, null, "New task"), /* @__PURE__ */ React6.createElement(Dialog2.Description, null, "Add a shared project step or a private client follow-up."), error && /* @__PURE__ */ React6.createElement("p", { role: "alert" }, error), /* @__PURE__ */ React6.createElement("form", { onSubmit: create }, /* @__PURE__ */ React6.createElement("label", null, "Belongs to", /* @__PURE__ */ React6.createElement("select", { required: true, value: destination, onChange: (e) => setDestination(e.target.value) }, /* @__PURE__ */ React6.createElement("option", { value: "", disabled: true }, "Choose a project or client"), /* @__PURE__ */ React6.createElement("optgroup", { label: "Shared project tasks" }, projects.map((p) => /* @__PURE__ */ React6.createElement("option", { key: p.id, value: "project:" + p.id }, p.title))), /* @__PURE__ */ React6.createElement("optgroup", { label: "Private client follow-ups" }, clients.map((c) => /* @__PURE__ */ React6.createElement("option", { key: c.id, value: "client:" + c.id }, c.name))))), destination.startsWith("client:") && /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("label", null, "Opportunity ", /* @__PURE__ */ React6.createElement("small", null, "(optional)"), /* @__PURE__ */ React6.createElement("select", { name: "opportunityId", key: destination }, /* @__PURE__ */ React6.createElement("option", { value: "" }, "General relationship task"), opportunities.filter((o) => o.clientId === destination.slice(7)).map((o) => /* @__PURE__ */ React6.createElement("option", { key: o.id, value: o.id }, o.title)))), /* @__PURE__ */ React6.createElement("label", null, "Priority", /* @__PURE__ */ React6.createElement("select", { name: "priority" }, /* @__PURE__ */ React6.createElement("option", null, "Normal"), /* @__PURE__ */ React6.createElement("option", null, "High"), /* @__PURE__ */ React6.createElement("option", null, "Low")))), /* @__PURE__ */ React6.createElement("label", null, "Task", /* @__PURE__ */ React6.createElement("input", { name: "title", required: true, maxLength: 200, placeholder: "What needs to happen?" })), /* @__PURE__ */ React6.createElement("label", null, "Description", /* @__PURE__ */ React6.createElement("textarea", { name: "detail", rows: 3, maxLength: 2e3 })), destination.startsWith("project:") && /* @__PURE__ */ React6.createElement("label", null, "Responsible", /* @__PURE__ */ React6.createElement("select", { name: "assignee" }, /* @__PURE__ */ React6.createElement("option", { value: "studio" }, "Studio"), /* @__PURE__ */ React6.createElement("option", { value: "client" }, "Client"))), /* @__PURE__ */ React6.createElement("label", null, "Due date", /* @__PURE__ */ React6.createElement("input", { name: "dueDate", type: "date" })), /* @__PURE__ */ React6.createElement("button", { className: "task-primary", disabled: busy || !destination }, busy ? "Creating\u2026" : "Create task"))))));
}
export {
  TaskWorkspace
};
