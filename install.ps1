# install.ps1 — 把「技能配置」插件（包名 Jnpz）装进 DSH web profile 并热激活
# 用法（可任意目录执行）：
#   powershell -ExecutionPolicy Bypass -File "D:\trae\问问题\dsh-skill-config\install.ps1"
# 原理：
#   1) pnpm pack 打包插件到临时目录（ASCII 路径，规避中文路径编码问题）
#   2) pnpm add -w 安装进 profile（复制安装，插件自包含）
#   3) 向 cordis.patch.yml 追加注册条目 —— DSH 监听该文件并热加载，无需重启
# 注：DSH 插件管理页按包名显示，本插件在列表中显示为 Jnpz（npm 包名不允许中文）。
param(
    [string]$Profile = "web"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $env:USERPROFILE ".dsh" }
$profileDir = Join-Path $dshHome "profiles\$Profile"

if (-not (Test-Path (Join-Path $profileDir "package.json"))) {
    throw "DSH profile 不存在: $profileDir"
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "未找到 pnpm，请先安装 pnpm"
}

# 1) 打包（放到临时目录，ASCII 路径）
$packDir = Join-Path $env:TEMP "dsh-skill-config-pack"
New-Item -ItemType Directory -Path $packDir -Force | Out-Null
Write-Host "==> pnpm pack $root" -ForegroundColor Cyan
Push-Location $root
try {
    & pnpm pack --pack-destination $packDir | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "pnpm pack 失败（exit $LASTEXITCODE）" }
} finally {
    Pop-Location
}
$tgz = Get-ChildItem -Path $packDir -Filter "*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $tgz) { throw "打包产物未找到" }
# 拷贝到 profile 目录（持久化，file: 依赖指向稳定的本地路径）
$localTgz = Join-Path $profileDir "Jnpz-latest.tgz"
Copy-Item -Path $tgz.FullName -Destination $localTgz -Force
Write-Host "==> 产物: $localTgz" -ForegroundColor Cyan

# 2) 安装进 profile（先移除旧名版本，保证更新生效）
Write-Host "==> pnpm add -w ./Jnpz-latest.tgz" -ForegroundColor Cyan
Push-Location $profileDir
try {
    & pnpm remove -w dsh-skill-config 2>$null | Out-Null
    & pnpm remove -w Jnpz 2>$null | Out-Null
    & pnpm add -w "./Jnpz-latest.tgz"
    if ($LASTEXITCODE -ne 0) { throw "pnpm add 失败（exit $LASTEXITCODE）" }
} finally {
    Pop-Location
}

# 3) 追加注册条目到 cordis.patch.yml —— DSH 监听该文件并热加载
$patchFile = Join-Path $profileDir "cordis.patch.yml"
$content = Get-Content -Path $patchFile -Raw -Encoding UTF8
if ($content -match "Jnpz") {
    Write-Host "==> cordis.patch.yml 已包含注册条目，跳过" -ForegroundColor Yellow
} else {
    $block = @"

# 技能配置（Jnpz）：MCP 管理 + 技能上传
- insert:
    - id: skill-config
      name: 'Jnpz'
"@
    if (-not $content.EndsWith("`n")) { $content = $content + "`n" }
    $newContent = $content + $block
    [System.IO.File]::WriteAllText($patchFile, $newContent, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "==> 已追加 insert 条目到 cordis.patch.yml（DSH 将热加载）" -ForegroundColor Green
}

Write-Host ""
Write-Host "安装完成。" -ForegroundColor Green
Write-Host "1. 刷新浏览器页面 http://127.0.0.1:3080"
Write-Host "2. 打开左下角 设置 -> 左侧导航『技能配置』"
Write-Host "3. 设置 -> 插件 -> 全部 里显示为 Jnpz"
Write-Host ""
Write-Host "卸载：cd $profileDir; pnpm remove -w Jnpz; 并删除 cordis.patch.yml 中对应条目"
