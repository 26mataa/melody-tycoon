# Petit serveur HTTP local, sans dependance externe (pas besoin de Python/Node).
# Usage : depuis ce dossier, lancer  ->  ./serve.ps1
# Puis ouvrir http://localhost:8080/ dans le navigateur.
# Necessaire car fetch() sur des fichiers JSON est bloque par les navigateurs
# quand la page est ouverte directement en double-cliquant (file://).

param(
    [int]$Port = 8080
)

$root = $PSScriptRoot
$prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
}
catch {
    Write-Host "Impossible de demarrer le serveur sur le port $Port (deja utilise ?)." -ForegroundColor Red
    Write-Host "Essaie : ./serve.ps1 -Port 8081" -ForegroundColor Yellow
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".mjs"  = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

Write-Host "Melody Tycoon sert sur $prefix (Ctrl+C pour arreter)" -ForegroundColor Green

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relativePath = [Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart("/"))
        if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }

        $filePath = Join-Path $root $relativePath
        $fullRoot = (Resolve-Path $root).Path
        $resolvedFile = $null
        if (Test-Path $filePath -PathType Leaf) {
            $resolvedFile = (Resolve-Path $filePath).Path
        }

        # Empeche de sortir du dossier du jeu (securite basique).
        if ($resolvedFile -and $resolvedFile.StartsWith($fullRoot)) {
            $ext = [System.IO.Path]::GetExtension($resolvedFile).ToLower()
            $contentType = $mimeTypes[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        else {
            $response.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 - Fichier introuvable : $relativePath")
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }

        $response.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
