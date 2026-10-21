<#
.SYNOPSIS
    Vigia ligero de Katra: corre en esta PC, mira el VPS por Tailscale y avisa cuando algo se rompe.

.DESCRIPTION
    Herramienta interna. No hay agente en el servidor ni puertos nuevos: usa la malla que ya existe
    (`dokploy-vps` y `katra-imperial` estan en el tailnet) y el mismo SSH con llave que se usa para
    desplegar. La PC tiene que estar prendida; si se apaga, se apaga el vigia (tradeoff aceptado).

    Que mira:
      - tailnet          los dos nodos del VPS siguen online
      - idp-admin        el app de Katra responde en su endpoint privado (3002 via tailscale)
      - tenants          los 5 productos: discovery OIDC y /api/status, por la via publica (lo que ve el usuario)
      - guide            la guia canonica responde y en que version
      - containers       los 3 contenedores corren y tienen restart=always
      - backup           antiguedad del ultimo dump de la base
      - disco / memoria  capacidad del VPS

    Salidas en %LOCALAPPDATA%\katra-watch: state.json (maquina), dashboard.html (persona) y watch.log.
    Avisa con un globo de Windows solo cuando el estado CAMBIA, para no volverse ruido.

.EXAMPLE
    .\scripts\katra-watch.ps1 -Init          # escribe la config una vez (saca host/llave de edgePass)

.EXAMPLE
    .\scripts\katra-watch.ps1 -Once          # una pasada, imprime el resumen

.EXAMPLE
    .\scripts\katra-watch.ps1 -Install       # tarea programada cada 5 minutos (usuario actual, sin UAC)

.EXAMPLE
    .\scripts\katra-watch.ps1 -Dashboard     # abre el tablero
#>
[CmdletBinding()]
param(
  [switch] $Once,
  [switch] $Init,
  [switch] $Install,
  [switch] $Dashboard,
  [switch] $NoToast
)

$ErrorActionPreference = 'Continue'

$Root = Join-Path $env:LOCALAPPDATA 'katra-watch'
$StatePath = Join-Path $Root 'state.json'
$DashboardPath = Join-Path $Root 'dashboard.html'
$ConfigPath = Join-Path $Root 'config.json'
$LogPath = Join-Path $Root 'watch.log'
$GuideUrl = 'https://lotly.lat/auth/api/katra/integration-guide'

New-Item -ItemType Directory -Force -Path $Root | Out-Null

$tenants = @(
  @{ name = 'Lotly'; base = 'https://lotly.lat/auth' }
  @{ name = 'KSH'; base = 'https://ksh.networkvoid.xyz/auth' }
  @{ name = 'VetGroom'; base = 'https://app.vetgroom.com.mx/auth' }
  @{ name = 'Propflow'; base = 'https://propflow.kairova.services/auth' }
  @{ name = 'VetGroom demo'; base = 'https://demo.vetgroom.com.mx/auth' }
)

function Get-Config {
  if (-not (Test-Path $ConfigPath)) { return $null }
  return Get-Content $ConfigPath -Raw | ConvertFrom-Json
}

function Save-Config($config) {
  $config | ConvertTo-Json -Depth 4 | Set-Content -Path $ConfigPath -Encoding utf8
}

function Invoke-EdgePass([string] $json, [int] $connectMs = 4000) {
  $pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'edgepass', [System.IO.Pipes.PipeDirection]::InOut)
  try {
    $pipe.Connect($connectMs)
    $writer = New-Object System.IO.StreamWriter($pipe)
    $writer.AutoFlush = $true
    $reader = New-Object System.IO.StreamReader($pipe)
    $writer.WriteLine($json)
    return $reader.ReadLine()
  } finally {
    $pipe.Dispose()
  }
}

function Initialize-Watch {
  $probe = Join-Path $env:TEMP 'katra-watch-probe.ps1'
  $lines = @(
    '$ErrorActionPreference = "SilentlyContinue"',
    'Write-Output "$env:VPS_SSH_USER|$env:VPS_SSH_KEY_PATH|$env:VPS_SSH_PORT"'
  )
  [System.IO.File]::WriteAllText($probe, ($lines -join "`n"), (New-Object System.Text.UTF8Encoding($false)))

  $payload = @{
    op      = 'run'
    entries = @(@{ namespace = 'dokploy'; path = 'global' })
    keys    = @('VPS_SSH_USER', 'VPS_SSH_KEY_PATH', 'VPS_SSH_PORT')
    cmd     = @('powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $probe)
    timeoutSecs = 60
  } | ConvertTo-Json -Compress -Depth 5

  $response = Invoke-EdgePass $payload | ConvertFrom-Json
  $parts = ($response.stdout -split "`n")[0].Trim() -split '\|'
  Remove-Item $probe -Force -ErrorAction SilentlyContinue

  if ($parts.Count -lt 2 -or -not $parts[1]) { throw 'edgePass no devolvio VPS_SSH_USER/VPS_SSH_KEY_PATH' }

  # Nombre MagicDNS del VPS en el tailnet; si no resuelve, se cae al IP de Tailscale.
  $sshHost = 'dokploy-vps'
  $save = @{
    SshHost    = $sshHost
    SshHostAlt = '100.72.8.21'
    SshUser    = $parts[0]
    SshPort    = if ($parts[2]) { $parts[2] } else { '22' }
    SshKeyPath = $parts[1]
  }
  Save-Config $save
  Write-Host "Config escrita en $ConfigPath (host $sshHost, usuario $($save.SshUser))" -ForegroundColor Green
}

function Test-Http([string] $url, [int[]] $expect, [int] $timeoutSecs = 12) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  # curl.exe y no Invoke-WebRequest: este host puede ser Windows PowerShell 5.1, que no tiene
  # -SkipHttpErrorCheck, y un 404/500 tiene que ser un resultado, no una excepcion.
  $code = & curl.exe -s -o NUL -w "%{http_code}" --max-time $timeoutSecs --url $url 2>$null
  $sw.Stop()

  $status = 0
  [void][int]::TryParse(([string]$code).Trim(), [ref]$status)

  return [pscustomobject]@{
    ok     = $status -ne 0 -and $expect -contains $status
    detail = if ($status -eq 0) { 'sin respuesta' } else { "HTTP $status" }
    ms     = [int]$sw.ElapsedMilliseconds
    code   = $status
  }
}

function Invoke-Remote($config, [string] $command) {
  # Ojo: no usar $args, es automatica de PowerShell y asignarle rompe la llamada al exe.
  $targets = @("$($config.SshUser)@$($config.SshHost)")
  if ($config.SshHostAlt) { $targets += "$($config.SshUser)@$($config.SshHostAlt)" }

  foreach ($target in $targets) {
    $sshArgs = @(
      '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8'
      '-p', "$($config.SshPort)", '-i', $config.SshKeyPath, $target, $command
    )
    $output = & ssh @sshArgs 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and $output.Trim() -ne '') { return $output }
  }

  return ''
}

function Add-Check($list, [string] $name, [string] $status, [string] $detail, [int] $ms = 0) {
  $list.Add([pscustomobject]@{ name = $name; status = $status; detail = $detail; ms = $ms })
}

function Invoke-Checks($config) {
  $checks = New-Object System.Collections.Generic.List[object]

  # 1. Tailnet: si los nodos no estan, todo lo de abajo sobra.
  $peers = (& tailscale status 2>$null) | Out-String
  $vpsOnline = $peers -match 'dokploy-vps' -and $peers -notmatch 'dokploy-vps.*offline'
  $idpOnline = $peers -match 'katra-imperial' -and $peers -notmatch 'katra-imperial.*offline'
  Add-Check $checks 'tailnet' $(if ($vpsOnline -and $idpOnline) { 'ok' } else { 'fail' }) `
    $(if ($vpsOnline -and $idpOnline) { 'dokploy-vps y katra-imperial online' } else { 'un nodo del tailnet esta offline' })

  # 2. App privada (3002 por tailscale).
  $admin = Test-Http 'https://katra-imperial.tailfadff7.ts.net:8443/api/status' @(204) 10
  Add-Check $checks 'idp-admin' $(if ($admin.ok) { 'ok' } else { 'fail' }) $admin.detail $admin.ms

  # 3. Productos: lo que ve el usuario.
  foreach ($tenant in $tenants) {
    $discovery = Test-Http "$($tenant.base)/oidc/.well-known/openid-configuration" @(200)
    $status = Test-Http "$($tenant.base)/api/status" @(204, 200)
    $ok = $discovery.ok -and $status.ok
    $detail = if ($ok) { "discovery $($discovery.ms)ms, status $($status.ms)ms" } else { "discovery $($discovery.detail), status $($status.detail)" }
    Add-Check $checks "tenant:$($tenant.name)" $(if ($ok) { 'ok' } else { 'fail' }) $detail ($discovery.ms + $status.ms)
  }

  # 4. Guia canonica.
  $guide = Test-Http $GuideUrl @(200)
  Add-Check $checks 'guide' $(if ($guide.ok) { 'ok' } else { 'fail' }) $guide.detail $guide.ms

  # 5-7. Estado del VPS por SSH sobre tailnet.
  # El script remoto va en here-string de comillas simples para que $P y $6 lleguen literales a bash.
  $remote = @'
P=compose-calculate-neural-protocol-dfz99a
for c in $P-app-1 $P-postgres-1 $P-backup-1; do docker inspect -f '{{.Name}}|{{.State.Status}}|{{.HostConfig.RestartPolicy.Name}}' $c; done
echo MARK_BACKUP
docker exec $P-backup-1 ls -1 /backups 2>/dev/null | sort | tail -1
echo MARK_DISK
df -P / | tail -1 | awk '{print $5}'
echo MARK_MEM
awk '/MemAvailable/ {print $2}' /proc/meminfo
echo MARK_UP
echo $(( $(cut -d. -f1 /proc/uptime) / 86400 ))
'@

  $raw = Invoke-Remote $config $remote
  $lines = @($raw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

  $containers = @($lines | Where-Object { $_ -match '\|(running|exited|restarting|created)\|' })
  $badContainers = @($containers | Where-Object { $_ -notmatch '\|running\|always$' })
  Add-Check $checks 'containers' `
    $(if ($containers.Count -ge 3 -and $badContainers.Count -eq 0) { 'ok' } elseif ($containers.Count -eq 0) { 'fail' } else { 'warn' }) `
    $(if ($containers.Count -eq 0) { 'sin respuesta del VPS' } elseif ($badContainers.Count -eq 0) { "$($containers.Count) corriendo con restart=always" } else { "revisar: $($badContainers -join ' / ')" })

  $section = { param($name) $i = [array]::IndexOf($lines, $name); if ($i -ge 0 -and $i + 1 -lt $lines.Count) { $lines[$i + 1] } }

  $backupName = & $section 'MARK_BACKUP'
  # El nombre trae la fecha (katra-YYYYMMDD-HHMMSS.dump): el `ls` de BusyBox en alpine no soporta
  # --time-style, asi que la antiguedad se lee del nombre y no del sistema de archivos.
  if ($backupName -match 'katra-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump') {
    # El nombre lo escribe `date` en UTC dentro del contenedor; comparar contra hora local da edad
    # negativa (el bug que tenia este vigia en su primera corrida).
    $stampUtc = [datetime]::SpecifyKind(
      (Get-Date -Year $Matches[1] -Month $Matches[2] -Day $Matches[3] -Hour $Matches[4] -Minute $Matches[5] -Second $Matches[6]),
      [System.DateTimeKind]::Utc
    )
    $ageHours = [math]::Round(([datetime]::UtcNow - $stampUtc).TotalHours, 1)
    if ($ageHours -lt 0) { $ageHours = 0 }
    $status = if ($ageHours -le 26) { 'ok' } elseif ($ageHours -le 48) { 'warn' } else { 'fail' }
    Add-Check $checks 'backup' $status "ultimo dump hace $ageHours h ($backupName)"
  } else {
    Add-Check $checks 'backup' 'fail' 'no se pudo leer el ultimo dump'
  }

  $disk = & $section 'MARK_DISK'
  if ($disk -match '^\d+%$') {
    $pct = [int]($disk -replace '%', '')
    Add-Check $checks 'disco' $(if ($pct -ge 90) { 'fail' } elseif ($pct -ge 80) { 'warn' } else { 'ok' }) "uso $disk"
  }

  $memKb = & $section 'MARK_MEM'
  if ($memKb -match '^\d+$') {
    $freeGb = [math]::Round([int64]$memKb / 1MB, 1)
    Add-Check $checks 'memoria' $(if ($freeGb -lt 0.5) { 'warn' } else { 'ok' }) "$freeGb GB disponibles"
  }

  $uptimeDays = & $section 'MARK_UP'
  if ($uptimeDays -match '^\d+$') {
    Add-Check $checks 'vps-uptime' 'ok' "$uptimeDays dias sin reiniciar"
  }

  return $checks
}

function Get-Overall($checks) {
  if (@($checks | Where-Object { $_.status -eq 'fail' }).Count -gt 0) { return 'fail' }
  if (@($checks | Where-Object { $_.status -eq 'warn' }).Count -gt 0) { return 'warn' }
  return 'ok'
}

function Write-Dashboard($checks, [string] $overall) {
  $colors = @{ ok = '#2ecc71'; warn = '#f1c40f'; fail = '#e74c3c' }
  $rows = ($checks | ForEach-Object {
    $color = $colors[$_.status]
    "<tr><td class='dot' style='color:$color'>&#9679;</td><td>$($_.name)</td><td style='color:$color'>$($_.status)</td><td class='detail'>$([System.Net.WebUtility]::HtmlEncode($_.detail))</td><td class='ms'>$($_.ms) ms</td></tr>"
  }) -join "`n"

  $html = @"
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="60">
<title>Katra · vigia</title>
<style>
 body{background:#11151c;color:#e6edf3;font:14px/1.5 ui-monospace,Consolas,monospace;margin:0;padding:28px}
 h1{font-size:16px;font-weight:600;margin:0 0 4px}
 .meta{color:#7d8590;margin-bottom:20px}
 .pill{display:inline-block;padding:2px 10px;border-radius:99px;font-weight:700;color:#0d1117;background:$($colors[$overall])}
 table{border-collapse:collapse;width:100%;max-width:900px}
 td{padding:7px 10px;border-bottom:1px solid #21262d;vertical-align:top}
 .dot{width:14px}.detail{color:#9aa4af}.ms{color:#6e7681;text-align:right}
 footer{margin-top:24px;color:#6e7681;font-size:12px}
</style></head><body>
<h1>Katra · estado</h1>
<div class="meta"><span class="pill">$overall</span> &nbsp; actualizado $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</div>
<table>$rows</table>
<footer>Vigia local sobre Tailscale · reglas cada 5 min · este tablero se recarga solo</footer>
</body></html>
"@
  Set-Content -Path $DashboardPath -Value $html -Encoding utf8
}

function Send-Toast([string] $title, [string] $text) {
  if ($NoToast) { return }
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Warning
    $icon.Visible = $true
    $icon.ShowBalloonTip(10000, $title, $text, [System.Windows.Forms.ToolTipIcon]::Warning)
    Start-Sleep -Seconds 6
    $icon.Dispose()
  } catch {
    Write-Verbose "sin toast: $($_.Exception.Message)"
  }
}

# ---------------------------------------------------------------- acciones

if ($Init) { Initialize-Watch; return }

if ($Dashboard) {
  if (-not (Test-Path $DashboardPath)) { Write-Host 'Todavia no hay tablero; corre -Once primero.' -ForegroundColor Yellow; return }
  Start-Process $DashboardPath
  return
}

if ($Install) {
  $script = $PSCommandPath
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Once"
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName 'KatraWatch' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host 'Tarea KatraWatch registrada (cada 5 minutos, solo cuando hay sesion).' -ForegroundColor Green
  Write-Host "Quitar con: Unregister-ScheduledTask -TaskName KatraWatch -Confirm:`$false"
  return
}

$config = Get-Config
if (-not $config) {
  Write-Host 'Falta la config. Corre -Init una vez.' -ForegroundColor Red
  exit 1
}

$started = Get-Date
$checks = Invoke-Checks $config
$overall = Get-Overall $checks

$previous = if (Test-Path $StatePath) { (Get-Content $StatePath -Raw | ConvertFrom-Json).overall } else { $null }

$state = [pscustomobject]@{
  overall   = $overall
  checkedAt = $started.ToString('o')
  durationMs = [int]((Get-Date) - $started).TotalMilliseconds
  checks    = $checks
}
$state | ConvertTo-Json -Depth 5 | Set-Content -Path $StatePath -Encoding utf8
Write-Dashboard $checks $overall

$line = "{0} {1,-5} {2} ({3} ms)" -f $started.ToString('yyyy-MM-dd HH:mm:ss'), $overall, (($checks | Where-Object { $_.status -ne 'ok' } | ForEach-Object { "$($_.name)=$($_.detail)" }) -join '; '), $state.durationMs
Add-Content -Path $LogPath -Value $line

if ($Once -or -not $Install) {
  foreach ($check in $checks) {
    $mark = switch ($check.status) { 'ok' { 'OK  ' } 'warn' { 'WARN' } default { 'FAIL' } }
    Write-Host ("  {0} {1,-18} {2}" -f $mark, $check.name, $check.detail)
  }
  Write-Host ("  => {0} en {1} ms" -f $overall.ToUpper(), $state.durationMs) -ForegroundColor $(switch ($overall) { 'ok' { 'Green' } 'warn' { 'Yellow' } default { 'Red' } })
}

# Avisar solo en el cambio, y al recuperarse.
if ($previous -and $previous -ne $overall) {
  if ($overall -eq 'fail') {
    $bad = ($checks | Where-Object { $_.status -eq 'fail' } | ForEach-Object { $_.name }) -join ', '
    Send-Toast 'Katra: algo se rompio' $bad
  } elseif ($overall -eq 'ok') {
    Send-Toast 'Katra: todo en verde' 'Se recupero'
  }
}
