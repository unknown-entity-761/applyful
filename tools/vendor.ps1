# Copies the two readers the app uses from node_modules into app/vendor, so the app
# serves them itself:
#   app/vendor/pdfjs      pdf.js, reads PDF CVs (CV check and profile fill-in)
#   app/vendor/tesseract  Tesseract OCR, reads scanned CVs; only downloaded when needed
#
# To update:  npm.cmd install <package>@<version> --save-dev --save-exact
#             npm.cmd run vendor
# then npm.cmd test. The offline file list in app/sw.js updates itself on publish.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$modules = Join-Path $root 'node_modules'
if (-not (Test-Path $modules)) { throw 'Packages are not installed. Run: npm.cmd install' }

function Copy-Files($fromDir, $names, $toDir) {
  New-Item -ItemType Directory -Force $toDir | Out-Null
  foreach ($name in $names) { Copy-Item (Join-Path $fromDir $name) $toDir -Force }
}

function Get-Version($package) {
  (Get-Content (Join-Path $modules "$package/package.json") -Raw | ConvertFrom-Json).version
}

# pdf.js: the "legacy" build works on older phones too.
$pdf = Join-Path $root 'app/vendor/pdfjs'
Copy-Files (Join-Path $modules 'pdfjs-dist/legacy/build') @('pdf.min.mjs', 'pdf.worker.min.mjs') $pdf
Copy-Item (Join-Path $modules 'pdfjs-dist/LICENSE') $pdf -Force
Set-Content -Path (Join-Path $pdf 'VERSION') -Value "pdfjs-dist $(Get-Version 'pdfjs-dist') (Apache-2.0, see LICENSE)" -Encoding ascii

# Tesseract: the library, its worker, the three engine builds (the worker picks the
# fastest one the phone supports), and the compact English model.
$ocr = Join-Path $root 'app/vendor/tesseract'
Copy-Files (Join-Path $modules 'tesseract.js/dist') @('tesseract.esm.min.js', 'worker.min.js') $ocr
Copy-Files (Join-Path $modules 'tesseract.js-core') @('tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js') $ocr
Copy-Item (Join-Path $modules '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz') $ocr -Force
Copy-Item (Join-Path $modules 'tesseract.js/LICENSE.md') (Join-Path $ocr 'LICENSE.md') -Force
Set-Content -Path (Join-Path $ocr 'VERSION') -Value "tesseract.js $(Get-Version 'tesseract.js'), tesseract.js-core $(Get-Version 'tesseract.js-core'), eng 4.0.0_best_int (Apache-2.0, see LICENSE.md)" -Encoding ascii

Write-Output "Copied pdf.js $(Get-Version 'pdfjs-dist') and tesseract.js $(Get-Version 'tesseract.js') into app/vendor"
