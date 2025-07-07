# PowerShell script to download chess sound effects

# Create the sounds directory if it doesn't exist
$soundsDir = ".\public\sounds"
if (-not (Test-Path $soundsDir)) {
    New-Item -ItemType Directory -Path $soundsDir -Force
    Write-Host "Created directory: $soundsDir"
}

# Define sound URLs - using direct links to lichess.org sound files
$sounds = @{
    "move.ogg" = "https://lichess1.org/assets/sound/standard/Move.ogg"
    "capture.ogg" = "https://lichess1.org/assets/sound/standard/Capture.ogg"
    "check.ogg" = "https://lichess1.org/assets/sound/standard/Check.ogg"
    "low_time.ogg" = "https://lichess1.org/assets/sound/standard/LowTime.ogg"
    "timeout.ogg" = "https://lichess1.org/assets/sound/standard/Defeat.ogg"
}

# Download each sound
foreach ($sound in $sounds.GetEnumerator()) {
    $outputFile = Join-Path $soundsDir $sound.Key
    Write-Host "Downloading $($sound.Key) from $($sound.Value)..."

    try {
        Invoke-WebRequest -Uri $sound.Value -OutFile $outputFile
        Write-Host "Downloaded $($sound.Key) successfully."
    } catch {
        Write-Host "Failed to download $($sound.Key): $_"
    }
}

Write-Host "Download complete. Sound files are in $soundsDir"
