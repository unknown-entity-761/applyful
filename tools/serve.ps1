# A tiny local web server for trying the app on this computer. Nothing to install.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1
# Then open http://localhost:5173/ in a browser. Stop it with Ctrl+C or by closing the window.
param(
    [int]$Port = 5173,
    [string]$Root = (Join-Path $PSScriptRoot '..\app')
)

$Root = (Resolve-Path $Root).Path.TrimEnd('\')
$RootPrefix = $Root + '\'

$types = @{
    '.html'        = 'text/html; charset=utf-8'
    '.js'          = 'text/javascript; charset=utf-8'
    '.mjs'         = 'text/javascript; charset=utf-8'
    '.css'         = 'text/css; charset=utf-8'
    '.json'        = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg'         = 'image/svg+xml'
    '.png'         = 'image/png'
    '.ico'         = 'image/x-icon'
    '.txt'         = 'text/plain; charset=utf-8'
    '.pdf'         = 'application/pdf'
    '.docx'        = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Job Tracker is running at http://localhost:$Port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        try {
            $path = [Uri]::UnescapeDataString($request.Url.AbsolutePath)
            if ($path.EndsWith('/')) { $path += 'index.html' }
            $full = [IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart('/')))

            # Only serve files inside the app folder.
            if (-not $full.StartsWith($RootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
                $response.StatusCode = 404
                $response.ContentType = 'text/plain; charset=utf-8'
                $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
            } else {
                $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
                $response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
                $response.Headers['Cache-Control'] = 'no-cache'
                $bytes = [IO.File]::ReadAllBytes($full)
            }
            $response.ContentLength64 = $bytes.Length
            if ($request.HttpMethod -ne 'HEAD') { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
            Write-Host "$($response.StatusCode) $($request.HttpMethod) $path"
        } catch {
            $response.StatusCode = 500
            Write-Host "500 $($request.HttpMethod) $($request.Url.AbsolutePath): $_"
        } finally {
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
}
