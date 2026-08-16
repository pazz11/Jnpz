/**
 * dsh-skill-config — pure helpers (no cordis, no I/O beyond node builtins).
 *
 * Shared by the host plugin (lib/index.js). Kept dependency-light and
 * side-effect-free so each piece can be exercised in isolation.
 */
import { inflateRawSync } from "node:zlib";
import { basename } from "node:path";
import { parse as parseYaml } from "yaml";

/** MCP serverName contract (mirrors @deepseek-ai/dsh-mcp-client). */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** DSH skill name contract (mirrors @deepseek-ai/dsh-skill isSkillName). */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// =====================================================================
// zip reading (stored + deflate, no external deps)
// =====================================================================

function u16(buf, off) {
  return buf.readUInt16LE(off);
}
function u32(buf, off) {
  return buf.readUInt32LE(off);
}

/**
 * Read a ZIP buffer into its file entries.
 * Supports method 0 (stored) and method 8 (deflate). Directory entries are
 * returned with `dir: true` and no data. Entry names are normalized to "/"
 * separators and path-traversal names are rejected.
 *
 * @param buf - the raw zip bytes.
 * @returns [{ name, dir, data }] — data is a Buffer for files.
 */
export function extractZip(buf) {
  // 1) locate End Of Central Directory (0x06054b50), scanning back up to 64KiB+22
  const min = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 zip 文件（缺少结束记录）");
  const count = u16(buf, eocd + 10) || u16(buf, eocd + 8);
  let off = u32(buf, eocd + 16);
  if (off <= 0 || off >= buf.length) throw new Error("zip 中央目录偏移无效");

  const entries = [];
  for (let n = 0; n < count; n++) {
    if (u32(buf, off) !== 0x02014b50) throw new Error("zip 中央目录损坏");
    const method = u16(buf, off + 10);
    const csize = u32(buf, off + 20);
    const usize = u32(buf, off + 24);
    const fnLen = u16(buf, off + 28);
    const extraLen = u16(buf, off + 30);
    const commentLen = u16(buf, off + 32);
    const localOff = u32(buf, off + 42);
    let name;
    try {
      name = buf.toString("utf8", off + 46, off + 46 + fnLen);
    } catch {
      name = buf.toString("binary", off + 46, off + 46 + fnLen);
    }
    // normalize separators; reject traversal / absolute names
    name = name.replace(/\\/g, "/");
    if (name.startsWith("/") || name.split("/").some((seg) => seg === ".." || seg === "" && name !== "")) {
      throw new Error(`zip 内含非法路径 "${name}"`);
    }
    const dir = name.endsWith("/") || csize === 0 && usize === 0 && name.endsWith("/");
    off += 46 + fnLen + extraLen + commentLen;

    if (name === "" || name.endsWith("/")) {
      entries.push({ name, dir: true, data: null });
      continue;
    }
    // 2) local header (0x04034b50)
    const lfnLen = u16(buf, localOff + 26);
    const lextraLen = u16(buf, localOff + 28);
    const dataStart = localOff + 30 + lfnLen + lextraLen;
    const end = dataStart + csize;
    if (end > buf.length) throw new Error(`zip 条目 "${name}" 数据越界`);
    let data = buf.subarray(dataStart, end);
    if (method === 8) {
      try {
        data = inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 });
      } catch {
        throw new Error(`zip 条目 "${name}" 解压失败`);
      }
    } else if (method !== 0) {
      throw new Error(`zip 条目 "${name}" 使用了不支持的压缩方式 ${method}`);
    }
    entries.push({ name, dir: false, data });
  }
  return entries;
}

// =====================================================================
// SKILL.md frontmatter
// =====================================================================

/**
 * Parse YAML frontmatter from SKILL.md content.
 * @param raw - file text.
 * @returns { data, body } or null when the file has no frontmatter.
 * @throws when frontmatter exists but is not valid YAML.
 */
export function parseFrontmatter(raw) {
  const firstEnd = raw.indexOf("\n");
  const first = firstEnd < 0 ? raw : raw.slice(0, firstEnd);
  if (first.replace(/\r$/, "") !== "---") return null;
  const start = firstEnd < 0 ? raw.length : firstEnd + 1;
  let lineStart = start;
  while (lineStart <= raw.length) {
    const next = raw.indexOf("\n", lineStart);
    const lineEnd = next < 0 ? raw.length : next;
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
      const parsed = parseYaml(raw.slice(start, lineStart));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("SKILL.md 前端元数据必须是 YAML 对象");
      }
      return {
        data: parsed,
        body: raw.slice(next < 0 ? raw.length : next + 1),
      };
    }
    if (next < 0) return null;
    lineStart = next + 1;
  }
  return null;
}

/**
 * Read a skill document into the create-skill form shape.
 * Missing fields stay undefined (the form decides fallbacks).
 * @param text - SKILL.md content.
 * @returns { name, description, whenToUse, instructions }
 */
export function parseSkillDoc(text) {
  let data = {};
  let body = text;
  let frontmatter = void 0;
  try {
    const fm = parseFrontmatter(text);
    if (fm) {
      data = fm.data;
      body = fm.body;
      frontmatter = fm.data;
    }
  } catch (err) {
    // invalid frontmatter: treat the whole file as instructions
    return { instructions: String(text).trim(), frontmatter: void 0, error: String(err?.message ?? err) };
  }
  const out = {
    instructions: String(body).trim(),
    frontmatter,
  };
  if (typeof data.name === "string" && data.name.trim()) out.name = data.name.trim();
  if (typeof data.description === "string" && data.description.trim()) out.description = data.description.trim();
  if (typeof data.whenToUse === "string" && data.whenToUse.trim()) out.whenToUse = data.whenToUse.trim();
  return out;
}

// =====================================================================
// names
// =====================================================================

/** Lowercase-hyphen slug for a skill name; empty string when nothing survives. */
export function slugifyName(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

/** Stable short hex hash (djb2) for ids / icon colors. */
export function hashString(input) {
  let h = 5381;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// =====================================================================
// MCP JSON conversion ("后台自动转换")
// =====================================================================

function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

/**
 * Convert user-supplied MCP JSON into normalized mcp-client configs.
 *
 * Accepted shapes:
 *   1. { "mcpServers": { "yakit": { "command": "...", "args": [] } } }
 *   2. a single server: { "serverName": "yakit", "command": "...", ... }
 *      (also accepts `name`, `type`/`transport`, `url`/`sseUrl`)
 *   3. a plain map whose values are server configs: { "yakit": { ... } }
 *
 * @param input - parsed JSON (object) or a JSON string.
 * @returns array of normalized { serverName, transport, command?, args?, env?, cwd?, url?, headers?, toolCallTimeoutMs?, enabled? }.
 * @throws Error with a readable message on invalid input.
 */
export function normalizeMcpInput(input) {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      throw new Error(`JSON 解析失败: ${err?.message ?? err}`);
    }
  }
  const root = asRecord(raw);

  /** @type {[string, object][]} */
  let pairs = [];
  if (root.mcpServers !== undefined) {
    if (typeof root.mcpServers !== "object" || root.mcpServers === null || Array.isArray(root.mcpServers)) {
      throw new Error('"mcpServers" 必须是 { 名称: 配置 } 对象');
    }
    for (const [key, cfg] of Object.entries(root.mcpServers)) pairs.push([key, asRecord(cfg)]);
  } else if (looksLikeServer(root)) {
    pairs.push([root.serverName ?? root.name, root]);
  } else {
    const values = Object.entries(root);
    if (values.length === 0) throw new Error("配置为空");
    if (!values.every(([, v]) => typeof v === "object" && v !== null && !Array.isArray(v) && looksLikeServer(v))) {
      throw new Error("无法识别的配置格式：请提供单个服务器配置或 { \"mcpServers\": {...} }");
    }
    pairs = values;
  }

  const out = [];
  for (const [key, cfg] of pairs) {
    const serverName = String(cfg.serverName ?? cfg.name ?? key).trim();
    if (!SERVER_NAME_PATTERN.test(serverName)) {
      throw new Error(`服务器名称 "${serverName}" 无效：仅支持字母/数字/下划线/连字符，最长 32 位`);
    }
    const transport = resolveTransport(cfg, serverName);
    const timeoutMs = cfg.toolCallTimeoutMs ?? cfg.timeout;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      throw new Error(`服务器 "${serverName}" 的 timeout 必须是正数（毫秒）`);
    }
    const base = {
      serverName,
      transport,
      toolCallTimeoutMs: timeoutMs !== undefined ? timeoutMs : undefined,
    };
    if (transport === "stdio") {
      // command 可以是字符串，也可以是数组（首个元素为可执行文件，其余为参数）
      let command = cfg.command;
      const args = Array.isArray(cfg.args) ? cfg.args.map(String) : [];
      if (Array.isArray(command)) {
        if (command.length === 0 || typeof command[0] !== "string" || !command[0].trim()) {
          throw new Error(`stdio 服务器 "${serverName}" 的 command 数组不能为空，且首个元素必须是可执行文件路径`);
        }
        command = command[0];
        for (let i = 1; i < cfg.command.length; i++) args.unshift(String(cfg.command[i]));
      }
      if (typeof command !== "string" || !command.trim()) {
        throw new Error(`stdio 服务器 "${serverName}" 缺少 command`);
      }
      out.push({
        ...base,
        command,
        args,
        env: asRecord(cfg.env),
        cwd: typeof cfg.cwd === "string" ? cfg.cwd : "",
        ...cfg.enabled === false ? { enabled: false } : {},
      });
    } else {
      const url = String(cfg.url ?? cfg.sseUrl ?? "").trim();
      if (!url) throw new Error(`HTTP 服务器 "${serverName}" 缺少 url`);
      out.push({
        ...base,
        url,
        headers: asRecord(cfg.headers),
        ...cfg.enabled === false ? { enabled: false } : {},
      });
    }
  }
  return out;
}

function looksLikeServer(cfg) {
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) return false;
  return cfg.command !== undefined || cfg.url !== undefined || cfg.transport !== undefined || cfg.type !== undefined;
}

function resolveTransport(cfg, serverName) {
  const explicit = cfg.transport ?? cfg.type;
  if (explicit !== undefined) {
    switch (String(explicit).toLowerCase()) {
      case "stdio":
      case "local":
        return "stdio";
      case "streamable-http":
      case "streamablehttp":
      case "http":
      case "sse":
        return "streamable-http";
      default:
        throw new Error(`服务器 "${serverName}" 的 transport "${explicit}" 不受支持（支持 stdio / local / streamable-http）`);
    }
  }
  if (cfg.url !== undefined || cfg.sseUrl !== undefined) return "streamable-http";
  if (cfg.command !== undefined) return "stdio";
  throw new Error(`服务器 "${serverName}" 缺少 command（stdio）或 url（streamable-http）`);
}

// =====================================================================
// skill archive inspection (parse step, no writes)
// =====================================================================

/**
 * Parse an uploaded skill file (zip / .skill / single .md) into the create
 * form shape. Does not touch the filesystem.
 * @param fileName - original file name.
 * @param buf - file bytes.
 * @returns { ok: true, parsed: { name?, description?, whenToUse?, instructions, resources?: string[] } }
 *          or { ok: false, error }.
 */
export function parseSkillUpload(fileName, buf) {
  const lower = String(fileName ?? "").toLowerCase();
  if (!buf || buf.length === 0) return { ok: false, error: "文件为空" };

  let entries = null;
  let text = null;
  if (lower.endsWith(".zip") || lower.endsWith(".skill")) {
    try {
      entries = extractZip(buf);
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
    // prefer SKILL.md at the archive root, then inside a single wrapper folder
    const candidates = entries.filter((e) => !e.dir && basename(e.name) === "SKILL.md");
    let best = null;
    for (const e of candidates) {
      const depth = e.name.split("/").length - 1;
      if (depth <= 1 && (best === null || depth < best.name.split("/").length - 1)) best = e;
    }
    if (!best) {
      return { ok: false, error: "压缩包中未找到 SKILL.md（需位于根目录或一级子目录）" };
    }
    text = best.data.toString("utf8");
  } else if (lower.endsWith(".md")) {
    text = buf.toString("utf8");
  } else {
    return { ok: false, error: "不支持的文件类型：仅支持 .zip / .skill / .md" };
  }

  const doc = parseSkillDoc(text);
  const fallbackName = slugifyName(basename(String(fileName)).replace(/\.(md|zip|skill)$/i, ""));
  const parsed = {
    name: doc.name ?? fallbackName,
    description: doc.description ?? "",
    whenToUse: doc.whenToUse,
    instructions: doc.instructions ?? "",
  };
  if (entries) {
    parsed.resources = entries
      .filter((e) => !e.dir && basename(e.name) !== "SKILL.md")
      .map((e) => e.name);
  }
  if (doc.error && !doc.name && !doc.instructions) {
    return { ok: false, error: `SKILL.md 解析失败: ${doc.error}` };
  }
  return { ok: true, parsed };
}
