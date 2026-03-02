param([int]$N = 10)
$base = 'http://localhost:3001'
$out = @()
for ($i=1; $i -le $N; $i++) {
  $title = "INTEGRATION Test $i $(Get-Date -UFormat %s)"
  $body = @{ property = @{ title = $title; price = 1; address = "integration addr $i"; description = "integration"; post_to = 'available' } }
  $json = $body | ConvertTo-Json -Depth 6
  try {
    $r = Invoke-RestMethod -Uri ($base + '/api/properties') -Method Post -ContentType 'application/json' -Body $json -ErrorAction Stop
    $out += @{ id = $r.propertyId; title = $r.property.title }
    Write-Host "Posted $i -> $($r.propertyId)"
  } catch {
    Write-Host "POST failed: $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 100
}
# Wait a moment then fetch all recent properties and count matches
Start-Sleep -Seconds 1
$resp = Invoke-RestMethod -Uri ($base + '/api/debug/properties-recent') -Method Get
$matches = $resp.recent | Where-Object { $_.title -and ($_.title -match '^INTEGRATION Test') }
$result = @{ posted = $out.Count; recent_matches = $matches.Count; postedIds = $out }
$result | ConvertTo-Json -Depth 10 | Out-File .\logs\integration-post-validate.json -Encoding utf8
Write-Host "Done. Posted $($out.Count). Recent matches: $($matches.Count). Saved to logs\integration-post-validate.json"