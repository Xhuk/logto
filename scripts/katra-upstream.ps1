<#
.SYNOPSIS
    Mantenimiento del fork Katra contra upstream (logto-io/logto).

.DESCRIPTION
    Katra es un fork propio. Upstream solo se usa para dos cosas: traer correcciones y no morir.
    Este script hace visible, antes de tocar nada, cuánto nos separamos y qué archivos van a chocar.

    Acciones:
      Status    Divergencia, merge-base y capas (identidad Katra vs resto).
      Forecast  Pronostico REAL de conflicto con `git merge-tree` (no toca el arbol).
      Fetch     Trae upstream/master + tags. El push a upstream esta deshabilitado a proposito.
      Rebase    Rebase sobre -Target, creando antes una rama de seguridad.
      Check     Gate determinista: typecheck, tests de identidad y eslint.
      Tag       Marca el commit actual (o -TagName) como release desplegado.

.EXAMPLE
    .\scripts\katra-upstream.ps1 -Action Forecast

.EXAMPLE
    .\scripts\katra-upstream.ps1 -Action Rebase -Target v1.10.0

.EXAMPLE
    .\scripts\katra-upstream.ps1 -Action Tag -TagName katra-prod-2026-10-18
#>
[CmdletBinding()]
param(
  [ValidateSet('Status', 'Forecast', 'Fetch', 'Rebase', 'Check', 'Tag')]
  [string] $Action = 'Status',

  # Ref de upstream contra la que comparar o rebasar. Recomendado: un tag de release, no master.
  [string] $Target = 'upstream/master',

  [string] $TagName,

  # Rebase sin red de seguridad. Solo si ya sabes que el arbol esta limpio.
  [switch] $NoSafetyBranch
)

$ErrorActionPreference = 'Stop'

# La identidad Katra: si un conflicto cae aqui, hay que resolverlo a mano. Si cae fuera, es la
# capa de producto (consola, tenant groups, i18n) y se puede tomar upstream en bloque.
$katraPatterns = @(
  'login-hint'
  'packages/core/src/oidc/'
  'packages/core/src/queries/'
  'packages/core/src/constants/'
  'packages/core/src/routes/experience/'
  'packages/core/src/routes/init.ts'
  'packages/core/src/routes/applications/'
  'packages/shared/src/node/env/GlobalValues.ts'
  'packages/experience/src/apis/experience/'
  'packages/experience/src/hooks/use-prefilled-identifier.ts'
  'packages/experience/src/pages/SignIn/'
  'packages/experience/src/pages/PasskeySetup/'
  'packages/experience/src/components/LoginHintPasswordForm/'
)

function Get-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if (-not $root) { throw 'No es un repositorio git.' }
  return $root
}

function Test-KatraFile([string] $path) {
  foreach ($pattern in $katraPatterns) {
    if ($path -like "*$pattern*") { return $true }
  }
  return $false
}

function Get-MergeBase([string] $target) {
  $base = git merge-base HEAD $target 2>$null
  if (-not $base) { throw "No hay merge-base con $target. Corre -Action Fetch primero." }
  return $base
}

function Write-LayerTable([string[]] $files) {
  $katra = @($files | Where-Object { Test-KatraFile $_ })
  $other = @($files | Where-Object { -not (Test-KatraFile $_) })

  Write-Host ''
  Write-Host "  Identidad Katra : $($katra.Count) archivo(s)"
  foreach ($file in $katra) { Write-Host "    ! $file" }
  Write-Host "  Resto (producto): $($other.Count) archivo(s)"
  foreach ($file in $other) { Write-Host "    - $file" }
}

function Invoke-Status {
  $base = Get-MergeBase $Target
  $counts = git rev-list --left-right --count "$Target...HEAD"
  $parts = $counts -split "`t"
  $behind = $parts[0]
  $ahead = $parts[1]

  Write-Host "Katra vs $Target"
  Write-Host "  merge-base : $base ($(git log -1 --format='%ad' --date=short $base))"
  Write-Host "  ellos      : $behind commit(s) que no tenemos"
  Write-Host "  nosotros   : $ahead commit(s) nuestros"

  $dirty = @(git status --porcelain | Where-Object { $_ -notmatch '^\?\?' })
  Write-Host "  arbol      : $(if ($dirty.Count -eq 0) { 'limpio' } else { "$($dirty.Count) archivo(s) sin commitear" })"

  $tags = @(git tag --list 'katra-prod-*' --sort=-creatordate)
  Write-Host "  release    : $(if ($tags.Count -eq 0) { 'sin tag de produccion (corre -Action Tag)' } else { $tags[0] })"
}

function Invoke-Forecast {
  $base = Get-MergeBase $Target

  # merge-tree escribe el arbol del merge en el object store y lista los conflictos, sin tocar el
  # working tree ni el indice. Es el pronostico mas honesto que hay.
  $output = git merge-tree --write-tree --name-only HEAD $Target 2>&1
  $exit = $LASTEXITCODE

  $conflicts = @($output | Where-Object { $_ -match '/' -and $_ -notmatch '^(Auto-merging|CONFLICT|Merge|our|their|tree|result)' })

  if ($exit -eq 0) {
    Write-Host "Sin conflictos con $Target. Rebase limpio." -ForegroundColor Green
    return
  }

  Write-Host "Conflicto pronosticado con $Target : $($conflicts.Count) archivo(s)" -ForegroundColor Yellow
  Write-LayerTable $conflicts
  Write-Host ''
  Write-Host "  (base: $base, $(git log -1 --format='%ad' --date=short $base))"
}

function Invoke-Fetch {
  git fetch upstream master --tags --quiet
  $latest = git rev-parse --short upstream/master
  Write-Host "upstream/master en $latest; tags nuevos: $(@(git tag --list --sort=-creatordate | Select-Object -First 1))"
}

function Invoke-Rebase {
  $dirty = @(git status --porcelain | Where-Object { $_ -notmatch '^\?\?' })
  if ($dirty.Count -gt 0) { throw "Arbol sucio ($($dirty.Count) archivo(s)). Commitea o guarda antes de rebasar." }

  if (-not $NoSafetyBranch) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    $safety = "katra/pre-rebase-$stamp"
    git branch $safety
    Write-Host "Rama de seguridad: $safety (volver con: git reset --hard $safety)" -ForegroundColor Cyan
  }

  Write-Host "Rebasando sobre $Target ..."
  git rebase $Target
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'Rebase limpio.' -ForegroundColor Green
    Write-Host 'Siguiente: -Action Check, luego deploy y -Action Tag.' -ForegroundColor Cyan
    return
  }

  $conflicted = @(git diff --name-only --diff-filter=U)
  Write-Host "Rebase detenido en $($conflicted.Count) conflicto(s):" -ForegroundColor Yellow
  Write-LayerTable $conflicted
  Write-Host ''
  Write-Host 'Resolver, `git add` y `git rebase --continue`. Para abortar: git rebase --abort' -ForegroundColor Cyan
  exit 1
}

function Invoke-Check {
  # Un comando nativo que escribe en stderr (tsc, jest, node) revienta con ErrorActionPreference=Stop.
  # El resultado se decide por LASTEXITCODE, no por el stream.
  $ErrorActionPreference = 'Continue'
  $tsc = Join-Path (Get-RepoRoot) 'node_modules/.bin/tsc.cmd'
  if (-not (Test-Path $tsc)) { throw 'Falta node_modules. Corre pnpm install (o prepack) antes del gate.' }

  $failed = $false

  foreach ($project in @('packages/core/tsconfig.json', 'packages/experience/tsconfig.json')) {
    Write-Host "tsc $project ..." -NoNewline
    & $tsc -p $project --noEmit
    if ($LASTEXITCODE -eq 0) { Write-Host ' ok' -ForegroundColor Green } else { Write-Host ' FALLO' -ForegroundColor Red; $failed = $true }
  }

  $jest = Join-Path (Get-RepoRoot) 'packages/core/node_modules/.bin/jest.cmd'
  if (Test-Path $jest) {
    Write-Host 'jest (suites de identidad) ...' -NoNewline

    # Los tests de core son ESM: sin esto jest falla con "Cannot use import statement outside a module".
    $previous = $env:NODE_OPTIONS
    $env:NODE_OPTIONS = '--experimental-vm-modules --max_old_space_size=4096'

    Push-Location (Join-Path (Get-RepoRoot) 'packages/core')
    try {
      & (Join-Path (Get-RepoRoot) 'node_modules/.bin/tsc.cmd') -p tsconfig.test.json
      $testOutput = & $jest --config jest.config.js build/routes/experience/classes/libraries/login-hint.test.js --silent 2>&1
      if ($LASTEXITCODE -eq 0) {
        Write-Host ' ok' -ForegroundColor Green
      } else {
        Write-Host ' FALLO' -ForegroundColor Red
        $testOutput | Select-Object -Last 12
        $failed = $true
      }
    } finally {
      $env:NODE_OPTIONS = $previous
      Pop-Location
    }
  }

  if ($failed) { Write-Host 'Gate en rojo.' -ForegroundColor Red; exit 1 }
  Write-Host 'Gate verde.' -ForegroundColor Green
}

function Invoke-Tag {
  if (-not $TagName) {
    $TagName = "katra-prod-$(Get-Date -Format 'yyyy-MM-dd')"
  }

  $existing = git tag --list $TagName
  if ($existing) { throw "El tag $TagName ya existe (apunta a $(git rev-list -n1 $TagName))." }

  git tag -a $TagName -m "Katra desplegado: $(git log -1 --format='%s')"
  Write-Host "Tag $TagName -> $(git rev-parse --short HEAD)" -ForegroundColor Green
  Write-Host 'Rollback: docker service update --image ghcr.io/...:<tag del build> o volver a este commit.' -ForegroundColor Cyan
}

Push-Location (Get-RepoRoot)
try {
  switch ($Action) {
    'Status'   { Invoke-Status }
    'Forecast' { Invoke-Forecast }
    'Fetch'    { Invoke-Fetch }
    'Rebase'   { Invoke-Rebase }
    'Check'    { Invoke-Check }
    'Tag'      { Invoke-Tag }
  }
} finally {
  Pop-Location
}
