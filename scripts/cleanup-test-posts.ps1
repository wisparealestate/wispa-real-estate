$base = 'http://localhost:3001'
# Fetch all properties (may be large) and delete those matching test patterns
$resp = Invoke-RestMethod -Uri ($base + '/api/properties') -Method Get
$all = $resp.properties
$pattern = 'batch post'
$pattern2 = 'test verify'
$out = @()
foreach ($p in $all) {
  $title = [string]$p.title
  if (($title -ne $null) -and (($title.ToLower()).Contains($pattern) -or ($title.ToLower()).Contains($pattern2))) {
    try {
      $del = Invoke-RestMethod -Uri ($base + '/api/properties/' + $p.id) -Method Delete -ErrorAction Stop
      Write-Host "Deleted id $($p.id) title: $title"
      $out += @{ id = $p.id; title = $title; deleted = $true }
    } catch {
      Write-Host "Failed to delete $($p.id): $($_.Exception.Message)"
      $out += @{ id = $p.id; title = $title; deleted = $false; error = $_.Exception.Message }
    }
  }
}
$out | ConvertTo-Json -Depth 5 | Out-File .\logs\cleanup-test-posts.json -Encoding utf8
Write-Host 'Cleanup complete. Results saved to .\logs\cleanup-test-posts.json'