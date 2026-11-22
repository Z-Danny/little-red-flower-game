# Isolated Godot 4.6.2 native input, data and presentation checks. No shared .godot writes.
[CmdletBinding()]
param(
    [string]$Godot,
    [ValidatePattern('^[a-z0-9-]*$')][string]$Only = '',
    [switch]$Capture,
    [switch]$WriteVerified,
    [string]$Resolution = '432x768'
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path (Join-Path $project '..')).Path
if (-not $Godot) {
    $Godot = Join-Path $repo 'outputs/godot-tools/editor/Godot_v4.6.2-stable_win64_console.exe'
}
$Godot = (Resolve-Path -LiteralPath $Godot).Path
$version = & $Godot --version
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^4\.6\.2\.') { throw "Godot 4.6.2 required; found $version" }
& node (Join-Path $PSScriptRoot 'prepare_configured_assets.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'Regenerate and inspect configured assets first.' }

$destination = Join-Path $repo ('outputs/configured-native-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$null = New-Item -ItemType Directory -Path $destination -Force
foreach ($folder in @('assets', 'scenes', 'scripts', 'theme')) {
    $source = Join-Path $project $folder
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $destination -Recurse }
}
Copy-Item -LiteralPath (Join-Path $project 'project.godot') -Destination $destination
$testTools = Join-Path $destination 'tools'
$null = New-Item -ItemType Directory -Path $testTools
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'test_configured_runner.gd') -Destination $testTools
$importLog = Join-Path $destination 'import.log'
& $Godot --headless --path $destination --import *> $importLog
if ($LASTEXITCODE -ne 0 -or (Select-String -Path $importLog -Pattern '^SCRIPT ERROR:|^ERROR:' -Quiet)) { throw "Godot import failed: $importLog" }

$run = @('--headless', '--audio-driver', 'Dummy')
$userArgs = @('--report=res://configured_test_results.json')
if ($Capture) {
    $images = Join-Path $destination 'screenshots'
    $null = New-Item -ItemType Directory -Path $images
    $run = @('--audio-driver', 'Dummy', '--rendering-method', 'gl_compatibility', '--resolution', $Resolution)
    $userArgs += '--capture=' + $images
}
if ($Only) { $userArgs += '--only=' + $Only }
$run += @('--path', $destination, '--quit-after', '2100', '--script', 'res://tools/test_configured_runner.gd', '--') + $userArgs
$testLog = Join-Path $destination 'test.log'
& $Godot @run 2>&1 | Tee-Object -FilePath $testLog
$report = Join-Path $destination 'configured_test_results.json'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $report) -or (Select-String -Path $testLog -Pattern '^SCRIPT ERROR:|^ERROR:|instances leaked at exit' -Quiet)) { throw "Godot regression failed: $testLog" }
if ($WriteVerified) {
    $merge = if ($Only) { @('--merge') } else { @() }
    & node (Join-Path $PSScriptRoot 'update_configured_verified.mjs') $report @merge
    if ($LASTEXITCODE -ne 0) { throw 'Could not update configured readiness.' }
}
Write-Output "Configured native validation: $destination"
