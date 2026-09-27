Add-Type -AssemblyName System.Drawing

function CreateRoundedRectPath([System.Drawing.RectangleF]$rect, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2.0
    $arc = [System.Drawing.RectangleF]::new($rect.X, $rect.Y, $diameter, $diameter)

    $path.AddArc($arc, 180, 90)
    $arc.X = $rect.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $rect.X
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function Generate-SwissLoupeIcon([int]$size, [string]$outputPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Squircle Canvas
    $pad = [Math]::Max(0.5, $size * 0.02)
    if ($size -le 32) { $pad = 0.5 }
    $rect = [System.Drawing.RectangleF]::new($pad, $pad, $size - (2.0 * $pad), $size - (2.0 * $pad))
    $radius = [Math]::Max(2.5, $size * 0.22)

    # Apple Cupertino Azure-to-Deep-Sapphire Glass Gradient
    $colorTop = [System.Drawing.Color]::FromArgb(255, 10, 132, 255)   # #0A84FF
    $colorBottom = [System.Drawing.Color]::FromArgb(255, 0, 36, 96)  # #002460 Deep Optical Blue
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $colorTop, $colorBottom, 125.0)

    $bgPath = CreateRoundedRectPath $rect $radius
    $g.FillPath($brush, $bgPath)

    if ($size -ge 48) {
        $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45, 255, 255, 255), 1.0)
        $g.DrawPath($borderPen, $bgPath)
        $borderPen.Dispose()
    }

    $brush.Dispose()
    $bgPath.Dispose()

    # Geometry for Swiss Loupe / Sanctuary Lens
    $white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
    $transWhite = [System.Drawing.Color]::FromArgb(165, 255, 255, 255)
    $tickWhite = [System.Drawing.Color]::FromArgb(225, 255, 255, 255)
    $dotBrush = New-Object System.Drawing.SolidBrush($white)

    if ($size -ge 128) {
        # Outer Optical Rim (Bevel of the Loupe)
        $pRim = New-Object System.Drawing.Pen($white, 5.2)
        $g.DrawEllipse($pRim, 26.0, 26.0, 76.0, 76.0)
        $pRim.Dispose()

        # Inner Precision Reticle (Optical Micro-calibers)
        $pDial = New-Object System.Drawing.Pen($transWhite, 2.6)
        $g.DrawEllipse($pDial, 42.0, 42.0, 44.0, 44.0)
        $pDial.Dispose()

        # 4 Cardinal Optical Ticks (North, East, South, West)
        $pTick = New-Object System.Drawing.Pen($tickWhite, 3.0)
        $pTick.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pTick.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($pTick, 64.0, 26.0, 64.0, 36.0)
        $g.DrawLine($pTick, 64.0, 92.0, 64.0, 102.0)
        $g.DrawLine($pTick, 26.0, 64.0, 36.0, 64.0)
        $g.DrawLine($pTick, 92.0, 64.0, 102.0, 64.0)
        $pTick.Dispose()

        # Central Sanctuary Focal Core
        $g.FillEllipse($dotBrush, 56.5, 56.5, 15.0, 15.0)

    } elseif ($size -ge 48) {
        # 48x48
        $pRim = New-Object System.Drawing.Pen($white, 2.4)
        $g.DrawEllipse($pRim, 9.5, 9.5, 29.0, 29.0)
        $pRim.Dispose()

        $pDial = New-Object System.Drawing.Pen($transWhite, 1.4)
        $g.DrawEllipse($pDial, 15.5, 15.5, 17.0, 17.0)
        $pDial.Dispose()

        $pTick = New-Object System.Drawing.Pen($tickWhite, 1.8)
        $pTick.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pTick.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($pTick, 24.0, 9.5, 24.0, 13.5)
        $g.DrawLine($pTick, 24.0, 34.5, 24.0, 38.5)
        $g.DrawLine($pTick, 9.5, 24.0, 13.5, 24.0)
        $g.DrawLine($pTick, 34.5, 24.0, 38.5, 24.0)
        $pTick.Dispose()

        $g.FillEllipse($dotBrush, 21.0, 21.0, 6.0, 6.0)

    } elseif ($size -ge 32) {
        # 32x32
        $pRim = New-Object System.Drawing.Pen($white, 1.8)
        $g.DrawEllipse($pRim, 6.5, 6.5, 19.0, 19.0)
        $pRim.Dispose()

        $pDial = New-Object System.Drawing.Pen($transWhite, 1.1)
        $g.DrawEllipse($pDial, 10.5, 10.5, 11.0, 11.0)
        $pDial.Dispose()

        $pTick = New-Object System.Drawing.Pen($tickWhite, 1.4)
        $pTick.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pTick.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($pTick, 16.0, 6.5, 16.0, 9.2)
        $g.DrawLine($pTick, 16.0, 22.8, 16.0, 25.5)
        $g.DrawLine($pTick, 6.5, 16.0, 9.2, 16.0)
        $g.DrawLine($pTick, 22.8, 16.0, 25.5, 16.0)
        $pTick.Dispose()

        $g.FillEllipse($dotBrush, 14.0, 14.0, 4.0, 4.0)

    } else {
        # 16x16: Ultra-crisp toolbar calibration
        $pRim = New-Object System.Drawing.Pen($white, 1.4)
        $g.DrawEllipse($pRim, 3.0, 3.0, 10.0, 10.0)
        $pRim.Dispose()

        $pTick = New-Object System.Drawing.Pen($tickWhite, 1.2)
        $pTick.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pTick.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($pTick, 8.0, 1.5, 8.0, 4.2)
        $g.DrawLine($pTick, 8.0, 11.8, 8.0, 14.5)
        $g.DrawLine($pTick, 1.5, 8.0, 4.2, 8.0)
        $g.DrawLine($pTick, 11.8, 8.0, 14.5, 8.0)
        $pTick.Dispose()

        $g.FillEllipse($dotBrush, 7.0, 7.0, 2.0, 2.0)
    }

    $dotBrush.Dispose()
    $g.Flush()
    $g.Dispose()

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated Swiss Loupe icon: $outputPath ($size x $size)"
}

$targetDir = "$PSScriptRoot\..\public"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

Generate-SwissLoupeIcon 16  "$targetDir\icon-16.png"
Generate-SwissLoupeIcon 32  "$targetDir\icon-32.png"
Generate-SwissLoupeIcon 48  "$targetDir\icon-48.png"
Generate-SwissLoupeIcon 128 "$targetDir\icon-128.png"
