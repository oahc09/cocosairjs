# tiles.png: two 16x16 tiles — stone (gray, GID1) and plank (brown, GID2) for the platformer recipe.
Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
$bitmap = New-Object System.Drawing.Bitmap 32, 16
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$stone = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 110, 110, 118))
$plank = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 150, 100, 60))
$stoneTop = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 140, 140, 150))
$g.FillRectangle($stone, 0, 0, 16, 16)
$g.FillRectangle($stoneTop, 0, 0, 16, 3)
$g.FillRectangle($plank, 16, 0, 16, 16)
$g.Dispose()
# plank texture lines
$g2 = [System.Drawing.Graphics]::FromImage($bitmap)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 110, 70, 40))
$g2.DrawLine($pen, 16, 5, 31, 5)
$g2.DrawLine($pen, 16, 10, 31, 10)
$g2.Dispose()
$path = Join-Path $root 'tiles.png'
$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Output "saved $path"
