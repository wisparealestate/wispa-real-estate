$api='http://localhost:3001/api/properties'
$out = @()
for ($i=1; $i -le 5; $i++) {
  $title = "Hot Batch Post $i $(Get-Date -UFormat %s)"
  $photo1 = "https://via.placeholder.com/800x600?text=Hot+$i+1"
  $photo2 = "https://via.placeholder.com/800x600?text=Hot+$i+2"
  $body = @{
    property = @{
      title = $title
      price = 150 * $i
      address = "Hot Batch Addr $i"
      description = "Hot batch upload $i"
      post_to = "hot"
    }
    photoUrls = @($photo1, $photo2)
  } | ConvertTo-Json -Depth 6
  try {
    $r = Invoke-RestMethod -Uri $api -Method Post -ContentType 'application/json' -Body $body -ErrorAction Stop
    $out += $r
    Write-Host "Posted $i -> id: $($r.propertyId) image_url: $($r.property.image_url)"
  } catch {
    Write-Host "POST $i failed: $($_.Exception.Message)"
    $out += @{ error = $_.Exception.Message; i = $i }
  }
}
$out | ConvertTo-Json -Depth 10
