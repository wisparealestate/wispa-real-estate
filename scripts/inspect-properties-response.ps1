$all = Invoke-RestMethod -Uri 'http://localhost:3001/api/properties' -Method Get
Write-Host "TypeName: $($all.GetType().FullName)"
if ($all -is [System.Array]) { Write-Host "Array length: $($all.Length)" } else { Write-Host "Not an array; dumping keys:"; $all | Get-Member -MemberType NoteProperty | ForEach-Object { Write-Host $_.Name } }
$all | ConvertTo-Json -Depth 3 | Out-File .\logs\inspect-properties.json -Encoding utf8
Write-Host 'Saved to logs\inspect-properties.json'