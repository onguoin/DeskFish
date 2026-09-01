param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$version = "0.11.0"
$packageName = "DeskFish-v$version-Windows-x64"
$artifacts = Join-Path $PSScriptRoot "artifacts"
$publish = Join-Path $artifacts "publish"
$package = Join-Path $artifacts $packageName
$project = Join-Path $PSScriptRoot "windows-host\DeskFish.Host.csproj"
$extension = Join-Path $PSScriptRoot "edge-extension"

New-Item -ItemType Directory -Path $publish, $package -Force | Out-Null

dotnet publish $project `
    -c $Configuration `
    -r win-x64 `
    --self-contained true `
    -o $publish

Copy-Item -LiteralPath (Join-Path $publish "DeskFish.exe") -Destination $package -Force
$extensionOutput = Join-Path $package "edge-extension"
New-Item -ItemType Directory -Path $extensionOutput -Force | Out-Null
Get-ChildItem -LiteralPath $extension -Force | Copy-Item -Destination $extensionOutput -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "README.md") -Destination (Join-Path $package "README.md") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "README_EN.md") -Destination (Join-Path $package "README_EN.md") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "CHANGELOG.md") -Destination (Join-Path $package "CHANGELOG.md") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "THIRD_PARTY_NOTICES.md") -Destination (Join-Path $package "THIRD_PARTY_NOTICES.md") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "LICENSE") -Destination (Join-Path $package "LICENSE") -Force
$docsOutput = Join-Path $package "docs"
New-Item -ItemType Directory -Path $docsOutput -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "docs") -File -Filter "*.png" | Copy-Item -Destination $docsOutput -Force

$zip = Join-Path $artifacts "$packageName.zip"
Compress-Archive -Path (Join-Path $package "*") -DestinationPath $zip -Force
Get-FileHash -Algorithm SHA256 -LiteralPath $zip
