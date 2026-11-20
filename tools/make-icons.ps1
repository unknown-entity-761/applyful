# Draws the PNG app icons used on phone home screens (same design as app/icons/icon.svg).
# Run again after changing the design:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-icons.ps1
param([string]$OutDir = (Join-Path $PSScriptRoot '..\app\icons'))

Add-Type -AssemblyName System.Drawing

$brand = [System.Drawing.ColorTranslator]::FromHtml('#3B5BDB')

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon([int]$size, [string]$file) {
    $s = [float]$size
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear($brand) # full square: phones round the corners themselves

    # Handle first, so the case covers its lower half
    $handlePen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::White), ([float]($s * 0.055))
    $handle = New-RoundedRectPath ($s * 0.39) ($s * 0.25) ($s * 0.22) ($s * 0.16) ($s * 0.045)
    $g.DrawPath($handlePen, $handle)

    # Case
    $body = New-RoundedRectPath ($s * 0.22) ($s * 0.36) ($s * 0.56) ($s * 0.38) ($s * 0.07)
    $g.FillPath([System.Drawing.Brushes]::White, $body)

    # Tick
    $tickPen = New-Object System.Drawing.Pen -ArgumentList $brand, ([float]($s * 0.05))
    $tickPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $tickPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $tickPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $points = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($s * 0.405, $s * 0.555),
        [System.Drawing.PointF]::new($s * 0.475, $s * 0.625),
        [System.Drawing.PointF]::new($s * 0.6, $s * 0.49)
    )
    $g.DrawLines($tickPen, $points)

    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $handlePen.Dispose(); $tickPen.Dispose(); $handle.Dispose(); $body.Dispose()
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
New-Icon 192 (Join-Path $OutDir 'icon-192.png')
New-Icon 512 (Join-Path $OutDir 'icon-512.png')
New-Icon 180 (Join-Path $OutDir 'apple-touch-icon.png')
Write-Host "Icons written to $OutDir"
