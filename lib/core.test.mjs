// Standalone tests for dsh-skill-config/lib/core.js — run: node lib/core.test.mjs
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractZip,
  parseFrontmatter,
  parseSkillDoc,
  slugifyName,
  hashString,
  normalizeMcpInput,
  parseSkillUpload,
} from "./core.js";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`);
  }
}
function checkOk(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label}: ${err?.message ?? err}`);
  }
}
function checkThrows(label, fn, needle) {
  try {
    fn();
    failures++;
    console.log(`FAIL  ${label}: did not throw`);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (needle && !msg.includes(needle)) {
      failures++;
      console.log(`FAIL  ${label}: threw "${msg}" (want "${needle}")`);
    } else {
      console.log(`  ok  ${label} (${msg})`);
    }
  }
}

// ---- slugify / hash ----
check("slugify latin", slugifyName("Code Map"), "code-map");
check("slugify zh", slugifyName("我的技能"), "");
check("slugify mixed", slugifyName("My 技能 v2"), "my-v2");
check("hash stable", hashString("yakit"), hashString("yakit"));
checkOk("hash differs", () => {
  if (hashString("a") === hashString("b")) throw new Error("collision");
});

// ---- frontmatter ----
const skillMd = [
  "---",
  'name: codemap',
  'description: 当用户询问项目结构时使用',
  "whenToUse: 询问结构时",
  "---",
  "",
  "# codemap",
  "## Commands",
].join("\n");
const fm = parseFrontmatter(skillMd);
check("frontmatter name", fm.data.name, "codemap");
check("frontmatter body", fm.body.trim(), "# codemap\n## Commands");
const doc = parseSkillDoc(skillMd);
check("doc parsed", doc, {
  instructions: "# codemap\n## Commands",
  frontmatter: {
    name: "codemap",
    description: "当用户询问项目结构时使用",
    whenToUse: "询问结构时",
  },
  name: "codemap",
  description: "当用户询问项目结构时使用",
  whenToUse: "询问结构时",
});
check("no frontmatter", parseFrontmatter("# just markdown\n"), null);
const plain = parseSkillDoc("# just markdown\n");
check("plain doc", plain, { instructions: "# just markdown" });

// ---- zip ----
const work = mkdtempSync(join(tmpdir(), "dsh-skill-test-"));
writeFileSync(join(work, "SKILL.md"), skillMd, "utf8");
mkdirSync(join(work, "scripts"), { recursive: true });
writeFileSync(join(work, "scripts", "build.js"), "console.log(1);", "utf8");
const zipPath = join(work, "skill.zip");
// use PowerShell to create the zip (deflate)
import("node:child_process").then(({ execFileSync }) => {
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${work}\\SKILL.md','${work}\\scripts' -DestinationPath '${zipPath}' -Force`],
    { stdio: "pipe" },
  );
  const zipBuf = readFileSync(zipPath);
  const entries = extractZip(zipBuf);
  console.log("zip entries:", entries.map((e) => `${e.dir ? "D" : "F"}:${e.name}`).join(", "));
  checkOk("zip has SKILL.md", () => {
    const e = entries.find((x) => x.name === "SKILL.md" && !x.dir);
    if (!e) throw new Error("missing");
    if (e.data.toString("utf8") !== skillMd) throw new Error("content mismatch");
  });
  checkOk("zip has scripts/build.js", () => {
    const e = entries.find((x) => x.name === "scripts/build.js");
    if (!e || e.data.toString("utf8") !== "console.log(1);") throw new Error("content mismatch");
  });

  // upload parse (root SKILL.md)
  const up = parseSkillUpload("skill.zip", zipBuf);
  checkOk("parseSkillUpload ok", () => {
    if (!up.ok) throw new Error(up.error);
    if (up.parsed.name !== "codemap") throw new Error("name: " + up.parsed.name);
    if (!up.parsed.resources.includes("scripts/build.js")) throw new Error("resources missing");
  });

  // single md upload
  const mdUp = parseSkillUpload("codemap.md", Buffer.from(skillMd, "utf8"));
  check("md upload name", mdUp.parsed.name, "codemap");
  check("bad ext", parseSkillUpload("x.exe", Buffer.from("x")), { ok: false, error: "不支持的文件类型：仅支持 .zip / .skill / .md" });

  // zip without SKILL.md
  const work2 = mkdtempSync(join(tmpdir(), "dsh-skill-test-"));
  writeFileSync(join(work2, "a.txt"), "hello", "utf8");
  const zip2 = join(work2, "bad.zip");
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${work2}\\a.txt' -DestinationPath '${zip2}' -Force`], { stdio: "pipe" });
  const noSkill = parseSkillUpload("bad.zip", readFileSync(zip2));
  check("zip missing SKILL.md", noSkill, { ok: false, error: "压缩包中未找到 SKILL.md（需位于根目录或一级子目录）" });

  // ---- mcp normalization ----
  check("mcp bulk", normalizeMcpInput({
    mcpServers: {
      yakit: { command: "yak", args: ["bridge", "--proc", "4"] },
      kali: { url: "http://10.0.0.104:5000/mcp" },
    },
  }), [
    { serverName: "yakit", transport: "stdio", command: "yak", args: ["bridge", "--proc", "4"], env: {}, cwd: "" },
    { serverName: "kali", transport: "streamable-http", url: "http://10.0.0.104:5000/mcp", headers: {} },
  ]);
  check("mcp single stdio type", normalizeMcpInput({ type: "stdio", serverName: "x", command: "cmd" })[0].transport, "stdio");
  check("mcp sse type", normalizeMcpInput({ type: "sse", name: "s", sseUrl: "http://x/sse" })[0].transport, "streamable-http");
  check("mcp map form", normalizeMcpInput({ a: { command: "a" }, b: { command: "b" } }).length, 2);
  // type:local + command 数组 + timeout（x64dbg 配置格式）
  check(
    "mcp local command-array timeout",
    normalizeMcpInput({
      mcpServers: {
        x64dbg: { type: "local", command: ["node", "D:\\tools\\srv.js"], enabled: true, timeout: 30000 },
      },
    })[0],
    {
      serverName: "x64dbg",
      transport: "stdio",
      toolCallTimeoutMs: 30000,
      command: "node",
      args: ["D:\\tools\\srv.js"],
      env: {},
      cwd: "",
    },
  );
  check("mcp local transport key", normalizeMcpInput({ transport: "local", serverName: "l", command: ["a", "b", "c"] })[0].transport, "stdio");
  check("mcp command array args merge", normalizeMcpInput({ serverName: "m", command: ["x", "y"], args: ["z"] })[0].args, ["y", "z"]);
  checkThrows("mcp command array empty", () => normalizeMcpInput({ mcpServers: { e: { type: "local", command: [] } } }), "不能为空");
  checkThrows("mcp timeout invalid", () => normalizeMcpInput({ mcpServers: { t: { command: "x", timeout: -1 } } }), "timeout");
  check("mcp json string", normalizeMcpInput('{"mcpServers":{"z":{"command":"z"}}}')[0].serverName, "z");
  checkThrows("mcp bad json", () => normalizeMcpInput("{not json"), "JSON 解析失败");
  checkThrows("mcp bad name", () => normalizeMcpInput({ mcpServers: { "bad name!": { command: "x" } } }), "无效");
  checkThrows("mcp stdio no command", () => normalizeMcpInput({ command2: {} }), "无法识别");
  checkThrows("mcp http no url", () => normalizeMcpInput({ mcpServers: { h: { url: undefined, transport: "http" } } }), "缺少 url");

  rmSync(work, { recursive: true, force: true });
  rmSync(work2, { recursive: true, force: true });
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
});
