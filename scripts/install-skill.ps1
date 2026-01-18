Param(
  [ValidateSet("auto", "codex", "claude")]
  [string]$Target = "auto",
  [string]$Category = "public",
  [string]$Name = "doc2x-mcp",
  [string]$Dest = "",
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-SkillsRoot([string]$target, [string]$codexHome, [string]$claudeHome) {
  $codexRoot = Join-Path $codexHome "skills"
  $claudeRoot = Join-Path $claudeHome "skills"

  if ($target -eq "codex") { return $codexRoot }
  if ($target -eq "claude") { return $claudeRoot }

  if (Test-Path $codexRoot) { return $codexRoot }
  if (Test-Path $claudeRoot) { return $claudeRoot }
  return $codexRoot
}

$home = $HOME
if (-not $home) { throw '$HOME is not set' }

$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $home ".codex" }
$claudeHome = if ($env:CLAUDE_HOME) { $env:CLAUDE_HOME } else { Join-Path $home ".claude" }

$codexRoot = Join-Path $codexHome "skills"
$claudeRoot = Join-Path $claudeHome "skills"

$roots = @()
if ($Target -eq "codex") {
  $roots = @($codexRoot)
} elseif ($Target -eq "claude") {
  $roots = @($claudeRoot)
} else {
  $roots = @($codexRoot, $claudeRoot)
}

if ($Dest -and $roots.Count -gt 1) {
  throw "-Dest cannot be used when installing to multiple targets (auto found both Codex/Claude)."
}

$rawBase = if ($env:DOC2X_MCP_RAW_BASE) { $env:DOC2X_MCP_RAW_BASE } else { "https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main" }
$remoteSkillMdUrl = "$rawBase/skills/doc2x-mcp/SKILL.md"

$localSkillMdPath = ""
if (Test-Path ".\\skills\\doc2x-mcp\\SKILL.md") {
  $localSkillMdPath = ".\\skills\\doc2x-mcp\\SKILL.md"
}

if ($DryRun) {
  [pscustomobject]@{
    skills_roots = $roots
    remote_skill_md_url = $remoteSkillMdUrl
    local_skill_md_path = $localSkillMdPath
    category = $Category
    name = $Name
    dest = $Dest
  } | ConvertTo-Json -Depth 4
  exit 0
}

function New-TempFilePath() {
  return [System.IO.Path]::GetTempFileName()
}

$tempSkillMd = ""
$tempSkillMdIsTemp = $false
try {
  if ($localSkillMdPath) {
    $tempSkillMd = $localSkillMdPath
    $tempSkillMdIsTemp = $false
  } else {
    $tempSkillMd = New-TempFilePath
    $tempSkillMdIsTemp = $true
    Invoke-WebRequest -Uri $remoteSkillMdUrl -OutFile $tempSkillMd | Out-Null
  }

  foreach ($root in $roots) {
    $destDir = ""
    if ($Dest) {
      $destDir = $Dest
    } elseif ($root -eq $codexRoot) {
      $destDir = Join-Path (Join-Path $root $Category) $Name
    } elseif ($root -eq $claudeRoot) {
      $destDir = Join-Path $root $Name
    } else {
      $destDir = Join-Path (Join-Path $root $Category) $Name
    }
    $skillMdDest = Join-Path $destDir "SKILL.md"

    if (Test-Path $destDir) {
      if (-not $Force) {
        throw "Destination already exists: $destDir`nRe-run with -Force to overwrite."
      }
      Remove-Item -Recurse -Force $destDir
    }

    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -Force $tempSkillMd $skillMdDest
    Write-Output "Installed skill to: $destDir"
  }
} finally {
  if ($tempSkillMdIsTemp -and $tempSkillMd -and (Test-Path $tempSkillMd)) {
    Remove-Item -Force $tempSkillMd
  }
}
