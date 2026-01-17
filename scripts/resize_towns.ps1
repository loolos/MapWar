Add-Type -AssemblyName System.Drawing

$files = @("town_level_1.png", "town_level_2.png", "town_level_3.png")
$basePath = "c:\Users\loolo\OneDrive\Documents\Project\MapWar\public\assets"

foreach ($file in $files) {
    $fullPath = Join-Path $basePath $file
    if (Test-Path $fullPath) {
        try {
            Write-Host "Processing $file..."
            
            # Load original image
            $img = [System.Drawing.Image]::FromFile($fullPath)
            
            # Create new 64x64 bitmap
            $newImg = New-Object System.Drawing.Bitmap(64, 64)
            $graph = [System.Drawing.Graphics]::FromImage($newImg)
            
            # Set Nearest Neighbor for Pixel Art
            $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graph.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            
            # Draw
            $graph.DrawImage($img, 0, 0, 64, 64)
            
            # Dispose original to release file lock
            $img.Dispose()
            
            # Save to temp file
            $tempPath = $fullPath + ".tmp.png"
            $newImg.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
            
            # Clean up
            $newImg.Dispose()
            $graph.Dispose()
            
            # Overwrite original
            Move-Item -Force $tempPath $fullPath
            Write-Host "Successfully resized $file to 64x64"
        }
        catch {
            Write-Error "Failed to process $file`: $_"
        }
    }
    else {
        Write-Warning "File not found: $fullPath"
    }
}
