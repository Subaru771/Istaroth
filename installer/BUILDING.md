# Build the GUI setup from source

The Go installer uses only Go's standard library and embeds `app.zip`. On Windows, with Go installed, run:

```powershell
python scripts/build_embedded_app.py
cd installer
go build -ldflags="-H=windowsgui" -o Istaroth_Setup.exe main.go wizard.go
```

This creates a Windows GUI application; the installer presents a Setup wizard without a console window. To update the embedded app in a new version, recreate `app.zip` from the app source while preserving the paths, and update the displayed version, packaged hash, and release notes. The first installation downloads the Electron runtime from the official GitHub release and validates it against the pinned SHA-256 in `main.go`.

The app.zip archive is generated from tracked app sources and is not committed to GitHub.
