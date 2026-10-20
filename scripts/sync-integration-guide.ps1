<#
.SYNOPSIS
    Sincroniza la guía canónica (contrato) con la copia que sirve el IdP.

.DESCRIPTION
    La autoridad del contrato es `C:\proyectos\contracts\katra\_canonical.md`; el IdP sirve una
    copia en `docs/katra/integration-guide.md` porque el endpoint corre desde la imagen y necesita
    el archivo dentro del repo.

    Dos fuentes de verdad solo son aceptables con un guardia: este script compara, y el gate del
    fork (`katra-upstream.ps1 -Action Check`) falla si dejan de coincidir.

.EXAMPLE
    .\scripts\sync-integration-guide.ps1 -Verify

.EXAMPLE
    .\scripts\sync-integration-guide.ps1 -Sync
#>
[CmdletBinding()]
param(
  [switch] $Sync,
  [switch] $Verify
)

$ErrorActionPreference = 'Stop'

$source = 'C:\proyectos\contracts\katra\_canonical.md'
$repo = git rev-parse --show-toplevel 2>$null
if (-not $repo) { throw 'No es un repositorio git.' }
$target = Join-Path $repo 'docs/katra/integration-guide.md'

if (-not (Test-Path $source)) { throw "No existe la fuente: $source" }

$sourceText = [System.IO.File]::ReadAllText($source)
$hash = (Get-FileHash -Path $source -Algorithm SHA256).Hash

if ($Sync) {
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  [System.IO.File]::WriteAllText($target, $sourceText, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Copiado: $target (sha256 $($hash.Substring(0, 12)))" -ForegroundColor Green
}

if ($Verify -or -not $Sync) {
  if (-not (Test-Path $target)) {
    Write-Host 'La guía servida no existe. Corre -Sync.' -ForegroundColor Red
    exit 1
  }

  $targetHash = (Get-FileHash -Path $target -Algorithm SHA256).Hash
  if ($targetHash -ne $hash) {
    Write-Host 'La guía servida NO coincide con el contrato. Corre -Sync y commitea.' -ForegroundColor Red
    Write-Host "  contrato: $($hash.Substring(0, 12))"
    Write-Host "  servida : $($targetHash.Substring(0, 12))"
    exit 1
  }

  Write-Host "Guía servida en sincronía con el contrato (sha256 $($hash.Substring(0, 12)))." -ForegroundColor Green
}
