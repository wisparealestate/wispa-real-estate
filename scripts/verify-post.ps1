$body = @{ property = @{ title='TEST VERIFY ' + (Get-Date).ToString('s'); price=1; address='verify addr'; description='verify'; post_to='hot' } }
$json = ConvertTo-Json $body -Depth 6
try {
  $r = Invoke-RestMethod -Uri 'http://localhost:3001/api/properties' -Method Post -ContentType 'application/json' -Body $json -ErrorAction Stop
  Write-Output 'POST RESPONSE:'
  $r | ConvertTo-Json -Depth 5
} catch {
  Write-Output 'POST FAILED:'
  Write-Output $_.Exception.Message
}
try {
  $recent = Invoke-RestMethod -Uri 'http://localhost:3001/api/debug/properties-recent' -Method Get -ErrorAction Stop
  Write-Host 'RECENT COUNT:' ($recent.recent.Count)
  $recent | ConvertTo-Json -Depth 5 | Out-File -FilePath .\logs\verify-recent.json -Encoding utf8
  Write-Host 'Saved to logs\verify-recent.json'
} catch {
  Write-Output 'RECENT FETCH FAILED:'
  Write-Output $_.Exception.Message
}
