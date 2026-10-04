# quad-pattern.png: 4x4 marker pattern for the PG-24 glTF pixel comparison (same colors as contract.ts).
Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
$colors = @(
    @(255,0,0,255), @(0,255,0,255), @(255,0,255,255), @(0,255,255,255),
    @(128,128,128,255), @(255,255,255,255), @(0,0,0,255), @(128,0,0,255),
    @(128,128,0,255), @(0,128,128,255), @(200,200,200,255), @(60,60,60,255),
    @(255,255,0,255), @(0,0,255,255), @(160,82,45,255), @(0,128,0,255)
)
$bitmap = New-Object System.Drawing.Bitmap 4, 4
for ($y = 0; $y -lt 4; $y++) {
    for ($x = 0; $x -lt 4; $x++) {
        $c = $colors[$y * 4 + $x]
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c[3], $c[0], $c[1], $c[2]))
    }
}
$path = Join-Path $root 'quad-pattern.png'
$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Output "saved $path"
