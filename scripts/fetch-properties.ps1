$ids = @(60003363,17730840,23031102,97538888,99409368)
$out = @()
foreach ($id in $ids) {
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:3001/api/properties/$id" -Method Get -ErrorAction Stop
    $obj = [ordered]@{ id = $id; ok = $true; property = ($r.property ? $r.property : $r) }
    $out += $obj
    Write-Host "Fetched $id"
  } catch {
    $out += [ordered]@{ id = $id; ok = $false; error = $_.Exception.Message }
    Write-Host "Failed $id: $($_.Exception.Message)"
  }
}
$out | ConvertTo-Json -Depth 12
