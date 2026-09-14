# tools/css-diag.ps1
$cssPath = Join-Path $PSScriptRoot "..\css\style.css"
if(-not (Test-Path $cssPath)){
  Write-Host "ERROR: css/style.css not found: $cssPath" -ForegroundColor Red
  exit 1
}

$lines = Get-Content $cssPath
$targets = @("#app","#mission","#missionLevel","#missionText","#monitorWrap","#monitor","#hintLine","#feedback","#retryBtn","#resultPanel","#altPanel","#revealPanel","#predictBar","#tokenPad","#utilBar","#actionBar","#storyOverlay")

function Show-Block($selector){
  $start = -1
  for($i=0; $i -lt $lines.Count; $i++){
    if($lines[$i] -match "^\s*" + [regex]::Escape($selector) + "\s*[,{]"){ $start = $i; break }
  }
  if($start -eq -1){
    Write-Host "--- $selector : NOT FOUND ---" -ForegroundColor DarkGray
    return
  }
  $depth = 0
  $end = $start
  for($j=$start; $j -lt $lines.Count; $j++){
    $depth += ([regex]::Matches($lines[$j], "\{")).Count
    $depth -= ([regex]::Matches($lines[$j], "\}")).Count
    if($depth -eq 0 -and $j -gt $start){ $end = $j; break }
  }
  Write-Host ""
  Write-Host "===== $selector =====" -ForegroundColor Cyan
  for($k=$start; $k -le $end; $k++){
    Write-Host $lines[$k]
  }
}

Write-Host "CSS diag: $cssPath" -ForegroundColor Yellow
Write-Host "Total lines: $($lines.Count)"

foreach($t in $targets){ Show-Block $t }

Write-Host ""
Write-Host "===== MEDIA QUERIES =====" -ForegroundColor Cyan
for($i=0; $i -lt $lines.Count; $i++){
  if($lines[$i] -match "@media"){ Write-Host ("line {0}: {1}" -f ($i+1), $lines[$i]) }
}

Write-Host ""
Write-Host "===== FONT-FAMILY =====" -ForegroundColor Cyan
for($i=0; $i -lt $lines.Count; $i++){
  if($lines[$i] -match "font-family"){ Write-Host ("line {0}: {1}" -f ($i+1), $lines[$i].Trim()) }
}

Write-Host ""
Write-Host "===== FONT-SIZE (hint/mission/monitor/tok/reveal) =====" -ForegroundColor Cyan
$inBlock = ""
for($i=0; $i -lt $lines.Count; $i++){
  if($lines[$i] -match "^\s*(#[A-Za-z0-9_\-]+|[A-Za-z0-9_\-\.]+)\s*[,{]"){ $inBlock = $lines[$i].Trim() }
  if($lines[$i] -match "font-size"){
    if($inBlock -match "hintLine|mission|monitor|feedback|tok|step p|reveal|story|exam"){
      Write-Host ("line {0} [{1}]: {2}" -f ($i+1), $inBlock, $lines[$i].Trim())
    }
  }
}