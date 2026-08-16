/**
 * dsh-skill-config — Client bundle.
 *
 * Adds a "技能配置" settings section (below "Agent 预设", order 30) with:
 *   • an MCP management panel (import toggle, server list with status + enable
 *     toggles, "+ 添加" JSON dialog — the host converts the JSON),
 *   • a skill management panel ("创建技能" dialog with zip/.skill/.md upload
 *     that auto-fills the form, plus list/delete).
 *
 * Talks to the host half through same-origin POST /plugins/skill-config/*.
 *
 * Bundle format: `window.__ModuleLoader__.load({ id, factory })` — the exact
 * shape the client-modules host half serves at `/plugins/<id>/client.js`.
 */
window.__ModuleLoader__.load({
  id: "Jnpz",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // ---- imports available in the boot seed graph ----
    var React = require("react");
    var jsxRuntime = require("react/jsx-runtime");
    var clientRuntime = require("@deepseek-ai/dsh-client-runtime/client");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    var jsx = jsxRuntime.jsx;
    var jsxs = jsxRuntime.jsxs;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;

    var Modal = primitives.Modal;
    var IconRefreshOutline16 = primitives.IconRefreshOutline16;
    var IconPlusOutline16 = primitives.IconPlusOutline16;
    var IconChevronRightOutline14 = primitives.IconChevronRightOutline14;
    var IconChevronDownOutline14 = primitives.IconChevronDownOutline14;
    var IconCheckOutline16 = primitives.IconCheckOutline16;
    var IconWarningOutline16 = primitives.IconWarningOutline16;
    var IconTrashOutline16 = primitives.IconTrashOutline16;
    var IconSkillOutline16 = primitives.IconSkillOutline16;
    var IconArchiveOutline20 = primitives.IconArchiveOutline20;
    var IconLoadingOutline16 = primitives.IconLoadingOutline16;
    var IconEditOutline16 = primitives.IconEditOutline16;

    // =====================================================================
    // locale
    // =====================================================================
    var NS = "settings.skillConfig";

    var zh = {
      nav: "技能配置",
      sectionIntro: "管理 MCP 服务器与技能（Skill）：MCP 配置支持 JSON 粘贴、后台自动转换；技能支持上传 zip / .skill 文件自动识别。",
      // 生效说明
      legendTitle: "生效说明",
      legendCollapsedHint: "点击展开",
      legendInstant: "即时生效",
      legendRestart: "需重启服务",
      legendL1: "MCP 添加 / 删除 / 启用 / 停用 —— 即时生效",
      legendL2: "技能 创建 / 删除 / 启用 / 停用 —— 即时生效",
      legendL3: "cordis.patch.yml 中的服务器：开关即时生效；永久增删需编辑该文件（保存后自动热加载）",
      legendL4: "插件本体更新（lib/*.js）—— 重跑 install.ps1 后需重启 DSH：npx @deepseek-ai/dsh web",
      // MCP block
      mcpBlockTitle: "MCP",
      mcpBlockHelp: "Model Context Protocol：为智能体接入外部工具能力。",
      serversTitle: "已配置的 MCP Servers",
      serversCardTitle: "MCP Servers 管理",
      serversCardDesc: "管理您已添加的 MCP 服务器，可启用、配置或添加新的工具能力（添加 / 删除 / 开关即时生效）。",
      serversEmpty: "还没有配置 MCP 服务器，点击右上角「+ 添加」。",
      refresh: "刷新",
      add: "添加",
      addTitle: "添加 MCP 服务器",
      addDesc: "粘贴 JSON 配置，后台自动转换为可运行的 MCP 连接，立即生效。支持单个服务器对象或标准 { \"mcpServers\": {...} } 格式：stdio 用 command（字符串或数组）/args，HTTP 用 url；type 支持 stdio / local / streamable-http / sse。",
      jsonLabel: "MCP 配置（JSON）",
      jsonPlaceholder: '{\n  "mcpServers": {\n    "yakit": { "command": "yak", "args": ["bridge", "--proc", "4"] },\n    "x64dbg": { "type": "local", "command": ["node", "D:\\\\server\\\\index.js"], "timeout": 30000 },\n    "kali-mcp": { "url": "http://10.0.0.104:5000/mcp" }\n  }\n}',
      editTitle: "编辑 MCP 服务器",
      cancel: "取消",
      confirm: "确认",
      badJson: "JSON 格式错误：",
      addFailed: "添加失败：",
      statusConnected: "已连接",
      statusConnecting: "连接中…",
      statusError: "连接失败",
      statusDisabled: "已禁用",
      statusProject: "项目",
      cordisHint: "该服务器配置在 cordis.patch.yml 中：开关即时生效；永久增删请编辑该文件（保存后自动热加载）。",
      detailConfig: "配置",
      detailEdit: "编辑",
      detailRemove: "删除",
      removeMcpConfirm: "删除 MCP 服务器 ",
      removeMcpConfirmSuffix: " ？该操作会立即断开连接。",
      confirmDeleteTitle: "删除确认",
      // skills block
      skillsBlockTitle: "技能",
      skillsBlockHelp: "技能（Skill）是模型按需加载的任务指令包，保存在 ~/.dsh/skills 下，创建后即刻生效。",
      skillsCardTitle: "技能 管理",
      skillsCardDesc: "管理已安装的技能，可上传打包好的技能文件或手动创建（创建 / 删除 / 开关即时生效）。",
      skillsEmpty: "还没有技能，点击右上角「+ 创建技能」。",
      createSkill: "创建技能",
      createSkillTitle: "创建技能",
      editSkillTitle: "编辑技能",
      editSkillSaved: "技能已更新",
      editSkillFailed: "更新失败：",
      editSkill: "编辑",
      uploadTitle: "上传进行智能解析",
      uploadHint: "zip 或 .skill 文件，根目录包含 SKILL.md。SKILL.md 通过 YAML 格式定义技能名称与描述。",
      uploadParsed: "已识别 SKILL.md 并自动填充表单",
      uploadParseFail: "识别失败：",
      uploading: "正在解析…",
      fileNameLabel: "已选择文件：",
      reselect: "重新选择",
      fieldName: "技能名称",
      fieldNamePh: "为该技能起一个简短、易识别的名称（例如 codemap）",
      fieldNameHint: "仅支持小写字母、数字与连字符，将自动规范化",
      fieldDescription: "描述",
      fieldDescriptionPh: "该技能应该在何时使用？例如：当用户询问项目结构或文件关系时",
      fieldInstructions: "指令",
      fieldInstructionsPh: "定义该技能激活时模型应如何行为。例如：\n# codemap\n## Commands\n### When to Use\n### Output Interpretation\n### Examples",
      createFailed: "创建失败：",
      createSaved: "技能创建成功",
      removedSaved: "已删除",
      removeSkillConfirm: "删除技能 ",
      removeSkillConfirmSuffix: " ？将移除对应目录。",
      loadFailed: "加载失败：",
      mcpSaved: "MCP 配置已保存",
      toggleFailed: "操作失败：",
    };

    var en = {
      nav: "Skills & MCP",
      sectionIntro: "Manage MCP servers and skills: MCP config accepts JSON and is converted host-side; skills support zip / .skill upload with automatic recognition.",
      legendTitle: "Effective immediately?",
      legendCollapsedHint: "click to expand",
      legendInstant: "Instant",
      legendRestart: "Restart required",
      legendL1: "MCP add / remove / enable / disable — instant",
      legendL2: "Skill create / remove / enable / disable — instant",
      legendL3: "Servers in cordis.patch.yml: toggles are instant; to add/remove permanently, edit the file (hot-reloaded on save)",
      legendL4: "Plugin updates (lib/*.js) — re-run install.ps1, then restart DSH: npx @deepseek-ai/dsh web",
      mcpBlockTitle: "MCP",
      mcpBlockHelp: "Model Context Protocol: connect external tool capabilities to the agent.",
      serversTitle: "Configured MCP Servers",
      serversCardTitle: "MCP Servers",
      serversCardDesc: "Manage your MCP servers — enable, configure, or add new tool capabilities (add / remove / toggle take effect instantly).",
      serversEmpty: "No MCP servers yet. Click “+ Add”.",
      refresh: "Refresh",
      add: "Add",
      addTitle: "Add MCP Server",
      addDesc: "Paste a JSON config; the host converts it into a live MCP connection, effective immediately. Accepts one server object or the standard { \"mcpServers\": {...} } shape: stdio uses command (string or array)/args, HTTP uses url; type accepts stdio / local / streamable-http / sse.",
      jsonLabel: "MCP config (JSON)",
      jsonPlaceholder: '{\n  "mcpServers": {\n    "yakit": { "command": "yak", "args": ["bridge", "--proc", "4"] },\n    "x64dbg": { "type": "local", "command": ["node", "D:\\\\server\\\\index.js"], "timeout": 30000 },\n    "kali-mcp": { "url": "http://10.0.0.104:5000/mcp" }\n  }\n}',
      editTitle: "Edit MCP Server",
      cancel: "Cancel",
      confirm: "Confirm",
      badJson: "Invalid JSON: ",
      addFailed: "Add failed: ",
      statusConnected: "Connected",
      statusConnecting: "Connecting…",
      statusError: "Connection failed",
      statusDisabled: "Disabled",
      statusProject: "project",
      cordisHint: "This server is configured in cordis.patch.yml: toggles take effect instantly; to add/remove permanently, edit that file (hot-reloaded on save).",
      detailConfig: "Config",
      detailEdit: "Edit",
      detailRemove: "Remove",
      removeMcpConfirm: "Remove MCP server ",
      removeMcpConfirmSuffix: "? The connection closes immediately.",
      confirmDeleteTitle: "Confirm removal",
      skillsBlockTitle: "Skills",
      skillsBlockHelp: "Skills are on-demand instruction packs, stored under ~/.dsh/skills and effective immediately.",
      skillsCardTitle: "Skills",
      skillsCardDesc: "Manage installed skills — upload a packaged skill or create one manually (create / remove / toggle take effect instantly).",
      skillsEmpty: "No skills yet. Click “+ Create Skill”.",
      createSkill: "Create Skill",
      createSkillTitle: "Create Skill",
      editSkillTitle: "Edit Skill",
      editSkillSaved: "Skill updated",
      editSkillFailed: "Update failed: ",
      editSkill: "Edit",
      uploadTitle: "Upload for smart parsing",
      uploadHint: "A zip or .skill file with SKILL.md at its root. SKILL.md defines the skill name and description in YAML.",
      uploadParsed: "SKILL.md recognized — form auto-filled",
      uploadParseFail: "Recognition failed: ",
      uploading: "Parsing…",
      fileNameLabel: "Selected file: ",
      reselect: "Reselect",
      fieldName: "Skill name",
      fieldNamePh: "A short, recognizable name (e.g. codemap)",
      fieldNameHint: "Lowercase letters, digits and hyphens; auto-normalized",
      fieldDescription: "Description",
      fieldDescriptionPh: "When should this skill be used? e.g. When the user asks about project structure",
      fieldInstructions: "Instructions",
      fieldInstructionsPh: "Define how the model should behave when this skill is active. e.g.:\n# codemap\n## Commands\n### When to Use\n### Output Interpretation\n### Examples",
      createFailed: "Create failed: ",
      createSaved: "Skill created",
      removedSaved: "Removed",
      removeSkillConfirm: "Remove skill ",
      removeSkillConfirmSuffix: "? Its directory will be deleted.",
      loadFailed: "Load failed: ",
      mcpSaved: "MCP config saved",
      toggleFailed: "Operation failed: ",
    };

    // =====================================================================
    // small helpers
    // =====================================================================
    function post(path, body) {
      return fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body === undefined ? {} : body),
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
    }

    function readFileAsBase64(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var text = String(reader.result || "");
          var comma = text.indexOf(",");
          resolve(comma >= 0 ? text.slice(comma + 1) : text);
        };
        reader.onerror = function () {
          reject(new Error("读取文件失败"));
        };
        reader.readAsDataURL(file);
      });
    }

    var ICON_COLORS = [
      "#d4568f", "#8b5cf6", "#64748b", "#b0723a", "#0ea5e9",
      "#10b981", "#ef4444", "#f59e0b", "#14b8a6", "#6366f1",
    ];
    function iconColor(name) {
      var h = 0;
      var s = String(name || "");
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return ICON_COLORS[h % ICON_COLORS.length];
    }

    // =====================================================================
    // store
    // =====================================================================
    var storeHandle = clientRuntime.defineStore({
      init: function () {
        return {
          status: "idle", // idle | loading | ready | error
          error: null,
          servers: [],
          skills: [],
          projectMcp: { enabled: false },
        };
      },
      actions: {
        patch: function (d, patch) {
          Object.assign(d, patch);
        },
      },
    });

    var bound = null;
    var reloadHook = null;

    function applyStatePatch(res) {
      if (res && res.ok && res.state) {
        bound.patch({
          status: "ready",
          error: null,
          servers: res.state.servers || [],
          skills: res.state.skills || [],
          projectMcp: res.state.projectMcp || { enabled: false },
        });
      }
      return res;
    }

    // ---- injected face (called with the store's baked actions) ----
    function injected(actions) {
      bound = actions;

      function load() {
        bound.patch({ status: "loading", error: null });
        return post("/plugins/skill-config/state").then(applyStatePatch, function (err) {
          bound.patch({ status: "error", error: String((err && err.message) || err) });
          return { ok: false, error: String((err && err.message) || err) };
        });
      }
      reloadHook = load;

      return {
        refresh: load,
        addMcp: function (jsonValue) {
          return post("/plugins/skill-config/mcp.add", { json: jsonValue }).then(applyStatePatch);
        },
        removeMcp: function (id) {
          return post("/plugins/skill-config/mcp.remove", { id: id }).then(applyStatePatch);
        },
        toggleMcp: function (server) {
          return post("/plugins/skill-config/mcp.toggle", {
            id: server.id,
            entryId: server.entryId,
            serverName: server.serverName,
            source: server.source,
            enabled: !server.enabled,
          }).then(applyStatePatch);
        },
        toggleSkill: function (name, enabled) {
          return post("/plugins/skill-config/skills.toggle", { name: name, enabled: enabled }).then(applyStatePatch);
        },
        parseSkillFile: function (payload) {
          return post("/plugins/skill-config/skills.parse", payload);
        },
        createSkill: function (payload) {
          return post("/plugins/skill-config/skills.create", payload).then(applyStatePatch);
        },
        removeSkill: function (name) {
          return post("/plugins/skill-config/skills.remove", { name: name }).then(applyStatePatch);
        },
        updateSkill: function (payload) {
          return post("/plugins/skill-config/skills.update", payload).then(applyStatePatch);
        },
      };
    }

    // =====================================================================
    // stylesheet
    // =====================================================================
    var cssText =
      ".sc-root{display:flex;flex-direction:column;gap:18px;max-width:760px;color:var(--dsw-alias-label-primary)}" +
      ".sc-title{font-size:18px;font-weight:600;margin:0;line-height:1.4}" +
      ".sc-intro{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:4px 0 0;line-height:1.5}" +
      ".sc-block{display:flex;flex-direction:column;gap:10px}" +
      ".sc-block-head{display:flex;align-items:center;gap:8px}" +
      ".sc-block-title{font-size:15px;font-weight:600}" +
      ".sc-group-label{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;margin:2px 0 0}" +
      ".sc-legend{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;gap:6px}" +
      ".sc-legend-head{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;padding:2px 0;text-align:left;width:100%}" +
      ".sc-legend-head:hover{color:var(--dsw-alias-label-primary)}" +
      ".sc-legend-title{font-size:13px;font-weight:600}" +
      ".sc-legend-closed-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}" +
      ".sc-legend-row{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}" +
      ".sc-legend-badge{flex:none;border-radius:999px;padding:0 8px;font-size:11px;line-height:18px;white-space:nowrap}" +
      ".sc-legend-badge-instant{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}" +
      ".sc-legend-badge-restart{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}" +
      ".sc-help{color:var(--dsw-alias-label-tertiary);cursor:help;background:none;border:none;padding:0;display:inline-flex;align-items:center}" +
      ".sc-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;overflow:hidden}" +
      ".sc-card-head{display:flex;align-items:flex-start;gap:12px;padding:14px 16px}" +
      ".sc-card-head-text{flex:1;min-width:0}" +
      ".sc-card-title{font-size:15px;font-weight:600;line-height:1.4}" +
      ".sc-card-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:2px;line-height:1.5}" +
      ".sc-card-actions{display:flex;align-items:center;gap:8px;flex:none}" +
      ".sc-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}" +
      ".sc-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".sc-add-btn{display:inline-flex;align-items:center;gap:5px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border:none;border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}" +
      ".sc-add-btn:hover{background:var(--dsw-alias-button-primary-hover)}" +
      ".sc-import-row{display:flex;align-items:center;gap:12px;padding:14px 16px}" +
      ".sc-import-text{flex:1;min-width:0}" +
      ".sc-import-title{font-size:14px;line-height:1.4}" +
      ".sc-import-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:2px;line-height:1.5}" +
      ".sc-rows{list-style:none;margin:0;padding:0;border-top:1px solid var(--dsw-alias-border-l2)}" +
      ".sc-rowwrap+.sc-rowwrap{border-top:1px solid var(--dsw-alias-border-l2)}" +
      ".sc-row{display:flex;align-items:center;gap:10px;padding:10px 16px}" +
      ".sc-chevron{background:none;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:2px;display:inline-flex;flex:none}" +
      ".sc-chevron:hover{color:var(--dsw-alias-label-primary)}" +
      ".sc-icon{width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#fff;flex:none}" +
      ".sc-name{flex:1;min-width:0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".sc-badge{display:inline-block;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:0 8px;font-size:11px;line-height:18px;margin-left:8px;vertical-align:1px}" +
      ".sc-status{flex:none;display:inline-flex;align-items:center;font-size:14px;line-height:1}" +
      ".sc-status-ok{color:var(--dsw-alias-state-success-primary)}" +
      ".sc-status-off{color:var(--dsw-alias-label-dimmed)}" +
      ".sc-status-err{color:var(--dsw-alias-state-error-primary)}" +
      ".sc-spin{animation:scspin 1s linear infinite}" +
      "@keyframes scspin{to{transform:rotate(360deg)}}" +
      ".sc-toggle{width:36px;height:20px;border-radius:999px;border:none;background:var(--dsw-alias-border-l3);position:relative;cursor:pointer;flex:none;padding:0;transition:background .15s}" +
      ".sc-toggle-on{background:var(--dsw-alias-state-success-primary)}" +
      ".sc-toggle-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}" +
      ".sc-toggle-on .sc-toggle-knob{left:18px}" +
      ".sc-detail{padding:2px 16px 12px 54px}" +
      ".sc-detail-title{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0 0 6px}" +
      ".sc-json{background:var(--dsw-alias-markdown-code-block);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;font-size:12px;line-height:1.55;overflow:auto;max-height:220px;margin:0;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Consolas,monospace}" +
      ".sc-detail-actions{display:flex;gap:8px;margin-top:10px}" +
      ".sc-empty{color:var(--dsw-alias-label-tertiary);padding:16px;font-size:13px;margin:0}" +
      ".sc-form{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0}" +
      ".sc-field{display:flex;flex-direction:column;gap:6px}" +
      ".sc-label{font-size:13px;font-weight:500}" +
      ".sc-required{color:var(--dsw-alias-state-error-primary);margin-right:3px}" +
      ".sc-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}" +
      ".sc-input,.sc-textarea{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:8px 10px}" +
      ".sc-input:focus,.sc-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}" +
      ".sc-textarea{resize:vertical;min-height:66px;line-height:1.5}" +
      ".sc-textarea-big{min-height:150px}" +
      ".sc-json-input{min-height:190px;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.55}" +
      ".sc-error{color:var(--dsw-alias-state-error-primary);font-size:12px;margin:0;line-height:1.5;white-space:pre-wrap}" +
      ".sc-dropzone{border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;padding:18px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;cursor:pointer;color:var(--dsw-alias-label-secondary)}" +
      ".sc-dropzone:hover,.sc-dropzone-active{border-color:var(--dsw-alias-brand-primary)}" +
      ".sc-dropzone-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary);margin-top:6px}" +
      ".sc-dropzone-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}" +
      ".sc-parse-note{font-size:12px;line-height:1.5}" +
      ".sc-parse-ok{color:var(--dsw-alias-state-success-primary)}" +
      ".sc-parse-bad{color:var(--dsw-alias-state-error-primary)}" +
      ".sc-file{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:4px}" +
      ".sc-file-reselect{color:var(--dsw-alias-brand-primary);cursor:pointer;text-decoration:underline}" +
      ".sc-modal-foot{display:flex;justify-content:flex-end;gap:8px}" +
      ".sc-btn{font:inherit;cursor:pointer;border-radius:8px;padding:6px 14px;font-size:13px;line-height:1.5;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}" +
      ".sc-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".sc-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border:none}" +
      ".sc-btn-primary:hover{background:var(--dsw-alias-button-primary-hover)}" +
      ".sc-btn:disabled{opacity:.45;cursor:default}" +
      ".sc-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-secondary)}" +
      ".sc-btn-danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}" +
      ".sc-btn-danger-solid{background:var(--dsw-alias-state-error-primary);color:#fff;border:none}" +
      ".sc-btn-danger-solid:hover{background:var(--dsw-alias-state-error-secondary)}" +
      ".sc-confirm-body{display:flex;flex-direction:column;gap:10px;min-width:0}" +
      ".sc-confirm-msg{color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:1.7;margin:0;word-break:break-word}" +
      ".sc-skill-icon{color:var(--dsw-alias-label-tertiary)}" +
      ".sc-skill-row{display:flex;align-items:center;gap:10px;padding:10px 16px}" +
      ".sc-skill-text{flex:1;min-width:0}" +
      ".sc-skill-name{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".sc-skill-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".sc-del-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;flex:none}" +
      ".sc-del-btn:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}" +
      // widen the host's 380px modal: the create/add forms need room (issue: clipped text)
      ".sc-modal-wide{width:min(640px,calc(100vw - 32px))!important;max-height:calc(100vh - 32px);overflow-y:auto!important}" +
      ".sc-dropzone-hint{word-break:break-word}" +
      ".sc-skill-row-off{opacity:.55}" +
      ".sc-loading{color:var(--dsw-alias-label-tertiary);font-size:13px;padding:12px 0}" +
      ".sc-errorbox{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-state-error-primary);font-size:13px}" +
      ".sc-retry{color:var(--dsw-alias-brand-primary);cursor:pointer;background:none;border:none;font:inherit;text-decoration:underline}";

    var styleTag = null;
    function ensureStyle() {
      if (styleTag || typeof document === "undefined") return;
      styleTag = document.createElement("style");
      styleTag.dataset.plugin = "Jnpz";
      styleTag.textContent = cssText;
      document.head.appendChild(styleTag);
    }

    // =====================================================================
    // small UI pieces
    // =====================================================================
    function Toggle(props) {
      return jsx("button", {
        type: "button",
        role: "switch",
        "aria-checked": props.checked,
        className: "sc-toggle" + (props.checked ? " sc-toggle-on" : ""),
        title: props.title,
        onClick: function () {
          props.onChange(!props.checked);
        },
        children: jsx("span", { className: "sc-toggle-knob" }),
      });
    }

    function StatusMark(props) {
      var server = props.server;
      var t = props.t;
      if (server.status === "disabled") {
        return jsx("span", {
          className: "sc-status sc-status-off",
          title: t("statusDisabled"),
          children: "Ø",
        });
      }
      if (server.status === "connected") {
        return jsx(
          "span",
          { className: "sc-status sc-status-ok", title: t("statusConnected") },
          jsx(IconCheckOutline16, { size: 16 }),
        );
      }
      if (server.status === "connecting") {
        return jsx(
          "span",
          { className: "sc-status sc-status-err", title: t("statusConnecting") },
          jsx(IconLoadingOutline16, { size: 16, className: "sc-spin" }),
        );
      }
      return jsx(
        "span",
        {
          className: "sc-status sc-status-err",
          title: server.error ? t("statusError") + "：" + server.error : t("statusError"),
        },
        jsx(IconWarningOutline16, { size: 14 }),
      );
    }

    function serverToJson(server) {
      var cfg = {};
      if (server.transport === "stdio") {
        cfg.transport = "stdio";
        cfg.serverName = server.serverName;
        cfg.command = server.command;
        cfg.args = server.args;
        if (server.env && Object.keys(server.env).length) cfg.env = server.env;
        if (server.cwd) cfg.cwd = server.cwd;
      } else {
        cfg.transport = "streamable-http";
        cfg.serverName = server.serverName;
        cfg.url = server.url;
        if (server.headers && Object.keys(server.headers).length) cfg.headers = server.headers;
      }
      return cfg;
    }

    // =====================================================================
    // MCP add/edit modal
    // =====================================================================
    function AddMcpModal(props) {
      var t = props.t;
      var editing = props.editing;
      var [text, setText] = useState(editing ? JSON.stringify(serverToJson(editing), null, 2) : "");
      var [error, setError] = useState(null);
      var [busy, setBusy] = useState(false);

      useEffect(
        function () {
          if (props.open) {
            setText(editing ? JSON.stringify(serverToJson(editing), null, 2) : "");
            setError(null);
            setBusy(false);
          }
        },
        [props.open, editing],
      );

      if (!props.open) return null;

      function confirm() {
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          setError(t("badJson") + String(err && err.message ? err.message : err));
          return;
        }
        setBusy(true);
        setError(null);
        props.onConfirm(parsed).then(
          function (res) {
            setBusy(false);
            if (res && res.ok) {
              props.onDone();
              return;
            }
            setError(t("addFailed") + (res && res.error ? res.error : "unknown"));
          },
          function (err) {
            setBusy(false);
            setError(t("addFailed") + String(err && err.message ? err.message : err));
          },
        );
      }

      return jsx(
        Modal,
        {
          open: true,
          className: "sc-modal-wide",
          onClose: props.onClose,
          title: editing ? t("editTitle") : t("addTitle"),
          description: t("addDesc"),
          footer: jsxs(
            "div",
            {
              className: "sc-modal-foot",
              children: [
                jsx(
                  "button",
                  { type: "button", className: "sc-btn", onClick: props.onClose, children: t("cancel") },
                ),
                jsx(
                  "button",
                  {
                    type: "button",
                    className: "sc-btn sc-btn-primary",
                    disabled: busy || !text.trim(),
                    onClick: confirm,
                    children: t("confirm"),
                  },
                ),
              ],
            },
          ),
          children: jsxs(
            "div",
            {
              className: "sc-form",
              children: [
                jsxs(
                  "div",
                  {
                    className: "sc-field",
                    children: [
                      jsx("label", { className: "sc-label", children: t("jsonLabel") }),
                      jsx("textarea", {
                        className: "sc-textarea sc-json-input",
                        value: text,
                        spellCheck: false,
                        placeholder: t("jsonPlaceholder"),
                        onChange: function (e) {
                          setText(e.target.value);
                        },
                      }),
                      error ? jsx("p", { className: "sc-error", role: "alert", children: error }) : null,
                    ],
                  },
                ),
              ],
            },
          ),
        },
      );
    }

    // =====================================================================
    // create-skill modal (图3)
    // =====================================================================
    function CreateSkillModal(props) {
      var t = props.t;
      var [name, setName] = useState("");
      var [description, setDescription] = useState("");
      var [instructions, setInstructions] = useState("");
      var [file, setFile] = useState(null);
      var [parsing, setParsing] = useState(false);
      var [parseState, setParseState] = useState(null); // { ok, error } | null
      var [dragging, setDragging] = useState(false);
      var [busy, setBusy] = useState(false);
      var [error, setError] = useState(null);
      var inputRef = useRef(null);

      useEffect(
        function () {
          if (props.open) {
            setName("");
            setDescription("");
            setInstructions("");
            setFile(null);
            setParsing(false);
            setParseState(null);
            setBusy(false);
            setError(null);
          }
        },
        [props.open],
      );

      if (!props.open) return null;

      function handleFile(f) {
        if (!f) return;
        setParsing(true);
        setParseState(null);
        setError(null);
        readFileAsBase64(f).then(function (b64) {
          setFile({ name: f.name, base64: b64 });
          return props.onParse({ fileName: f.name, dataBase64: b64 });
        }).then(
          function (res) {
            setParsing(false);
            if (res && res.ok && res.parsed) {
              setParseState({ ok: true });
              if (res.parsed.name) setName(res.parsed.name);
              if (res.parsed.description) setDescription(res.parsed.description);
              if (res.parsed.instructions) setInstructions(res.parsed.instructions);
            } else {
              setParseState({ ok: false, error: (res && res.error) || "parse failed" });
            }
          },
          function (err) {
            setParsing(false);
            setParseState({ ok: false, error: String(err && err.message ? err.message : err) });
          },
        );
      }

      var valid = name.trim() !== "" && description.trim() !== "" && instructions.trim() !== "" && !busy;

      function confirm() {
        setBusy(true);
        setError(null);
        props.onConfirm({
          name: name,
          description: description,
          instructions: instructions,
          fileName: file ? file.name : undefined,
          dataBase64: file ? file.base64 : undefined,
        }).then(
          function (res) {
            setBusy(false);
            if (res && res.ok) {
              props.onDone();
              return;
            }
            setError(t("createFailed") + (res && res.error ? res.error : "unknown"));
          },
          function (err) {
            setBusy(false);
            setError(t("createFailed") + String(err && err.message ? err.message : err));
          },
        );
      }

      return jsx(
        Modal,
        {
          open: true,
          className: "sc-modal-wide",
          onClose: props.onClose,
          title: t("createSkillTitle"),
          closeLabel: t("cancel"),
          footer: jsxs(
            "div",
            {
              className: "sc-modal-foot",
              children: [
                jsx(
                  "button",
                  { type: "button", className: "sc-btn", onClick: props.onClose, children: t("cancel") },
                ),
                jsx(
                  "button",
                  {
                    type: "button",
                    className: "sc-btn sc-btn-primary",
                    disabled: !valid,
                    onClick: confirm,
                    children: t("confirm"),
                  },
                ),
              ],
            },
          ),
          children: jsxs(
            "div",
            {
              className: "sc-form",
              children: [
                jsxs(
                  "div",
                  {
                    className: "sc-dropzone" + (dragging ? " sc-dropzone-active" : ""),
                    onClick: function () {
                      if (inputRef.current) inputRef.current.click();
                    },
                    onDragOver: function (e) {
                      e.preventDefault();
                      setDragging(true);
                    },
                    onDragLeave: function () {
                      setDragging(false);
                    },
                    onDrop: function (e) {
                      e.preventDefault();
                      setDragging(false);
                      handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
                    },
                    children: [
                      jsx(IconArchiveOutline20, { size: 20 }),
                      jsx("div", { className: "sc-dropzone-title", children: t("uploadTitle") }),
                      jsx("div", { className: "sc-dropzone-hint", children: t("uploadHint") }),
                      parsing
                        ? jsx("div", { className: "sc-parse-note", children: t("uploading") })
                        : null,
                      parseState && parseState.ok
                        ? jsx("div", { className: "sc-parse-note sc-parse-ok", children: "✓ " + t("uploadParsed") })
                        : null,
                      parseState && !parseState.ok
                        ? jsx("div", { className: "sc-parse-note sc-parse-bad", children: t("uploadParseFail") + parseState.error })
                        : null,
                      file
                        ? jsxs(
                            "div",
                            {
                              className: "sc-file",
                              onClick: function (e) {
                                e.stopPropagation();
                              },
                              children: [
                                t("fileNameLabel"),
                                file.name,
                                " · ",
                                jsx(
                                  "span",
                                  {
                                    className: "sc-file-reselect",
                                    onClick: function (e) {
                                      e.stopPropagation();
                                      if (inputRef.current) inputRef.current.click();
                                    },
                                    children: t("reselect"),
                                  },
                                ),
                              ],
                            },
                          )
                        : null,
                    ],
                  },
                ),
                jsx("input", {
                  ref: inputRef,
                  type: "file",
                  accept: ".zip,.skill,.md",
                  style: { display: "none" },
                  onChange: function (e) {
                    handleFile(e.target.files && e.target.files[0]);
                    e.target.value = "";
                  },
                }),
                jsxs(
                  "div",
                  {
                    className: "sc-field",
                    children: [
                      jsxs(
                        "label",
                        {
                          className: "sc-label",
                          children: [jsx("span", { className: "sc-required", children: "*" }), t("fieldName")],
                        },
                      ),
                      jsx("input", {
                        className: "sc-input",
                        value: name,
                        placeholder: t("fieldNamePh"),
                        onChange: function (e) {
                          setName(e.target.value);
                        },
                      }),
                      jsx("div", { className: "sc-hint", children: t("fieldNameHint") }),
                    ],
                  },
                ),
                jsxs(
                  "div",
                  {
                    className: "sc-field",
                    children: [
                      jsxs(
                        "label",
                        {
                          className: "sc-label",
                          children: [jsx("span", { className: "sc-required", children: "*" }), t("fieldDescription")],
                        },
                      ),
                      jsx("textarea", {
                        className: "sc-textarea",
                        value: description,
                        placeholder: t("fieldDescriptionPh"),
                        onChange: function (e) {
                          setDescription(e.target.value);
                        },
                      }),
                    ],
                  },
                ),
                jsxs(
                  "div",
                  {
                    className: "sc-field",
                    children: [
                      jsxs(
                        "label",
                        {
                          className: "sc-label",
                          children: [jsx("span", { className: "sc-required", children: "*" }), t("fieldInstructions")],
                        },
                      ),
                      jsx("textarea", {
                        className: "sc-textarea sc-textarea-big",
                        value: instructions,
                        placeholder: t("fieldInstructionsPh"),
                        onChange: function (e) {
                          setInstructions(e.target.value);
                        },
                      }),
                    ],
                  },
                ),
                error ? jsx("p", { className: "sc-error", role: "alert", children: error }) : null,
              ],
            },
          ),
        },
      );
    }

    // =====================================================================
    // edit-skill modal
    // =====================================================================
    function EditSkillModal(props) {
      var t = props.t;
      var skill = props.skill;
      var [name, setName] = useState(skill ? skill.name : "");
      var [description, setDescription] = useState(skill ? skill.description || "" : "");
      var [instructions, setInstructions] = useState("");
      var [busy, setBusy] = useState(false);
      var [error, setError] = useState(null);
      var [loaded, setLoaded] = useState(false);

      useEffect(
        function () {
          if (!props.open || !skill) return;
          setName(skill.name);
          setDescription(skill.description || "");
          setInstructions("");
          setError(null);
          setBusy(false);
          setLoaded(false);
          // load the full instructions body for editing
          post("/plugins/skill-config/skills.read", { name: skill.name }).then(
            function (res) {
              if (res && res.ok && typeof res.instructions === "string") setInstructions(res.instructions);
              setLoaded(true);
            },
            function () {
              setLoaded(true);
            },
          );
        },
        [props.open, skill],
      );

      if (!props.open || !skill) return null;

      var valid = name.trim() !== "" && description.trim() !== "" && !busy;

      function confirm() {
        setBusy(true);
        setError(null);
        props.onConfirm({
          name: skill.name,
          newName: name,
          description: description,
          instructions: instructions,
        }).then(
          function (res) {
            setBusy(false);
            if (res && res.ok) {
              props.onDone();
              return;
            }
            setError(t("editSkillFailed") + (res && res.error ? res.error : "unknown"));
          },
          function (err) {
            setBusy(false);
            setError(t("editSkillFailed") + String(err && err.message ? err.message : err));
          },
        );
      }

      return jsx(
        Modal,
        {
          open: true,
          className: "sc-modal-wide",
          onClose: props.onClose,
          title: t("editSkillTitle"),
          closeLabel: t("cancel"),
          footer: jsxs(
            "div",
            {
              className: "sc-modal-foot",
              children: [
                jsx(
                  "button",
                  { type: "button", className: "sc-btn", onClick: props.onClose, children: t("cancel") },
                ),
                jsx(
                  "button",
                  {
                    type: "button",
                    className: "sc-btn sc-btn-primary",
                    disabled: !valid || !loaded,
                    onClick: confirm,
                    children: t("confirm"),
                  },
                ),
              ],
            },
          ),
          children: jsxs(
            "div",
            {
              className: "sc-form",
              children: [
                jsxs(
                  "div",
                  {
                    className: "sc-field",
                    children: [
                      jsxs(
                        "label",
                        {
                          className: "sc-label",
                          children: [jsx("span", { className: "sc-required", children: "*" }), t("fieldName")],
                        },
                      ),
                      jsx("input", {
                        className: "sc-input",
                        value: name,
                        placeholder: t("fieldNamePh"),
                        onChange: function (e) {
                          setName(e.target.value);
                        },
                      }),
                      jsx("div", { className: "sc-hint", children: t("fieldNameHint") }),
                    ],
                  },
                ),
                jsxs(
                  "div",
                  {
                    className: "sc-field",
                    children: [
                      jsxs(
                        "label",
                        {
                          className: "sc-label",
                          children: [jsx("span", { className: "sc-required", children: "*" }), t("fieldDescription")],
                        },
                      ),
                      jsx("textarea", {
                        className: "sc-textarea",
                        value: description,
                        placeholder: t("fieldDescriptionPh"),
                        onChange: function (e) {
                          setDescription(e.target.value);
                        },
                      }),
                    ],
                  },
                ),
                jsxs(
                  "div",
                  {
                    className: "sc-field",
                    children: [
                      jsx("label", { className: "sc-label", children: t("fieldInstructions") }),
                      jsx("textarea", {
                        className: "sc-textarea sc-textarea-big",
                        value: instructions,
                        placeholder: loaded ? t("fieldInstructionsPh") : t("uploading"),
                        onChange: function (e) {
                          setInstructions(e.target.value);
                        },
                      }),
                    ],
                  },
                ),
                error ? jsx("p", { className: "sc-error", role: "alert", children: error }) : null,
              ],
            },
          ),
        },
      );
    }

    // =====================================================================
    // delete confirmation modal (custom, replaces the native window.confirm)
    // =====================================================================
    function ConfirmModal(props) {
      var [busy, setBusy] = useState(false);
      var [error, setError] = useState(null);

      useEffect(
        function () {
          if (props.open) {
            setBusy(false);
            setError(null);
          }
        },
        [props.open],
      );

      if (!props.open) return null;

      function confirm() {
        setBusy(true);
        setError(null);
        Promise.resolve()
          .then(function () {
            return props.onConfirm();
          })
          .then(
            function (res) {
              setBusy(false);
              if (res && res.ok) {
                props.onDone();
                return;
              }
              setError((res && res.error) || "failed");
            },
            function (err) {
              setBusy(false);
              setError(String(err && err.message ? err.message : err));
            },
          );
      }

      return jsx(
        Modal,
        {
          open: true,
          onClose: function () {
            if (!busy) props.onCancel();
          },
          title: props.title,
          closeLabel: props.cancelLabel,
          footer: jsxs(
            "div",
            {
              className: "sc-modal-foot",
              children: [
                jsx(
                  "button",
                  {
                    type: "button",
                    className: "sc-btn",
                    disabled: busy,
                    onClick: props.onCancel,
                    children: props.cancelLabel,
                  },
                ),
                jsx(
                  "button",
                  {
                    type: "button",
                    className: "sc-btn sc-btn-danger-solid",
                    disabled: busy,
                    onClick: confirm,
                    children: props.confirmLabel,
                  },
                ),
              ],
            },
          ),
          children: jsxs(
            "div",
            {
              className: "sc-confirm-body",
              children: [
                jsx("p", { className: "sc-confirm-msg", children: props.message }),
                error ? jsx("p", { className: "sc-error", role: "alert", children: error }) : null,
              ],
            },
          ),
        },
      );
    }

    // =====================================================================
    // section component
    // =====================================================================
    function Section(props) {
      var t = props.t;
      var useStore = props.useStore;
      var state = useStore(function (s) {
        return s;
      });
      var [addOpen, setAddOpen] = useState(false);
      var [editing, setEditing] = useState(null);
      var [skillOpen, setSkillOpen] = useState(false);
      var [editingSkill, setEditingSkill] = useState(null);
      var [confirming, setConfirming] = useState(null); // { kind: "mcp"|"skill", target }
      var [legendOpen, setLegendOpen] = useState(false);
      var [notice, setNotice] = useState(null);

      useEffect(function () {
        props.refresh();
      }, []);

      useEffect(
        function () {
          if (!notice) return;
          var timer = setTimeout(function () {
            setNotice(null);
          }, 4000);
          return function () {
            clearTimeout(timer);
          };
        },
        [notice],
      );

      function openAdd(server) {
        setEditing(server || null);
        setAddOpen(true);
      }

      function onAddDone() {
        setAddOpen(false);
        setEditing(null);
        setNotice({ kind: "ok", text: t("mcpSaved") });
      }

      function confirmRemoveMcp(server) {
        setConfirming({ kind: "mcp", target: server });
      }

      function onToggleMcp(server) {
        props.toggleMcp(server).then(
          function (res) {
            if (!res || !res.ok) {
              setNotice({ kind: "error", text: t("toggleFailed") + (res && res.error ? res.error : "") });
            }
          },
          function (err) {
            setNotice({ kind: "error", text: t("toggleFailed") + String(err && err.message ? err.message : err) });
          },
        );
      }

      function onToggleSkill(skill) {
        props.toggleSkill(skill.name, !skill.enabled).then(
          function (res) {
            if (!res || !res.ok) {
              setNotice({ kind: "error", text: t("toggleFailed") + (res && res.error ? res.error : "") });
            }
          },
          function (err) {
            setNotice({ kind: "error", text: t("toggleFailed") + String(err && err.message ? err.message : err) });
          },
        );
      }

      function onSkillDone() {
        setSkillOpen(false);
        setNotice({ kind: "ok", text: t("createSaved") });
      }

      function onSkillEditDone() {
        setEditingSkill(null);
        setNotice({ kind: "ok", text: t("editSkillSaved") });
      }

      function confirmRemoveSkill(skill) {
        setConfirming({ kind: "skill", target: skill });
      }

      // ---- MCP block ----
      var mcpBlock = jsxs(
        "div",
        {
          className: "sc-block",
          children: [
            jsxs(
              "div",
              {
                className: "sc-block-head",
                children: [jsx("span", { className: "sc-block-title", children: t("mcpBlockTitle") })],
              },
            ),
            jsx("div", {
              className: "sc-group-label",
              children: t("serversTitle"),
            }),
            jsxs(
              "div",
              {
                className: "sc-card",
                children: [
                  jsxs(
                    "div",
                    {
                      className: "sc-card-head",
                      children: [
                        jsxs(
                          "div",
                          {
                            className: "sc-card-head-text",
                            children: [
                              jsx("div", { className: "sc-card-title", children: t("serversCardTitle") }),
                              jsx("div", { className: "sc-card-desc", children: t("serversCardDesc") }),
                            ],
                          },
                        ),
                        jsxs(
                          "div",
                          {
                            className: "sc-card-actions",
                            children: [
                              jsx(
                                "button",
                                {
                                  type: "button",
                                  className: "sc-icon-btn",
                                  title: t("refresh"),
                                  onClick: function () {
                                    props.refresh();
                                  },
                                  children: jsx(IconRefreshOutline16, { size: 16 }),
                                },
                              ),
                              jsx(
                                "button",
                                {
                                  type: "button",
                                  className: "sc-add-btn",
                                  onClick: function () {
                                    openAdd(null);
                                  },
                                  children: [
                                    jsx(IconPlusOutline16, { size: 14 }),
                                    t("add"),
                                  ],
                                },
                              ),
                            ],
                          },
                        ),
                      ],
                    },
                  ),
                  state.servers.length === 0
                    ? jsx("p", { className: "sc-empty", children: t("serversEmpty") })
                    : jsx(
                        "ul",
                        {
                          className: "sc-rows",
                          children: state.servers.map(function (server) {
                            return jsx(
                              "li",
                              {
                                key: server.id,
                                className: "sc-rowwrap",
                                children: [
                                  jsxs(
                                    "div",
                                    {
                                      className: "sc-row",
                                      children: [
                                        jsx(
                                          "span",
                                          {
                                            className: "sc-icon",
                                            style: { background: iconColor(server.serverName) },
                                            children: String(server.serverName).charAt(0).toUpperCase(),
                                          },
                                        ),
                                        jsxs(
                                          "span",
                                          {
                                            className: "sc-name",
                                            children: [
                                              server.serverName,
                                              server.source === "project"
                                                ? jsx("span", { className: "sc-badge", children: t("statusProject") })
                                                : null,
                                              server.source === "cordis"
                                                ? jsx("span", { className: "sc-badge", children: "cordis.yml" })
                                                : null,
                                            ],
                                          },
                                        ),
                                        jsx(StatusMark, { server: server, t: t }),
                                        server.source === "user"
                                          ? jsx(
                                              "button",
                                              {
                                                type: "button",
                                                className: "sc-del-btn",
                                                title: t("detailEdit"),
                                                onClick: function () {
                                                  openAdd(server);
                                                },
                                                children: jsx(IconEditOutline16, { size: 14 }),
                                              },
                                            )
                                          : null,
                                        jsx(Toggle, {
                                          checked: server.enabled,
                                          onChange: function () {
                                            onToggleMcp(server);
                                          },
                                        }),
                                        server.source === "user"
                                          ? jsx(
                                              "button",
                                              {
                                                type: "button",
                                                className: "sc-del-btn",
                                                title: t("detailRemove"),
                                                onClick: function () {
                                                  confirmRemoveMcp(server);
                                                },
                                                children: jsx(IconTrashOutline16, { size: 14 }),
                                              },
                                            )
                                          : null,
                                      ],
                                    },
                                  ),
                                ],
                              },
                            );
                          }),
                        },
                      ),
                ],
              },
            ),
          ],
        },
      );

      // ---- skills block ----
      var skillsBlock = jsxs(
        "div",
        {
          className: "sc-block",
          children: [
            jsxs(
              "div",
              {
                className: "sc-block-head",
                children: [jsx("span", { className: "sc-block-title", children: t("skillsBlockTitle") })],
              },
            ),
            jsxs(
              "div",
              {
                className: "sc-card",
                children: [
                  jsxs(
                    "div",
                    {
                      className: "sc-card-head",
                      children: [
                        jsxs(
                          "div",
                          {
                            className: "sc-card-head-text",
                            children: [
                              jsx("div", { className: "sc-card-title", children: t("skillsCardTitle") }),
                              jsx("div", { className: "sc-card-desc", children: t("skillsCardDesc") }),
                            ],
                          },
                        ),
                        jsx(
                          "button",
                          {
                            type: "button",
                            className: "sc-add-btn",
                            onClick: function () {
                              setSkillOpen(true);
                            },
                            children: [jsx(IconPlusOutline16, { size: 14 }), t("createSkill")],
                          },
                        ),
                      ],
                    },
                  ),
                  state.skills.length === 0
                    ? jsx("p", { className: "sc-empty", children: t("skillsEmpty") })
                    : jsx(
                        "ul",
                        {
                          className: "sc-rows",
                          children: state.skills.map(function (skill) {
                            return jsxs(
                              "li",
                              {
                                key: skill.name,
                                className: "sc-rowwrap",
                                children: [
                                  jsxs(
                                    "div",
                                    {
                                      className: "sc-skill-row" + (skill.enabled === false ? " sc-skill-row-off" : ""),
                                      children: [
                                        jsx("span", { className: "sc-skill-icon" }, jsx(IconSkillOutline16, { size: 16 })),
                                        jsxs(
                                          "span",
                                          {
                                            className: "sc-skill-text",
                                            children: [
                                              jsx("div", { className: "sc-skill-name", children: skill.name }),
                                              skill.description
                                                ? jsx("div", { className: "sc-skill-desc", children: skill.description })
                                                : null,
                                            ],
                                          },
                                        ),
                                        jsx(
                                          "button",
                                          {
                                            type: "button",
                                            className: "sc-del-btn",
                                            title: t("editSkill"),
                                            onClick: function () {
                                              setEditingSkill(skill);
                                            },
                                            children: jsx(IconEditOutline16, { size: 14 }),
                                          },
                                        ),
                                        jsx(Toggle, {
                                          checked: skill.enabled !== false,
                                          title: skill.enabled === false ? t("statusDisabled") : undefined,
                                          onChange: function () {
                                            onToggleSkill(skill);
                                          },
                                        }),
                                        jsx(
                                          "button",
                                          {
                                            type: "button",
                                            className: "sc-del-btn",
                                            title: t("detailRemove"),
                                            onClick: function () {
                                              confirmRemoveSkill(skill);
                                            },
                                            children: jsx(IconTrashOutline16, { size: 14 }),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                                ],
                              },
                            );
                          }),
                        },
                      ),
                ],
              },
            ),
          ],
        },
      );

      var body = null;
      if (state.status === "error") {
        body = jsxs(
          "div",
          {
            className: "sc-errorbox",
            role: "alert",
            children: [
              jsx(IconWarningOutline16, { size: 14 }),
              t("loadFailed"),
              state.error || "",
              jsx(
                "button",
                {
                  type: "button",
                  className: "sc-retry",
                  onClick: function () {
                    props.refresh();
                  },
                  children: t("refresh"),
                },
              ),
            ],
          },
        );
      } else if (state.status === "idle" || state.status === "loading") {
        body = jsx("div", { className: "sc-loading", children: t("uploading") });
      }

      return jsxs(
        "div",
        {
          className: "sc-root",
          children: [
            jsx("h2", { className: "sc-title", children: t("nav") }),
            jsx("p", { className: "sc-intro", children: t("sectionIntro") }),
            jsxs(
              "div",
              {
                className: "sc-legend" + (legendOpen ? " sc-legend-open" : ""),
                children: [
                  jsxs(
                    "button",
                    {
                      type: "button",
                      className: "sc-legend-head",
                      "aria-expanded": legendOpen,
                      onClick: function () {
                        setLegendOpen(function (v) {
                          return !v;
                        });
                      },
                      children: [
                        legendOpen
                          ? jsx(IconChevronDownOutline14, { size: 14 })
                          : jsx(IconChevronRightOutline14, { size: 14 }),
                        jsx("span", { className: "sc-legend-title", children: t("legendTitle") }),
                        legendOpen
                          ? null
                          : jsx("span", { className: "sc-legend-closed-hint", children: t("legendCollapsedHint") }),
                      ],
                    },
                  ),
                  legendOpen
                    ? jsxs(
                        React.Fragment,
                        {
                          children: [
                            jsxs("div", { className: "sc-legend-row", children: [jsx("span", { className: "sc-legend-badge sc-legend-badge-instant", children: t("legendInstant") }), t("legendL1")] }),
                            jsxs("div", { className: "sc-legend-row", children: [jsx("span", { className: "sc-legend-badge sc-legend-badge-instant", children: t("legendInstant") }), t("legendL2")] }),
                            jsxs("div", { className: "sc-legend-row", children: [jsx("span", { className: "sc-legend-badge sc-legend-badge-instant", children: t("legendInstant") }), t("legendL3")] }),
                            jsxs("div", { className: "sc-legend-row", children: [jsx("span", { className: "sc-legend-badge sc-legend-badge-restart", children: t("legendRestart") }), t("legendL4")] }),
                          ],
                        },
                      )
                    : null,
                ],
              },
            ),
            notice
              ? jsx(
                  "div",
                  {
                    className: "sc-errorbox",
                    style: notice.kind === "error" ? undefined : { color: "var(--dsw-alias-state-success-primary)" },
                    children: notice.text,
                  },
                )
              : null,
            body === null ? jsxs(React.Fragment, { children: [mcpBlock, skillsBlock] }) : body,
            jsx(AddMcpModal, {
              open: addOpen,
              editing: editing,
              t: t,
              onClose: function () {
                setAddOpen(false);
                setEditing(null);
              },
              onConfirm: function (parsed) {
                return props.addMcp(parsed);
              },
              onDone: onAddDone,
            }),
            jsx(CreateSkillModal, {
              open: skillOpen,
              t: t,
              onClose: function () {
                setSkillOpen(false);
              },
              onParse: function (payload) {
                return props.parseSkillFile(payload);
              },
              onConfirm: function (payload) {
                return props.createSkill(payload);
              },
              onDone: onSkillDone,
            }),
            jsx(EditSkillModal, {
              open: editingSkill !== null,
              skill: editingSkill,
              t: t,
              onClose: function () {
                setEditingSkill(null);
              },
              onConfirm: function (payload) {
                return props.updateSkill(payload);
              },
              onDone: onSkillEditDone,
            }),
            jsx(ConfirmModal, {
              open: confirming !== null,
              title: t("confirmDeleteTitle"),
              message: confirming
                ? confirming.kind === "mcp"
                  ? t("removeMcpConfirm") + confirming.target.serverName + t("removeMcpConfirmSuffix")
                  : t("removeSkillConfirm") + confirming.target.name + t("removeSkillConfirmSuffix")
                : "",
              cancelLabel: t("cancel"),
              confirmLabel: t("detailRemove"),
              onCancel: function () {
                setConfirming(null);
              },
              onConfirm: function () {
                if (!confirming) return Promise.resolve({ ok: false, error: "no target" });
                return confirming.kind === "mcp"
                  ? props.removeMcp(confirming.target.id)
                  : props.removeSkill(confirming.target.name);
              },
              onDone: function () {
                setConfirming(null);
                setNotice({ kind: "ok", text: t("removedSaved") });
              },
            }),
          ],
        },
      );
    }

    // =====================================================================
    // plugin body
    // =====================================================================
    var inject = ["slots", "locale"];

    function apply(ctx) {
      ensureStyle();
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-skill-config: dictionaries");

      ctx.on("connection/reset", function () {
        if (reloadHook) reloadHook();
      });

      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "skill-config",
            order: 30,
            label: function () {
              return ctx.locale.bind(NS)("nav");
            },
            locale: NS,
            store: storeHandle,
            inject: injected,
          },
          Section,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
