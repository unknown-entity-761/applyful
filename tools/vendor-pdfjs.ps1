# Copies pdf.js (the PDF reader the CV check uses) from node_modules into app/vendor/pdfjs,
# so the app serves it itself and the CV check works offline.
#
# To update pdf.js:  npm.cmd install pdfjs-dist@<version> --save-dev --save-exact
#                    npm.cmd run vendor
# then bump CACHE in app/sw.js.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'node_modules/pdfjs-dist'
$target = Join-Path $root 'app/vendor/pdfjs'

if (-not (Test-Path $source)) {
  throw 'pdfjs-dist is not installed. Run: npm.cmd install'
}

New-Item -ItemType Directory -Force $target | Out-Null

# The "legacy" build works on older phones (iOS 15 and up), not just the newest browsers.
Copy-Item (Join-Path $source 'legacy/build/pdf.min.mjs') $target -Force
Copy-Item (Join-Path $source 'legacy/build/pdf.worker.min.mjs') $target -Force
Copy-Item (Join-Path $source 'LICENSE') $target -Force

$version = (Get-Content (Join-Path $source 'package.json') -Raw | ConvertFrom-Json).version
Set-Content -Path (Join-Path $target 'VERSION') -Value "pdfjs-dist $version (Apache-2.0, see LICENSE)" -Encoding utf8

Write-Output "Copied pdf.js $version to app/vendor/pdfjs"
