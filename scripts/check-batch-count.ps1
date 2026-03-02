$all = Invoke-RestMethod -Uri 'http://localhost:3001/api/properties' -Method Get
$matches = $all | Where-Object { $_.title -and ($_.title -match 'Batch Post' -or $_.title -match 'BATCH Post' -or $_.title -match 'Batch') }
$result = @{ total = $all.Count; matches = $matches.Count; samples = $matches | Select-Object -First 20 }
$result | ConvertTo-Json -Depth 10 | Out-File .\logs\check-batch-count.json -Encoding utf8
Write-Host "Wrote .\logs\check-batch-count.json"