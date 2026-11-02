# Legacy Go setup — source reproduction only

The currently published Istaroth v1.0 installer is the original Go GUI setup. It embeds a source snapshot and downloads the Electron runtime during installation, validating a pinned SHA-256. The source is retained for reproducibility and compatibility investigations.

**For new distributions, use the conventional offline NSIS and portable ZIP pipeline instead:** [Windows distribution guide](../docs/WINDOWS_DISTRIBUTION.md). Those packages include Electron and require no runtime download during installation.

To reproduce the older Go setup on Windows with Go installed:

```powershell
python scripts/build_embedded_app.py
cd installer
go build -ldflags="-H=windowsgui" -o Istaroth_Legacy_Setup.exe main.go wizard.go
```

The generated `installer/app.zip` is built from tracked source and is not committed. Reproducing the Go installer does **not** recreate the signed identity of any release (the original v1.0 installer is unsigned). Do not upload a newly compiled binary as the published v1.0 EXE without re-testing and publishing a matching new checksum. Do not remove or rename the legacy `Teyvat Pulse` profile: it preserves users' saved preferences and HoYoLAB browser session.
