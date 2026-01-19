[CmdletBinding()]
Param(
  [ValidateSet("auto", "codex", "claude")]
  [string]$Target = "auto",

  [string]$Category = "public",
  [string]$Name = "doc2x-mcp",
  [string]$Dest = "",

  [switch]$Force,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -------------------------------------------------------------------
# Environment & paths
# -------------------------------------------------------------------

$userHome = $HOME
if (-not $userHome) {
  throw '$HOME is not set'
}

$codexHome  = $env:CODEX_HOME  ?? (Join-Path $userHome ".codex")
$claudeHome = $env:CLAUDE_HOME ?? (Join-Path $userHome ".claude")

$codexRoot  = Join-Path $codexHome  "skills"
$claudeRoot = Join-Path $claudeHome "skills"

# -------------------------------------------------------------------
# Helper functions
# -------------------------------------------------------------------

function Get-InstallRoots {
  param(
    [string]$Target,
    [string]$CodexRoot,
    [string]$ClaudeRoot
  )

  switch ($Target) {
    "codex"  { return @($CodexRoot) }
    "claude" { return @($ClaudeRoot) }
    default {
      $roots = @()
      if (Test-Path $CodexRoot)  { $roots += $CodexRoot }
      if (Test-Path $ClaudeRoot) { $roots += $ClaudeRoot }
      return ($roots.Count -gt 0) ? $roots : @($CodexRoot)
    }
  }
}

function New-TempFilePath {
  return [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    ([System.Guid]::NewGuid().ToString() + ".md")
  )
}

# -------------------------------------------------------------------
# Resolve install roots
# -------------------------------------------------------------------

$roots = Get-InstallRoots -Target $Target -CodexRoot $codexRoot -ClaudeRoot $claudeRoot

if ($Dest -and $roots.Count -gt 1) {
  throw "-Dest cannot be used when installing to multiple targets."
}

# -------------------------------------------------------------------
# Resolve SKILL.md source
# -------------------------------------------------------------------

$rawBase = $env:DOC2X_MCP_RAW_BASE ?? "https://raw.githubusercontent.com/NoEdgeAI/doc2x-mcp/main"
$remoteSkillMdUrl = "$rawBase/skills/doc2x-mcp/SKILL.md"

$localSkillMdPath = ""
if (Test-Path ".\skills\doc2x-mcp\SKILL.md") {
  $localSkillMdPath = ".\skills\doc2x-mcp\SKILL.md"
}

# -------------------------------------------------------------------
# Dry run
# -------------------------------------------------------------------

if ($DryRun) {
  [pscustomobject]@{
    roots                  = $roots
    remote_skill_md_url    = $remoteSkillMdUrl
    local_skill_md_path    = $localSkillMdPath
    category               = $Category
    name                   = $Name
    dest                   = $Dest
  } | ConvertTo-Json -Depth 4
  return
}

# -------------------------------------------------------------------
# Download / install
# -------------------------------------------------------------------

$tempSkillMd = ""
$tempIsTemp  = $false

try {
  if ($localSkillMdPath) {
    $tempSkillMd = $localSkillMdPath
  } else {
    $tempSkillMd = New-TempFilePath
    $tempIsTemp  = $true
    Invoke-WebRequest -Uri $remoteSkillMdUrl -OutFile $tempSkillMd | Out-Null
  }

  foreach ($root in $roots) {

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
}
finally {
  if ($tempIsTemp -and $tempSkillMd -and (Test-Path $tempSkillMd)) {
    Remove-Item -Force $tempSkillMd
  }
}
