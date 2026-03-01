$api='http://localhost:3001/api/properties'
$out = @()
$sections = @('hot','featured','available')
foreach ($section in $sections) {
  for ($i=1; $i -le 30; $i++) {
    $ts = (Get-Date -UFormat %s)
    $title = "$($section.ToUpper()) Batch Post $i $ts"
    $photo1 = "https://via.placeholder.com/800x600?text=$($section)+$i+1"
    $photo2 = "https://via.placeholder.com/800x600?text=$($section)+$i+2"
    $body = @{
      property = @{
        title = $title
        price = 100 * $i
        address = "$section Batch Addr $i"
        description = "$section batch upload $i"
        post_to = $section
      }
      photoUrls = @($photo1, $photo2)
    } | ConvertTo-Json -Depth 6
    try {
      $r = Invoke-RestMethod -Uri $api -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop
      $out += $r
      Write-Host "Posted $section $i -> id: $($r.propertyId)"
    } catch {
      Write-Host "POST $section $i failed: $($_.Exception.Message)"
      $out += @{ error = $_.Exception.Message; section = $section; i = $i }
    }
    Start-Sleep -Milliseconds 100
  }
}
# Ensure logs directory exists
if (!(Test-Path -Path .\logs)) { New-Item -ItemType Directory -Path .\logs | Out-Null }
Write-Host "Fetching recent properties..."
try {
  $recent = Invoke-RestMethod -Uri 'http://localhost:3001/api/debug/properties-recent' -Method Get -ErrorAction Stop
  Write-Host 'Recent count:' $recent.recent.Count
  $recent | ConvertTo-Json -Depth 5 | Out-File -FilePath .\logs\batch-post-90-result.json -Encoding utf8
  Write-Host "Saved recent to .\logs\batch-post-90-result.json"
} catch {
  Write-Host "Failed to fetch recent: $($_.Exception.Message)"
}
$out | ConvertTo-Json -Depth 10 | Out-File -FilePath .\logs\batch-post-90-output.json -Encoding utf8
Write-Host "Done. Outputs saved to .\logs\batch-post-90-output.json"
