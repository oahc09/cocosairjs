# Generate asymmetric-color atlas fixture PNGs (browser UV/trim pixel anchors).
# Coordinates are top-left origin, matching libGDX .atlas xy semantics.
Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot

function New-Brush([int]$r, [int]$g, [int]$b) {
    New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($r, $g, $b))
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$name) {
    $path = Join-Path $root $name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Output "saved $name"
}

# page-0.png 32x16: plain(0,0 8x8) red+white anchor | hero packed(8,0 12x4) magenta|orange | trimmed(20,0 8x8) green+dark bottom
$p0 = New-Object System.Drawing.Bitmap 32, 16
$g = [System.Drawing.Graphics]::FromImage($p0)
$bg = New-Brush 40 40 48
$g.FillRectangle($bg, 0, 0, 32, 16)
$red = New-Brush 200 60 60
$g.FillRectangle($red, 0, 0, 8, 8)                                # plain
$p0.SetPixel(0, 0, [System.Drawing.Color]::FromArgb(255, 255, 255)) # plain top-left anchor
$magenta = New-Brush 200 60 200
$g.FillRectangle($magenta, 8, 0, 6, 4)                            # hero packed left half
$orange = New-Brush 230 140 40
$g.FillRectangle($orange, 14, 0, 6, 4)                            # hero packed right half
$green = New-Brush 60 180 90
$g.FillRectangle($green, 20, 0, 8, 8)                             # trimmed
$darkGreen = New-Brush 30 90 50
$g.FillRectangle($darkGreen, 20, 6, 8, 2)                         # trimmed bottom band
$g.Dispose()
Save-Png $p0 'page-0.png'

# page-1.png 16x16: walk frames (0,0)(4,0)(8,0) each 4x4, three brightness steps
$p1 = New-Object System.Drawing.Bitmap 16, 16
$g = [System.Drawing.Graphics]::FromImage($p1)
$g.FillRectangle($bg, 0, 0, 16, 16)
$b1 = New-Brush 80 110 160
$b2 = New-Brush 150 180 220
$b3 = New-Brush 230 240 255
$g.FillRectangle($b1, 0, 0, 4, 4)
$g.FillRectangle($b2, 4, 0, 4, 4)
$g.FillRectangle($b3, 8, 0, 4, 4)
$g.Dispose()
Save-Png $p1 'page-1.png'

# newpage.png 16x16: blob bounds(0,0 8x8) cyan + dark bottom band (bounds-format fixture)
$pn = New-Object System.Drawing.Bitmap 16, 16
$g = [System.Drawing.Graphics]::FromImage($pn)
$g.FillRectangle($bg, 0, 0, 16, 16)
$cyan = New-Brush 70 200 200
$g.FillRectangle($cyan, 0, 0, 8, 8)
$teal = New-Brush 20 60 60
$g.FillRectangle($teal, 0, 6, 8, 2)
$g.Dispose()
Save-Png $pn 'newpage.png'
