# ARIA startup script — sets PYTHONPATH then launches the FastAPI server.
$env:PYTHONPATH = $PSScriptRoot
Write-Host "ARIA backend starting on http://127.0.0.1:8000 ..."
python api/main.py
