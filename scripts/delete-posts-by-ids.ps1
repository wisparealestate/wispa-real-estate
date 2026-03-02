$base = 'http://localhost:3001'
$data = Get-Content -Path .\logs\batch-post-90-output.json -Raw | ConvertFrom-Json
$out = @()
foreach ($entry in $data) {
  $id = $entry.propertyId
  if ($id) {
    try {
      $del = Invoke-RestMethod -Uri ($base + '/api/properties/' + $id) -Method Delete -ErrorAction Stop
      Write-Host "Deleted id $id"
      $out += @{ id = $id; deleted = $true }
    } catch {
      $err = $_.Exception.Message
      Write-Host ("Failed to delete {0}: {1}" -f $id, $err)
      $out += @{ id = $id; deleted = $false; error = $err }
    }
  }
}
$out | ConvertTo-Json -Depth 5 | Out-File .\logs\delete-posts-by-ids-result.json -Encoding utf8
Write-Host 'Done. Results saved to .\logs\delete-posts-by-ids-result.json'