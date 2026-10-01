window.__ModuleLoader__.load({
	id: "dsh-codex-review",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name2 in all)
		    __defProp(target, name2, { get: all[name2], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
		  // If the importer is in node compatibility mode or this is not an ESM
		  // file that has been converted to a CommonJS file using a Babel-
		  // compatible transform (i.e. "__esModule" has not been set), then set
		  // "default" to the CommonJS "module.exports" for node compatibility.
		  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
		  mod
		));
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.tsx
		var index_exports = {};
		__export(index_exports, {
		  apply: () => apply,
		  inject: () => inject,
		  name: () => name
		});
		module.exports = __toCommonJS(index_exports);
		var React2 = __toESM(require("react"), 1);

		// src/client/SettingsCard.tsx
		var React = __toESM(require("react"), 1);

		// config.mjs
		var PLUGIN_NAME = "codex-review";
		var PACKAGE_NAME = "dsh-codex-review";
		var SETTINGS_NAMESPACE = PLUGIN_NAME;
		var ROW_CONFIG_KEY = `${PACKAGE_NAME}#${PLUGIN_NAME}`;
		var DEFAULT_INSTRUCTION = [
		  "You are a delegated code reviewer. You did not write this code and you must not change it.",
		  "Establish what changed, then read the changed files in full — not only the diff hunks.",
		  "Judge the change against what it claims to do, not against what you would have written."
		].join(" ");
		var DEFAULTS = {
		  /** Subagent backend name registered with `ctx.subagents` (spawn|fork|codex|…). */
		  backend: "spawn",
		  /** LLM route the child is pinned to. `openai-codex` is the subscription route. */
		  provider: "openai-codex",
		  /** Model id on that route. */
		  model: "gpt-5.6-sol",
		  /**
		   * Reviewer memory. `shared` keeps ONE reviewer child per parent session and
		   * hands it every later review, so it remembers what it already flagged and
		   * across which revisions; `fresh` starts a one-shot child per call.
		   */
		  conversation: "shared",
		  /** Reasoning effort for the child, or null to let the route decide. */
		  reasoningEffort: null,
		  /**
		   * Depth cap handed to the child (0 = the reviewer may not delegate further),
		   * or null to send no `maxDepth` at all — backends that do not advertise the
		   * `depthLimit` capability reject the request outright, so null is the safe
		   * default for third-party backends.
		   */
		  childMaxDepth: null,
		  /** Optional per-child persona text (requires the backend's `persona` capability). */
		  persona: null,
		  command: "review",
		  description: "Review the current change set with the pinned reviewer model",
		  inputHint: "[focus — files, area, or the question you want answered]",
		  instruction: DEFAULT_INSTRUCTION,
		  /** Commands the reviewer is told to run first. Set either to null to omit. */
		  diffCommand: "git --no-pager diff HEAD",
		  statusCommand: "git --no-pager status --short",
		  /** Hard cap on the review text handed back to the session. */
		  maxOutputChars: 4e4
		};
		var EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
		var EFFORT_SET = new Set(EFFORTS);
		var CONVERSATIONS = ["shared", "fresh"];
		var CONVERSATION_SET = new Set(CONVERSATIONS);

		// src/client/SettingsCard.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		var CODEX_MODELS = [
		  "gpt-6.1-sol",
		  "gpt-6-sol",
		  "gpt-6-luna",
		  "gpt-6-astra",
		  "gpt-5.6-sol",
		  "gpt-5.6-luna",
		  "gpt-5.6-terra",
		  "gpt-5.5",
		  "gpt-5.4",
		  "gpt-5.3-codex-spark"
		];
		var ROUTE_SUGGESTIONS = ["openai-codex", "openrouter", "deepseek"];
		var labelStyle = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 };
		var hintStyle = { margin: "4px 0 0", fontSize: 11, opacity: 0.65, lineHeight: 1.45 };
		var inputStyle = {
		  width: "100%",
		  boxSizing: "border-box",
		  padding: "6px 8px",
		  fontSize: 12,
		  borderRadius: 6,
		  border: "1px solid var(--dsw-alias-border, #0003)",
		  background: "var(--dsw-alias-bg, transparent)",
		  color: "inherit",
		  fontFamily: "inherit"
		};
		var resetStyle = {
		  marginLeft: 8,
		  fontSize: 10,
		  fontWeight: 400,
		  border: "none",
		  background: "none",
		  color: "var(--dsw-alias-text-accent, #69f)",
		  cursor: "pointer",
		  padding: 0
		};
		function useScopeSnapshot(scope) {
		  const read = React.useCallback(() => {
		    try {
		      return scope?.getSnapshot?.() ?? { status: "unavailable" };
		    } catch {
		      return { status: "unavailable" };
		    }
		  }, [scope]);
		  const [snap, setSnap] = React.useState(read);
		  React.useEffect(() => {
		    setSnap(read());
		    if (typeof scope?.subscribe !== "function") return void 0;
		    try {
		      const unsubscribe = scope.subscribe(() => setSnap(read()));
		      return () => {
		        void unsubscribe;
		      };
		    } catch {
		      return void 0;
		    }
		  }, [scope, read]);
		  return snap;
		}
		function allowlistModels(snapshot) {
		  const entries = snapshot.value?.allowedModels;
		  return Array.isArray(entries) ? entries.filter((entry) => entry?.provider && entry?.model) : [];
		}
		function Row(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginBottom: 12 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { htmlFor: props.id, style: labelStyle, children: [
		      props.label,
		      props.overridden && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { ...labelStyle, display: "inline", marginLeft: 8, fontSize: 10, fontWeight: 400, opacity: 0.8 }, children: [
		        "set in the patch",
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: resetStyle, onClick: props.onReset, disabled: props.disabled, children: "reset" })
		      ] })
		    ] }),
		    props.children,
		    props.hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hintStyle, children: props.hint })
		  ] });
		}
		function ModelPicker(props) {
		  const options = props.options.includes(props.value) || props.value === "" ? props.options : [props.value, ...props.options];
		  const [custom, setCustom] = React.useState(false);
		  const showText = custom || props.value !== "" && !props.options.includes(props.value);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: showText ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "input",
		      {
		        id: props.id,
		        style: inputStyle,
		        value: props.value,
		        disabled: props.disabled,
		        spellCheck: false,
		        onChange: (event) => props.onChange(event.target.value.trim())
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...resetStyle, marginLeft: 0 }, onClick: () => setCustom(false), disabled: props.disabled, children: "list" })
		  ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		    "select",
		    {
		      id: props.id,
		      style: inputStyle,
		      value: props.value,
		      disabled: props.disabled,
		      onChange: (event) => {
		        if (event.target.value === "") setCustom(true);
		        else props.onChange(event.target.value);
		      },
		      children: [
		        options.map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: id }, id)),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "other…" })
		      ]
		    }
		  ) });
		}
		function ReviewSettingsCard(props) {
		  const snap = useScopeSnapshot(props.scope);
		  const allowSnap = useScopeSnapshot(props.allowlist);
		  const [groups, setGroups] = React.useState([]);
		  const [pending, setPending] = React.useState(0);
		  const value = snap.value ?? {};
		  const status = snap.status ?? "loading";
		  const disabled = status !== "ready" || snap.writable === false;
		  const showHeading = props.heading !== false;
		  React.useEffect(() => {
		    let live = true;
		    Promise.resolve().then(() => props.catalog?.()).then((catalog) => {
		      if (!live || catalog === void 0 || catalog === null) return;
		      const listed = catalog.groups;
		      if (Array.isArray(listed) && listed.length > 0) setGroups(listed);
		    }).catch(() => {
		    });
		    return () => {
		      live = false;
		    };
		  }, []);
		  const commit = React.useCallback((field, next) => {
		    setPending((n) => n + 1);
		    void props.scope.set(field, next).catch(() => {
		    }).finally(() => setPending((n) => n - 1));
		  }, [props.scope]);
		  const reset = React.useCallback((field) => {
		    setPending((n) => n + 1);
		    void props.scope.unset(field).catch(() => {
		    }).finally(() => setPending((n) => n - 1));
		  }, [props.scope]);
		  const overridden = (field) => snap.user?.[field] !== void 0;
		  const provider = value.provider ?? DEFAULTS.provider;
		  const model = value.model ?? DEFAULTS.model;
		  const conversation = value.conversation ?? DEFAULTS.conversation;
		  const effort = value.reasoningEffort ?? "";
		  const modelOptions = React.useMemo(() => {
		    const fromCatalog = groups.filter((group) => group.id === provider).flatMap((group) => (group.models ?? []).map((entry) => entry.id)).filter((id) => typeof id === "string" && id.length > 0);
		    const fromAllowlist = allowlistModels(allowSnap).filter((entry) => entry.provider === provider).map((entry) => entry.model);
		    const base = provider === "openai-codex" ? CODEX_MODELS : [];
		    return [.../* @__PURE__ */ new Set([...fromCatalog, ...fromAllowlist, ...base])];
		  }, [groups, allowSnap, provider]);
		  if (status === "loading") return showHeading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hintStyle, children: "Loading the reviewer settings…" }) : null;
		  if (status === "unavailable") {
		    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hintStyle, children: "This deployment does not serve the reviewer settings section." });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: 12, opacity: pending > 0 ? 0.7 : 1 }, children: [
		    showHeading && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: "0 0 4px", fontSize: 14 }, children: "Codex review" }),
		      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...hintStyle, marginBottom: 12 }, children: "`/review` delegates to a child on the route below, so the reviewer is a different model from the one that wrote the code." })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		      Row,
		      {
		        id: "codex-review-provider",
		        label: "Route",
		        hint: "LLM provider the reviewer child is pinned to. The subscription route is openai-codex (installed by dsh-codex-auth from your Codex CLI login).",
		        overridden: overridden("provider"),
		        disabled,
		        onReset: () => reset("provider"),
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "input",
		            {
		              id: "codex-review-provider",
		              style: inputStyle,
		              list: "codex-review-provider-list",
		              value: provider,
		              disabled,
		              spellCheck: false,
		              onChange: (event) => commit("provider", event.target.value.trim())
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("datalist", { id: "codex-review-provider-list", children: ROUTE_SUGGESTIONS.map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id }, id)) })
		        ]
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      Row,
		      {
		        id: "codex-review-model",
		        label: "Reviewer model",
		        hint: "Any model id the route accepts. The list is the running composition's catalog for this route, plus the account's Codex ids; “other…” takes a typed id.",
		        overridden: overridden("model"),
		        disabled,
		        onReset: () => reset("model"),
		        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          ModelPicker,
		          {
		            id: "codex-review-model",
		            value: model,
		            options: modelOptions,
		            disabled,
		            onChange: (next) => commit("model", next)
		          }
		        )
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      Row,
		      {
		        id: "codex-review-conversation",
		        label: "Reviewer memory",
		        hint: "Shared keeps one reviewer session per chat, so later reviews remember what was already flagged. Fresh starts a new reviewer each time.",
		        overridden: overridden("conversation"),
		        disabled,
		        onReset: () => reset("conversation"),
		        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "select",
		          {
		            id: "codex-review-conversation",
		            style: inputStyle,
		            value: conversation,
		            disabled,
		            onChange: (event) => commit("conversation", event.target.value),
		            children: CONVERSATIONS.map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: id === "shared" ? "shared — one reviewer session, remembers past reviews" : "fresh — a new reviewer per review" }, id))
		          }
		        )
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      Row,
		      {
		        id: "codex-review-effort",
		        label: "Reasoning effort",
		        hint: "How hard the reviewer is asked to think. “route default” sends no effort at all.",
		        overridden: overridden("reasoningEffort"),
		        disabled,
		        onReset: () => reset("reasoningEffort"),
		        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		          "select",
		          {
		            id: "codex-review-effort",
		            style: inputStyle,
		            value: effort,
		            disabled,
		            onChange: (event) => commit("reasoningEffort", event.target.value),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "route default" }),
		              EFFORTS.map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: id }, id))
		            ]
		          }
		        )
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      Row,
		      {
		        id: "codex-review-command",
		        label: "Command name",
		        hint: "The slash command this row registers, without the slash.",
		        overridden: overridden("command"),
		        disabled,
		        onReset: () => reset("command"),
		        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          "input",
		          {
		            id: "codex-review-command",
		            style: inputStyle,
		            value: value.command ?? DEFAULTS.command,
		            disabled,
		            spellCheck: false,
		            onChange: (event) => {
		              const next = event.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
		              if (next.length > 0) commit("command", next);
		            }
		          }
		        )
		      }
		    )
		  ] });
		}

		// src/client/index.tsx
		var SUBAGENT_ALLOWLIST_NAMESPACE = "subagent-model-selection-settings";
		var name = "dsh-codex-review";
		var inject = ["slots"];
		function registerRowConfig(ctx) {
		  ctx.inject(["configForms"], (c) => {
		    const card = (props) => props?.view === "summary" ? null : React2.createElement(ReviewSettingsCard, {
		      scope: c.configForms.get(SETTINGS_NAMESPACE),
		      allowlist: c.configForms.get(SUBAGENT_ALLOWLIST_NAMESPACE),
		      // The composition's own model catalog: which routes exist and what each
		      // serves. Read defensively — this card is a convenience, and a client
		      // without the session service must still render its static list.
		      catalog: () => c.remote?.session?.modelCatalog?.(),
		      heading: false
		    });
		    const register = () => {
		      try {
		        c.slots.inject("plugins.bundle.config", () => c.slots.register({ name: "plugins.bundle.config", key: PACKAGE_NAME }, card));
		      } catch {
		      }
		      try {
		        c.slots.inject("plugins.row.config", () => c.slots.register({ name: "plugins.row.config", key: ROW_CONFIG_KEY }, card));
		      } catch {
		      }
		    };
		    try {
		      if (typeof c.configForms?.whileServed === "function") {
		        c.effect(() => c.configForms.whileServed([SETTINGS_NAMESPACE], register), "codex-review: settings page");
		      } else {
		        register();
		      }
		    } catch {
		    }
		  });
		}
		function registerSettingsItem(ctx) {
		  ctx.inject(["settingsScope"], (c) => {
		    try {
		      const scope = c.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
		      c.slots.inject(
		        "settings.plugin.item",
		        () => c.slots.register(
		          { name: "settings.plugin.item", key: SETTINGS_NAMESPACE, id: "codex-review", order: 30 },
		          () => React2.createElement(ReviewSettingsCard, { scope })
		        )
		      );
		    } catch {
		    }
		  });
		}
		function apply(ctx) {
		  registerRowConfig(ctx);
		  registerSettingsItem(ctx);
		}

		return module.exports;
	}
});
