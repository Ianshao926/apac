# 手動跑完一整期(不等週一排程)。在 Windows PowerShell 執行:
#   .\scripts\run-now.ps1 -Url https://apac-radar.<子網域>.workers.dev -Token <ADMIN_TOKEN>
# 可加 -Week 2026-W42 指定週;不加就是「剛結束的那一週」。
# 只補跑某幾個品牌:-Only heytea,chagee
# 先單跑第一個品牌建立本期,其餘品牌再同時跑(預設一次 6 個)。
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Week = '',
  [int]$Parallel = 6,
  [string[]]$Only = @()
)
$ErrorActionPreference = 'Stop'
$Url = $Url.TrimEnd('/')
$headers = @{ 'x-admin-token' = $Token }
$wk = if ($Week) { "&week=$Week" } else { '' }
$brands = @('amah','heytea','mollytea','chagee','linlee','teastone','tealive','zus','liho','phuclong','katinat','macao','chatramue','nayuki','chunshuitang','kebuke','milksha')
if ($Only.Count) { $brands = $Only }

function Run-Brand($b) {
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$Url/admin/run?brand=$b$wk" -Headers $headers -TimeoutSec 900
    "{0,-13} {1,-6} 找到 {2} 則  {3} 秒" -f $b, $r.status, $r.found, [math]::Round($r.ms / 1000)
  } catch { "{0,-13} 失敗: {1}" -f $b, $_.Exception.Message }
}

$t0 = Get-Date
Write-Host "1/2 先跑 $($brands[0]) 建立本期..."
Run-Brand $brands[0]

Write-Host "2/2 其餘 $($brands.Count - 1) 個品牌,一次 $Parallel 個..."
$rest = @($brands | Select-Object -Skip 1)
$jobs = @()
foreach ($b in $rest) {
  while (@($jobs | Where-Object { $_.State -eq 'Running' }).Count -ge $Parallel) { Start-Sleep -Seconds 3 }
  $jobs += Start-Job -ArgumentList $Url, $Token, $wk, $b -ScriptBlock {
    param($Url, $Token, $wk, $b)
    try {
      $r = Invoke-RestMethod -Method Post -Uri "$Url/admin/run?brand=$b$wk" -Headers @{ 'x-admin-token' = $Token } -TimeoutSec 900
      "{0,-13} {1,-6} 找到 {2} 則  {3} 秒" -f $b, $r.status, $r.found, [math]::Round($r.ms / 1000)
    } catch { "{0,-13} 失敗: {1}" -f $b, $_.Exception.Message }
  }
}
$jobs | Wait-Job | Receive-Job
$jobs | Remove-Job

$s = Invoke-RestMethod -Method Post -Uri "$Url/admin/status?x=1$wk" -Headers $headers
Write-Host ""
Write-Host ("本期 {0},共花 {1} 分鐘" -f $s.issue.week, [math]::Round(((Get-Date) - $t0).TotalMinutes, 1))
if ($s.pending.Count) { Write-Host "還沒成功的品牌: $($s.pending -join ',')。補跑: .\scripts\run-now.ps1 -Url $Url -Token <ADMIN_TOKEN> -Only $($s.pending -join ',')" }
$tin = ($s.runs | Measure-Object input_tokens -Sum).Sum; $tout = ($s.runs | Measure-Object output_tokens -Sum).Sum
Write-Host ("Token: 輸入 {0:N0},輸出 {1:N0}" -f $tin, $tout)
Write-Host "預覽: $Url/w/$($s.issue.week)?k=<ADMIN_TOKEN>"
Write-Host "看過沒問題再發布(會推 Teams): Invoke-RestMethod -Method Post -Uri `"$Url/admin/publish?week=$($s.issue.week)`" -Headers @{ 'x-admin-token' = '<ADMIN_TOKEN>' }"
