/**
 * dsh-skill-config — Host side.
 *
 * Adds a "技能配置" (Skill Configuration) settings page to the DSH web app:
 *
 *  • MCP 管理 — user-supplied JSON (standard `mcpServers` shape, or a single
 *    server object) is converted host-side into `@deepseek-ai/dsh-mcp-client`
 *    instances and started/stopped LIVE through `ctx.plugin()`. Configs
 *    persist under `<dsh-home>/plugins/dsh-skill-config/state.json` and are
 *    re-created at boot. Optional project-level import reads
 *    `.trae/mcp.json` / `.dsh/mcp.json` from workspace roots.
 *
 *  • 技能管理 — uploads (zip / .skill / .md) are parsed into the
 *    name/description/instructions form, and skills are written into
 *    `<dsh-home>/skills/<name>/SKILL.md` (the directory format the
 *    dsh-skill-filesystem provider watches).
 *
 * The browser half reaches this file through same-origin POST routes under
 * `/plugins/skill-config/*` registered on the `webServer` service.
 */
import { mkdir, readFile, writeFile, readdir, rm, rename, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
import { stringify as stringifyYaml } from "yaml";
import {
  extractZip,
  parseFrontmatter,
  parseSkillDoc,
  parseSkillUpload,
  normalizeMcpInput,
  slugifyName,
  hashString,
  SKILL_NAME_PATTERN,
} from "./core.js";

export const name = "skill-config";

const ROUTE_PREFIX = "/plugins/skill-config";
const MAX_BODY_BYTES = 32 * 1024 * 1024; // skill archives can be a few MB
const STATUS_POLL_MS = 10000;

export function apply(ctx) {
  ctx.inject(["webServer"], (scope) => {
    mount(scope).catch((error) => {
      // Never break the include hot-apply: report and keep the app alive.
      scope.logger.warn(`skill-config: setup failed: ${error?.message ?? error}`);
    });
  });
}

async function mount(scope) {
  const dshHome = resolveDshHome();
  const stateDir = join(dshHome, "plugins", "dsh-skill-config");
  const stateFile = join(stateDir, "state.json");
  const skillsDir = join(dshHome, "skills");

  // ------------------------------------------------------------------
  // durable state: { projectMcp: { enabled }, servers: [ user entries ] }
  // ------------------------------------------------------------------
  let state = { projectMcp: { enabled: false, disabled: [] }, servers: [], cordisDisabled: [] };

  async function loadState() {
    try {
      const raw = JSON.parse(await readFile(stateFile, "utf8"));
      state = {
        projectMcp:
          raw && typeof raw.projectMcp === "object" && raw.projectMcp !== null
            ? {
                enabled: raw.projectMcp.enabled === true,
                disabled: Array.isArray(raw.projectMcp.disabled) ? raw.projectMcp.disabled : [],
              }
            : { enabled: false, disabled: [] },
        servers: Array.isArray(raw?.servers) ? raw.servers : [],
        cordisDisabled: Array.isArray(raw?.cordisDisabled) ? raw.cordisDisabled : [],
      };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        scope.logger.warn(`skill-config: state load failed, starting fresh: ${error?.message ?? error}`);
      }
    }
  }

  async function saveState() {
    await mkdir(stateDir, { recursive: true });
    const tmp = `${stateFile}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await rename(tmp, stateFile);
  }

  // ------------------------------------------------------------------
  // live MCP instances (user + project)
  // ------------------------------------------------------------------
  const userRunning = new Map(); // id -> { config, fiber, status, error }
  const projectRunning = new Map(); // id -> { config, fiber, status, error, file }

  function mcpConfigOf(entry) {
    const config = {
      serverName: entry.serverName,
      transport: entry.transport,
    };
    if (entry.transport === "stdio") {
      config.command = entry.command;
      config.args = Array.isArray(entry.args) ? entry.args : [];
      config.env = entry.env && typeof entry.env === "object" ? entry.env : {};
      config.cwd = typeof entry.cwd === "string" ? entry.cwd : "";
    } else {
      config.url = entry.url;
      config.headers = entry.headers && typeof entry.headers === "object" ? entry.headers : {};
    }
    if (Number.isFinite(entry.toolCallTimeoutMs)) config.toolCallTimeoutMs = entry.toolCallTimeoutMs;
    return config;
  }

  function toolsForServer(serverName) {
    try {
      const tools = scope.get("tools");
      const view = tools && typeof tools.view === "function" ? tools.view(void 0) : void 0;
      if (!view || !view.knownNames) return false;
      const prefix = `mcp__${serverName}__`;
      for (const name of view.knownNames) if (name.startsWith(prefix)) return true;
    } catch {
      /* tools service absent — keep previous status */
    }
    return false;
  }

  function startServer(registry, id, config) {
    const existing = registry.get(id);
    if (existing) return existing;
    const rec = { config, fiber: null, status: "connecting", error: null };
    registry.set(id, rec);
    let fiber;
    try {
      fiber = scope.plugin(mcpClient, config);
    } catch (error) {
      rec.status = "error";
      rec.error = String(error?.message ?? error);
      return rec;
    }
    rec.fiber = fiber;
    fiber.then(
      () => {
        if (registry.get(id) !== rec) return;
        const ok = toolsForServer(config.serverName);
        rec.status = ok ? "connected" : "error";
        rec.error = ok ? null : "连接失败或工具未同步，后台正在自动重试";
      },
      (error) => {
        if (registry.get(id) !== rec) return;
        rec.status = "error";
        rec.error = String(error?.message ?? error);
      },
    );
    return rec;
  }

  async function stopServer(registry, id) {
    const rec = registry.get(id);
    if (!rec) return;
    registry.delete(id);
    if (rec.fiber) {
      try {
        await rec.fiber.dispose();
      } catch {
        /* already disposing */
      }
    }
  }

  // periodic status recovery (reconnect can succeed after the first failure)
  const poll = setInterval(() => {
    for (const rec of userRunning.values()) {
      if (rec.fiber && rec.status === "error" && toolsForServer(rec.config.serverName)) {
        rec.status = "connected";
        rec.error = null;
      }
    }
    for (const rec of projectRunning.values()) {
      if (rec.fiber && rec.status === "error" && toolsForServer(rec.config.serverName)) {
        rec.status = "connected";
        rec.error = null;
      }
    }
  }, STATUS_POLL_MS);
  poll.unref();

  // ------------------------------------------------------------------
  // project-level MCP (".trae/mcp.json" / ".dsh/mcp.json")
  // ------------------------------------------------------------------
  async function projectRoots() {
    const roots = [];
    try {
      const registry = scope.get("workspaceRegistry");
      if (registry && typeof registry.list === "function") {
        for (const entity of registry.list()) {
          if (entity && typeof entity.path === "string") roots.push(entity.path);
        }
      }
    } catch {
      /* workspace registry unavailable */
    }
    try {
      roots.push(process.cwd());
    } catch {
      /* never */
    }
    return [...new Set(roots)];
  }

  async function scanProjectFiles() {
    const found = new Map(); // id -> { config, file }
    if (!state.projectMcp.enabled) return found;
    for (const root of await projectRoots()) {
      for (const fileName of [".trae/mcp.json", ".dsh/mcp.json"]) {
        const path = join(root, fileName);
        let raw;
        try {
          raw = JSON.parse(await readFile(path, "utf8"));
        } catch (error) {
          if (error?.code === "ENOENT") continue;
          scope.logger.warn(`skill-config: cannot read ${path}: ${error?.message ?? error}`);
          continue;
        }
        let normalized;
        try {
          normalized = normalizeMcpInput(raw);
        } catch (error) {
          scope.logger.warn(`skill-config: invalid project MCP config ${path}: ${error?.message ?? error}`);
          continue;
        }
        for (const config of normalized) {
          if ((state.projectMcp.disabled || []).includes(config.serverName)) continue;
          const id = `project:${hashString(`${root}|${fileName}|${config.serverName}`)}:${config.serverName}`;
          if (!found.has(id)) found.set(id, { config, file: path });
        }
      }
    }
    return found;
  }

  async function syncProjectMcp() {
    const wanted = await scanProjectFiles();
    for (const [id] of [...projectRunning]) {
      if (!wanted.has(id)) await stopServer(projectRunning, id);
    }
    for (const [id, entry] of wanted) {
      const current = projectRunning.get(id);
      if (!current) {
        startServer(projectRunning, id, entry.config);
        continue;
      }
      if (JSON.stringify(current.config) !== JSON.stringify(entry.config)) {
        await stopServer(projectRunning, id);
        startServer(projectRunning, id, entry.config);
      }
    }
  }

  // ------------------------------------------------------------------
  // MCP servers configured as mcp-client entries in cordis.patch.yml
  // (discovered from the live loader tree; toggled at runtime without
  //  rewriting the user's patch file)
  // ------------------------------------------------------------------
  function cordisMcpEntries() {
    const out = [];
    try {
      const loader = scope.get("loader");
      if (!loader || typeof loader.entries !== "function") return out;
      for (const entry of loader.entries()) {
        const options = entry.options;
        if (!options || options.name !== "@deepseek-ai/dsh-mcp-client" || options.group) continue;
        const cfg = options.config;
        if (!cfg || typeof cfg.serverName !== "string") continue;
        const active = !entry.disabled && entry.fiber !== void 0;
        const connected = active && toolsForServer(cfg.serverName);
        const pub = {
          id: `cordis:${options.id}`,
          entryId: options.id,
          serverName: cfg.serverName,
          transport: cfg.transport === "streamable-http" ? "streamable-http" : "stdio",
          enabled: !entry.disabled,
          source: "cordis",
          status: entry.disabled ? "disabled" : connected ? "connected" : active ? "connecting" : "error",
          error: null,
        };
        if (pub.transport === "stdio") {
          pub.command = cfg.command;
          pub.args = Array.isArray(cfg.args) ? cfg.args : [];
          pub.env = cfg.env && typeof cfg.env === "object" ? cfg.env : {};
          pub.cwd = typeof cfg.cwd === "string" ? cfg.cwd : "";
        } else {
          pub.url = cfg.url;
          pub.headers = cfg.headers && typeof cfg.headers === "object" ? cfg.headers : {};
        }
        out.push(pub);
      }
    } catch {
      /* loader unavailable — no cordis view */
    }
    return out;
  }

  function findCordisEntry(entryId) {
    try {
      const loader = scope.get("loader");
      if (!loader || typeof loader.entries !== "function") return void 0;
      return loader
        .entries()
        .find((entry) => entry.options && entry.options.id === entryId && entry.options.name === "@deepseek-ai/dsh-mcp-client");
    } catch {
      return void 0;
    }
  }

  async function toggleCordisEntry(entryId, enabled) {
    const entry = findCordisEntry(entryId);
    if (!entry) return { ok: false, error: `未找到 cordis 条目 "${entryId}"` };
    try {
      await entry.update({ disabled: !enabled });
    } catch (error) {
      return { ok: false, error: `切换失败: ${error?.message ?? error}` };
    }
    const list = state.cordisDisabled || (state.cordisDisabled = []);
    if (enabled) {
      const at = list.indexOf(entryId);
      if (at >= 0) list.splice(at, 1);
    } else if (!list.includes(entryId)) {
      list.push(entryId);
    }
    await saveState();
    return { ok: true };
  }

  async function toggleProjectServer(serverName, enabled) {
    const list = state.projectMcp.disabled || (state.projectMcp.disabled = []);
    if (enabled) {
      const at = list.indexOf(serverName);
      if (at >= 0) list.splice(at, 1);
    } else if (!list.includes(serverName)) {
      list.push(serverName);
    }
    await saveState();
    await syncProjectMcp();
    return { ok: true };
  }

  // re-apply persisted cordis disables after boot (entries settle asynchronously)
  async function applyCordisDisabled() {
    const wanted = new Set(state.cordisDisabled || []);
    for (let attempt = 0; attempt < 8 && wanted.size > 0; attempt++) {
      if (attempt > 0) await sleep(attempt * 1000);
      for (const entryId of [...wanted]) {
        const entry = findCordisEntry(entryId);
        if (!entry) continue;
        try {
          if (!entry.disabled) await entry.update({ disabled: true });
          wanted.delete(entryId);
        } catch {
          /* retry next round */
        }
      }
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ------------------------------------------------------------------
  // state projection
  // ------------------------------------------------------------------
  function publicServer(entry, registry, source) {
    const rec = registry.get(entry.id);
    const enabled = entry.enabled !== false;
    const pub = {
      id: entry.id,
      serverName: entry.serverName,
      transport: entry.transport,
      enabled,
      source,
      status: !enabled ? "disabled" : rec ? rec.status : "error",
      error: rec && rec.error ? rec.error : null,
    };
    if (entry.transport === "stdio") {
      pub.command = entry.command;
      pub.args = Array.isArray(entry.args) ? entry.args : [];
      pub.env = entry.env && typeof entry.env === "object" ? entry.env : {};
      pub.cwd = typeof entry.cwd === "string" ? entry.cwd : "";
    } else {
      pub.url = entry.url;
      pub.headers = entry.headers && typeof entry.headers === "object" ? entry.headers : {};
    }
    return pub;
  }

  /** Enabled = at least one invocation channel open (model or user). */
  function skillInvocationEnabled(frontmatter) {
    if (!frontmatter) return true;
    const modelInvocable = frontmatter["disable-model-invocation"] !== true;
    const userInvocable = frontmatter["user-invocable"] !== false;
    return modelInvocable || userInvocable;
  }

  async function listSkills() {
    const out = [];
    let entries = [];
    try {
      entries = await readdir(skillsDir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      try {
        if (entry.isDirectory()) {
          if (entry.name === ".system") continue;
          const path = join(skillsDir, entry.name, "SKILL.md");
          const doc = parseSkillDoc(await readFile(path, "utf8"));
          out.push({
            name: doc.name ?? entry.name,
            description: doc.description ?? "",
            directory: true,
            enabled: skillInvocationEnabled(doc.frontmatter),
          });
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const path = join(skillsDir, entry.name);
          const doc = parseSkillDoc(await readFile(path, "utf8"));
          out.push({
            name: doc.name ?? entry.name.replace(/\.md$/, ""),
            description: doc.description ?? "",
            directory: false,
            enabled: skillInvocationEnabled(doc.frontmatter),
          });
        }
      } catch {
        /* unreadable skill — skip */
      }
    }
    out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return out;
  }

  async function buildState() {
    await syncProjectMcp();
    const servers = [];
    for (const entry of state.servers) servers.push(publicServer(entry, userRunning, "user"));
    for (const [id, rec] of projectRunning) {
      servers.push({
        id,
        serverName: rec.config.serverName,
        transport: rec.config.transport,
        command: rec.config.transport === "stdio" ? rec.config.command : void 0,
        args: rec.config.transport === "stdio" ? rec.config.args : void 0,
        url: rec.config.transport === "streamable-http" ? rec.config.url : void 0,
        enabled: true,
        source: "project",
        file: rec.file,
        status: rec.status,
        error: rec.error,
      });
    }
    for (const server of cordisMcpEntries()) servers.push(server);
    return {
      projectMcp: { enabled: state.projectMcp.enabled },
      servers,
      skills: await listSkills(),
    };
  }

  // ------------------------------------------------------------------
  // endpoint handlers
  // ------------------------------------------------------------------
  async function mcpAdd(body) {
    const normalized = normalizeMcpInput(body.json);
    const results = [];
    for (const config of normalized) {
      const existing = state.servers.find((s) => s.serverName === config.serverName);
      if (existing) {
        const enabled = config.enabled === undefined ? existing.enabled : config.enabled;
        Object.assign(existing, config, { enabled: enabled !== false });
        results.push({ serverName: config.serverName, updated: true, error: null });
      } else {
        const entry = { id: `mcp-${hashString(config.serverName).slice(0, 8)}`, ...config, enabled: config.enabled !== false };
        state.servers.push(entry);
        results.push({ serverName: config.serverName, updated: false, error: null });
      }
    }
    await saveState();
    // (re)start / stop affected instances (restart when the config changed)
    for (const config of normalized) {
      const entry = state.servers.find((s) => s.serverName === config.serverName);
      const running = userRunning.get(entry.id);
      const changed = running && JSON.stringify(running.config) !== JSON.stringify(mcpConfigOf(entry));
      if (changed) await stopServer(userRunning, entry.id);
      if (entry.enabled) {
        startServer(userRunning, entry.id, mcpConfigOf(entry));
      } else {
        await stopServer(userRunning, entry.id);
      }
    }
    return { ok: true, results, state: await buildState() };
  }

  async function mcpRemove(body) {
    const id = String(body.id ?? "");
    const at = state.servers.findIndex((s) => s.id === id);
    if (at < 0) return { ok: false, error: `未找到服务器 "${id}"` };
    await stopServer(userRunning, id);
    state.servers.splice(at, 1);
    await saveState();
    return { ok: true, state: await buildState() };
  }

  async function mcpToggle(body) {
    const source = body.source === "cordis" || body.source === "project" ? body.source : "user";
    if (source === "cordis") {
      const result = await toggleCordisEntry(String(body.entryId ?? body.id ?? "").replace(/^cordis:/, ""), body.enabled !== false);
      if (!result.ok) return result;
      return { ok: true, state: await buildState() };
    }
    if (source === "project") {
      const result = await toggleProjectServer(String(body.serverName ?? ""), body.enabled !== false);
      if (!result.ok) return result;
      return { ok: true, state: await buildState() };
    }
    const id = String(body.id ?? "");
    const entry = state.servers.find((s) => s.id === id);
    if (!entry) return { ok: false, error: `未找到服务器 "${id}"` };
    entry.enabled = body.enabled !== false;
    await saveState();
    if (entry.enabled) startServer(userRunning, id, mcpConfigOf(entry));
    else await stopServer(userRunning, id);
    return { ok: true, state: await buildState() };
  }

  async function projectMcpSet(body) {
    state.projectMcp.enabled = body.enabled === true;
    await saveState();
    await syncProjectMcp();
    return { ok: true, state: await buildState() };
  }

  async function skillsParse(body) {
    const fileName = String(body.fileName ?? "");
    const data = String(body.dataBase64 ?? "");
    let buf;
    try {
      buf = Buffer.from(data, "base64");
    } catch {
      return { ok: false, error: "文件内容解码失败" };
    }
    return parseSkillUpload(fileName, buf);
  }

  async function skillsCreate(body) {
    let name = slugifyName(String(body.name ?? "").trim());
    if (!name && body.fileName) {
      name = slugifyName(basename(String(body.fileName)).replace(/\.(md|zip|skill)$/i, ""));
    }
    if (!SKILL_NAME_PATTERN.test(name)) {
      return { ok: false, error: '技能名称无效：仅支持小写字母、数字与连字符（如 "codemap"）' };
    }
    const description = String(body.description ?? "").trim();
    const instructions = String(body.instructions ?? "").trim();

    // optional archive resources from the upload
    let entries = null;
    if (body.fileName && body.dataBase64) {
      const lower = String(body.fileName).toLowerCase();
      if (lower.endsWith(".zip") || lower.endsWith(".skill")) {
        try {
          entries = extractZip(Buffer.from(String(body.dataBase64), "base64"));
        } catch (error) {
          return { ok: false, error: `压缩包解析失败: ${error?.message ?? error}` };
        }
      }
    }

    const target = join(skillsDir, name);
    const exists = await pathExists(target);
    if (exists && body.overwrite !== true) {
      return { ok: false, error: `技能 "${name}" 已存在；可先删除后再创建，或勾选覆盖更新` };
    }
    if (exists) await rm(target, { recursive: true, force: true });

    await mkdir(target, { recursive: true });
    if (entries) {
      for (const entry of entries) {
        if (entry.dir) continue;
        if (basename(entry.name) === "SKILL.md") continue; // regenerated from the form
        const dest = join(target, entry.name);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, entry.data);
      }
    }
    const skillMd =
      "---\n" +
      `name: ${name}\n` +
      `description: ${JSON.stringify(description || "（暂无描述）")}\n` +
      "---\n\n" +
      `${instructions}\n`;
    await writeFile(join(target, "SKILL.md"), skillMd, "utf8");
    return { ok: true, name, state: await buildState() };
  }

  async function skillsRemove(body) {
    const name = String(body.name ?? "").trim();
    if (!SKILL_NAME_PATTERN.test(name)) return { ok: false, error: `无效的技能名称 "${name}"` };
    let removed = false;
    const dir = join(skillsDir, name);
    if (await pathExists(dir)) {
      await rm(dir, { recursive: true, force: true });
      removed = true;
    }
    const flat = join(skillsDir, `${name}.md`);
    if (await pathExists(flat)) {
      await rm(flat, { force: true });
      removed = true;
    }
    if (!removed) return { ok: false, error: `未找到技能 "${name}"` };
    return { ok: true, state: await buildState() };
  }

  /**
   * Enable/disable a skill by rewriting its SKILL.md invocation frontmatter
   * (disable-model-invocation / user-invocable) — the same policy the skill
   * registry reads. The body is preserved verbatim.
   */
  async function skillsToggle(body) {
    const name = String(body.name ?? "").trim();
    if (!SKILL_NAME_PATTERN.test(name)) return { ok: false, error: `无效的技能名称 "${name}"` };
    const enable = body.enabled !== false;

    const dirPath = join(skillsDir, name, "SKILL.md");
    const flatPath = join(skillsDir, `${name}.md`);
    let path = null;
    if (await pathExists(dirPath)) path = dirPath;
    else if (await pathExists(flatPath)) path = flatPath;
    if (!path) return { ok: false, error: `未找到技能 "${name}"` };

    const raw = await readFile(path, "utf8");
    let fm = parseFrontmatter(raw);
    if (!fm) {
      // no frontmatter yet — synthesize one
      fm = { data: {}, body: raw.replace(/^\s+/, "") };
    }
    if (enable) {
      delete fm.data["disable-model-invocation"];
      delete fm.data["user-invocable"];
    } else {
      fm.data["disable-model-invocation"] = true;
      fm.data["user-invocable"] = false;
    }
    const rewritten =
      "---\n" + stringifyYaml(fm.data).replace(/\s+$/, "") + "\n---\n\n" + String(fm.body).trimStart() + "\n";
    await writeFile(path, rewritten, "utf8");
    return { ok: true, state: await buildState() };
  }

  /**
   * Read one skill's full document (name / description / instructions body)
   * for the edit dialog.
   */
  async function skillsRead(body) {
    const name = String(body.name ?? "").trim();
    if (!SKILL_NAME_PATTERN.test(name)) return { ok: false, error: `无效的技能名称 "${name}"` };
    const dirPath = join(skillsDir, name, "SKILL.md");
    const flatPath = join(skillsDir, `${name}.md`);
    let path = null;
    if (await pathExists(dirPath)) path = dirPath;
    else if (await pathExists(flatPath)) path = flatPath;
    if (!path) return { ok: false, error: `未找到技能 "${name}"` };
    const doc = parseSkillDoc(await readFile(path, "utf8"));
    return {
      ok: true,
      name: doc.name ?? name,
      description: doc.description ?? "",
      instructions: doc.instructions ?? "",
    };
  }

  /**
   * Edit a skill: rename (directory / flat file + frontmatter name) and/or
   * update description / instructions. Other frontmatter fields are kept.
   */
  async function skillsUpdate(body) {
    const name = String(body.name ?? "").trim();
    if (!SKILL_NAME_PATTERN.test(name)) return { ok: false, error: `无效的技能名称 "${name}"` };

    const dirPath = join(skillsDir, name, "SKILL.md");
    const flatPath = join(skillsDir, `${name}.md`);
    let path = null;
    let isFlat = false;
    if (await pathExists(dirPath)) path = dirPath;
    else if (await pathExists(flatPath)) {
      path = flatPath;
      isFlat = true;
    }
    if (!path) return { ok: false, error: `未找到技能 "${name}"` };

    // 新名称（可选）：自动规范化为小写连字符格式
    let newName = name;
    if (typeof body.newName === "string" && body.newName.trim() !== "") {
      const slug = slugifyName(body.newName);
      if (!slug) {
        return { ok: false, error: "新技能名称需包含字母或数字（将自动转为小写连字符格式，如 codemap）" };
      }
      newName = slug;
    }

    if (newName !== name) {
      const newDir = join(skillsDir, newName);
      const newFlat = join(skillsDir, `${newName}.md`);
      if ((await pathExists(newDir)) || (await pathExists(newFlat))) {
        return { ok: false, error: `技能 "${newName}" 已存在` };
      }
      if (isFlat) await rename(flatPath, newFlat);
      else await rename(dirname(path), newDir);
    }

    const targetPath = isFlat ? join(skillsDir, `${newName}.md`) : join(skillsDir, newName, "SKILL.md");
    const raw = await readFile(targetPath, "utf8");
    let fm = parseFrontmatter(raw);
    if (!fm) fm = { data: {}, body: raw.replace(/^\s+/, "") };
    fm.data.name = newName;
    fm.data.description = String(body.description ?? fm.data.description ?? "").trim();
    const instructions = String(body.instructions ?? fm.body ?? "").trim();
    const rewritten =
      "---\n" + stringifyYaml(fm.data).replace(/\s+$/, "") + "\n---\n\n" + instructions + "\n";
    await writeFile(targetPath, rewritten, "utf8");
    return { ok: true, state: await buildState() };
  }

  async function pathExists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async function dispatch(sub, body) {
    switch (sub) {
      case "":
      case "/state":
        return { ok: true, state: await buildState() };
      case "/mcp.add":
        return await mcpAdd(body);
      case "/mcp.remove":
        return await mcpRemove(body);
      case "/mcp.toggle":
        return await mcpToggle(body);
      case "/projectMcp.set":
        return await projectMcpSet(body);
      case "/skills.parse":
        return await skillsParse(body);
      case "/skills.create":
        return await skillsCreate(body);
      case "/skills.remove":
        return await skillsRemove(body);
      case "/skills.toggle":
        return await skillsToggle(body);
      case "/skills.read":
        return await skillsRead(body);
      case "/skills.update":
        return await skillsUpdate(body);
      default:
        return { ok: false, error: `未知端点 "${sub}"` };
    }
  }

  // ------------------------------------------------------------------
  // HTTP plumbing
  // ------------------------------------------------------------------
  function readJson(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error("请求体过大"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (chunks.length === 0) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
      req.on("error", reject);
    });
  }

  function send(res, status, payload) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(payload));
  }

  async function handle(req, res) {
    let pathname;
    try {
      pathname = new URL(req.url ?? "/", "http://x").pathname;
    } catch {
      return send(res, 400, { ok: false, error: "bad request" });
    }
    const sub = pathname === ROUTE_PREFIX ? "" : pathname.slice(ROUTE_PREFIX.length);
    if (req.method !== "POST") return send(res, 405, { ok: false, error: "method not allowed" });
    const mediaType = String(req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      return send(res, 415, { ok: false, error: "content type must be application/json" });
    }
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { ok: false, error: "invalid JSON body" });
    }
    let out;
    try {
      out = await dispatch(sub, body ?? {});
    } catch (error) {
      scope.logger.warn(`skill-config: ${sub || "/state"} failed: ${error?.message ?? error}`);
      out = { ok: false, error: String(error?.message ?? error) };
    }
    send(res, 200, out);
  }

  const disposeRoute = scope.webServer.register({
    kind: "prefix",
    path: ROUTE_PREFIX,
    handler: handle,
  });
  scope.effect(() => disposeRoute, "skill-config: routes");

  scope.effect(
    () => async () => {
      clearInterval(poll);
      for (const id of [...userRunning.keys()]) await stopServer(userRunning, id);
      for (const id of [...projectRunning.keys()]) await stopServer(projectRunning, id);
    },
    "skill-config: teardown",
  );

  // ------------------------------------------------------------------
  // boot
  // ------------------------------------------------------------------
  await loadState();
  for (const entry of state.servers) {
    if (entry.enabled !== false) startServer(userRunning, entry.id, mcpConfigOf(entry));
  }
  await syncProjectMcp();
  // re-apply persisted cordis-patch disables once the loader settles
  applyCordisDisabled().catch((error) => {
    scope.logger.warn(`skill-config: failed to re-apply cordis disables: ${error?.message ?? error}`);
  });
  scope.logger.info(`skill-config: ready — ${state.servers.length} persisted MCP server(s), skills at ${skillsDir}`);
}
