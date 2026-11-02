//go:build windows

// Istaroth per-user graphical installer. This is a complete app installer,
// not a patch. Source is embedded; Electron is fetched only if not installed.
package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

//go:embed app.zip
var appArchive []byte

const appName = "Istaroth"
const version = "2.4.18"
const runtimeURL = "https://github.com/electron/electron/releases/download/v45.1.0/electron-v45.1.0-win32-x64.zip"
const runtimeSHA = "55eaba17abff7b5bba6c3bbc85068967379024fe742fe9c7fdba9118922ccbe2"
const runKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
const approveKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
const uninstallKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Istaroth`
const legacyUninstallKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\TeyvatPulse`
const legacyEntry = "Teyvat Pulse"
const mbYesNoCancel = 0x00000003
const mbYesNo = 0x00000004
const yes = 6
const no = 7
const cancel = 2

func message(title, body string, kind uintptr) int {
	user32 := syscall.NewLazyDLL("user32.dll")
	method := user32.NewProc("MessageBoxW")
	caption, _ := syscall.UTF16PtrFromString(title)
	txt, _ := syscall.UTF16PtrFromString(body)
	r, _, _ := method.Call(0, uintptr(unsafe.Pointer(txt)), uintptr(unsafe.Pointer(caption)), kind)
	return int(r)
}
func errBox(err error) { message(appName+" · Installation", err.Error(), 0x10) }
func reg(args ...string) (string, error) {
	c := exec.Command("reg.exe", args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	b, e := c.CombinedOutput()
	return string(b), e
}
func regSet(key, name, typ, value string) error {
	if out, err := reg("ADD", key, "/v", name, "/t", typ, "/d", value, "/f"); err != nil {
		return fmt.Errorf("cannot update Windows settings: %s (%w)", strings.TrimSpace(out), err)
	}
	return nil
}
func regDelete(key, name string) { _, _ = reg("DELETE", key, "/v", name, "/f") }
func file(p string) bool         { s, e := os.Stat(p); return e == nil && !s.IsDir() }
func folder(p string) bool       { s, e := os.Stat(p); return e == nil && s.IsDir() }
func existingInstall() string {
	local := os.Getenv("LOCALAPPDATA")
	paths := []string{filepath.Join(local, "Istaroth"), filepath.Join(local, "Programs", "Istaroth"),
        filepath.Join(local, "Teyvat Pulse"), filepath.Join(local, "TeyvatPulse"),
        filepath.Join(local, "Programs", "Teyvat Pulse"),filepath.Join(local, "Programs", "TeyvatPulse")}
	for _, p := range paths {
		if (file(filepath.Join(p, "Istaroth.exe")) || file(filepath.Join(p, "electron.exe"))) && folder(filepath.Join(p, "resources", "app")) {
			return p
		}
	}
	// Also detect a nondefault installation registered by an older installer.
	keys := []string{uninstallKey, legacyUninstallKey, `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Teyvat Pulse`}
	for _, key := range keys {
		output, err := reg("QUERY", key, "/v", "InstallLocation")
		if err != nil {
			continue
		}
		for _, line := range strings.Split(output, "\n") {
			if !strings.Contains(line, "InstallLocation") || !strings.Contains(line, "REG_SZ") {
				continue
			}
			parts := strings.SplitN(line, "REG_SZ", 2)
			if len(parts) != 2 {
				continue
			}
			p := strings.TrimSpace(parts[1])
			if (file(filepath.Join(p, "Istaroth.exe")) || file(filepath.Join(p, "electron.exe"))) && folder(filepath.Join(p, "resources", "app")) {
				return p
			}
		}
	}
	if local == "" {
		return ""
	}
	return filepath.Join(local, "Istaroth")
}
// Persist legacy profile identity so user cookies, history and wallpapers remain available.
func userData() string { return filepath.Join(os.Getenv("APPDATA"), "Teyvat Pulse") }
func safeEntry(base, name string) (string, error) {
	clean := filepath.Clean(name)
	if name == "" || filepath.IsAbs(clean) || clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) || strings.Contains(clean, ":") {
		return "", fmt.Errorf("unsafe archive path: %s", name)
	}
	p := filepath.Join(base, clean)
	if rel, err := filepath.Rel(base, p); err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("archive path escapes destination: %s", name)
	}
	return p, nil
}
func unzip(r *zip.Reader, dest string, maxTotal uint64) error {
	var total uint64
	for _, entry := range r.File {
		total += entry.UncompressedSize64
		if total > maxTotal {
			return errors.New("archive exceeds safe extraction limit")
		}
		p, err := safeEntry(dest, entry.Name)
		if err != nil {
			return err
		}
		if entry.FileInfo().IsDir() {
			if err = os.MkdirAll(p, 0755); err != nil {
				return err
			}
			continue
		}
		if entry.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("archive symlink not allowed: %s", entry.Name)
		}
		if err = os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			return err
		}
		in, err := entry.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(p, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
		if err != nil {
			in.Close()
			return err
		}
		_, copyErr := io.CopyN(out, in, int64(entry.UncompressedSize64))
		closeErr := out.Close()
		in.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}
func setupApp(dest string) error {
	r, err := zip.NewReader(bytes.NewReader(appArchive), int64(len(appArchive)))
	if err != nil {
		return err
	}
	res := filepath.Join(dest, "resources")
	if err = os.MkdirAll(res, 0755); err != nil {
		return err
	}
	stage := filepath.Join(res, "app-staging")
	old := filepath.Join(res, "app")
	backup := filepath.Join(res, "app-backup")
	_ = os.RemoveAll(stage)
	if err = unzip(r, stage, 40<<20); err != nil {
		os.RemoveAll(stage)
		return err
	}
	if !file(filepath.Join(stage, "main.js")) || !file(filepath.Join(stage, "package.json")) || !file(filepath.Join(stage, "windows-startup.js")) {
		os.RemoveAll(stage)
		return errors.New("application archive incomplete")
	}
	_ = os.RemoveAll(backup)
	hadOld := folder(old)
	if hadOld {
		if err = os.Rename(old, backup); err != nil {
			os.RemoveAll(stage)
			return fmt.Errorf("close Istaroth completely, including its tray icon, and retry: %w", err)
		}
	}
	if err = os.Rename(stage, old); err != nil {
		if hadOld {
			_ = os.Rename(backup, old)
		}
		return fmt.Errorf("could not activate the new app: %w", err)
	}
	// The app's user data lives in %%APPDATA%%, never under resources/app.
	_ = os.RemoveAll(backup)
	return nil
}
func ensureRuntime(dest string) error { return ensureRuntimeWithProgress(dest, nil) }
func ensureRuntimeWithProgress(dest string, progress func(int64, int64)) error {
	exe := filepath.Join(dest, "electron.exe")
	if (file(exe) || file(filepath.Join(dest, "Istaroth.exe"))) && file(filepath.Join(dest, "icudtl.dat")) && file(filepath.Join(dest, "chrome_100_percent.pak")) {
		return nil
	}
	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}
	tmp := filepath.Join(os.TempDir(), "teyvat-electron-45.1.0.zip")
	defer os.Remove(tmp)
	client := &http.Client{Timeout: 12 * time.Minute}
	response, err := client.Get(runtimeURL)
	if err != nil {
		return fmt.Errorf("could not download the official Electron runtime: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return fmt.Errorf("Electron download returned HTTP %d", response.StatusCode)
	}
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	hasher := sha256.New()
	var n int64
	var copyErr error
	buf := make([]byte, 256*1024)
	maxSize := int64(220 << 20)
	lastReported := int64(-1)
	for n < maxSize {
		limit := int64(len(buf))
		if n+limit > maxSize {
			limit = maxSize - n
		}
		count, readErr := response.Body.Read(buf[:limit])
		if count > 0 {
			if _, e := out.Write(buf[:count]); e != nil {
				copyErr = e
				break
			}
			if _, e := hasher.Write(buf[:count]); e != nil {
				copyErr = e
				break
			}
			n += int64(count)
			// At most one UI update per 3 MB of data, plus a final update.
			if progress != nil && (lastReported < 0 || n-lastReported >= 3<<20 || readErr == io.EOF) {
				progress(n, response.ContentLength)
				lastReported = n
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			copyErr = readErr
			break
		}
	}
	if copyErr == nil && n >= maxSize {
		copyErr = errors.New("runtime download exceeded safety limit")
	}
	if progress != nil && copyErr == nil {
		progress(n, response.ContentLength)
	}
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if n > 210<<20 {
		return errors.New("Electron download exceeded expected size")
	}
	actual := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(actual, runtimeSHA) {
		return fmt.Errorf("Electron runtime SHA-256 did not match (%s)", actual)
	}
	archive, err := zip.OpenReader(tmp)
	if err != nil {
		return err
	}
	defer archive.Close()
	// Electron 45.1.0 win32-x64 release is 158 MB zipped, ~375 MB unpacked.
	if err = unzip(&archive.Reader, dest, 550<<20); err != nil {
		return err
	}
	if !file(exe) {
		return errors.New("Electron runtime installed without electron.exe")
	}
	return nil
}
// Replace the generic runtime filename with the branded application executable.
// Reuses an installed Electron runtime, never re-downloads just to rebrand.
func brandRuntime(dest string) error {
    original := filepath.Join(dest, "electron.exe")
    branded := filepath.Join(dest, "Istaroth.exe")
    if file(branded) { _ = os.Remove(original); return nil }
    if !file(original) { return errors.New("application runtime missing") }
    return os.Rename(original, branded)
}
func setStartup(enable bool, installDir string) error {
	exe := filepath.Join(installDir, "Istaroth.exe")
	if enable {
		if !file(exe) {
			return errors.New("cannot register startup: missing app executable")
		}
		if err := regSet(runKey, appName, "REG_SZ", `"`+exe+`"`); err != nil {
			return err
		}
		// The installer asks explicit consent before resetting a previously disabled entry.
		regDelete(approveKey, appName)
	} else {
		regDelete(runKey, appName)
	}
	pref := filepath.Join(userData(), "startup-preference.json")
	if err := os.MkdirAll(filepath.Dir(pref), 0755); err != nil {
		return err
	}
	b, _ := json.Marshal(map[string]bool{"enabled": enable})
	return os.WriteFile(pref, b, 0600)
}
func quoteVbs(s string) string { return strings.ReplaceAll(s, `"`, `""`) }
func shortcut(target, link, workingDir, desc string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0755); err != nil {
		return err
	}
	script := `Set ws = CreateObject("WScript.Shell")` + "\r\n" +
		`Set sc = ws.CreateShortcut("` + quoteVbs(link) + `")` + "\r\n" +
		`sc.TargetPath = "` + quoteVbs(target) + `"` + "\r\n" +
		`sc.WorkingDirectory = "` + quoteVbs(workingDir) + `"` + "\r\n" +
		`sc.Description = "` + quoteVbs(desc) + `"` + "\r\n" +
		`sc.IconLocation = "` + quoteVbs(filepath.Join(workingDir, "resources", "app", "assets", "icon.ico")) + `"` + "\r\n" + `sc.Save` + "\r\n"
	f, err := os.CreateTemp("", "teyvat-shortcut-*.vbs")
	if err != nil {
		return err
	}
	scriptPath := f.Name()
	defer os.Remove(scriptPath)
	_, err = f.WriteString(script)
	f.Close()
	if err != nil {
		return err
	}
	cmd := exec.Command("wscript.exe", "//B", "//Nologo", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Windows could not create shortcut: %s %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}
func installShortcuts(dest string, desktopShortcut bool) error {
	exe := filepath.Join(dest, "Istaroth.exe")
	start := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Istaroth", "Istaroth.lnk")
	desktop := filepath.Join(os.Getenv("USERPROFILE"), "Desktop", "Istaroth.lnk")
	if err := shortcut(exe, start, dest, "Genshin resin companion widget (not the game)"); err != nil {
		return err
	}
	if desktopShortcut {
		_ = shortcut(exe, desktop, dest, "Genshin resin companion widget (not the game)")
	} else {
		_ = os.Remove(desktop)
	}
	return nil
}
func installUninstaller(dest string) error {
	own, err := os.Executable()
	if err != nil {
		return err
	}
	src, err := os.Open(own)
	if err != nil {
		return err
	}
	defer src.Close()
	uninst := filepath.Join(dest, "Uninstall Istaroth.exe")
	out, err := os.Create(uninst)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, src)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return nil
}
func uninstallRegistry(dest string) error {
	values := [][3]string{
		{"DisplayName", "REG_SZ", appName}, {"DisplayVersion", "REG_SZ", version},
		{"Publisher", "REG_SZ", "Istaroth Community"},
		{"InstallLocation", "REG_SZ", dest},
		{"UninstallString", "REG_SZ", `"` + filepath.Join(dest, "Uninstall Istaroth.exe") + `" /uninstall`},
		{"NoModify", "REG_DWORD", "1"}, {"NoRepair", "REG_DWORD", "1"},
	}
	for _, v := range values {
		if err := regSet(uninstallKey, v[0], v[1], v[2]); err != nil {
			return err
		}
	}
	return nil
}
func removeLegacyBranding() {
    regDelete(runKey, legacyEntry)
    regDelete(approveKey, legacyEntry)
    _, _ = reg("DELETE", legacyUninstallKey, "/f")
    oldMenu := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Teyvat Pulse")
    _ = os.Remove(filepath.Join(oldMenu, "Teyvat Pulse.lnk"))
    _ = os.Remove(filepath.Join(os.Getenv("USERPROFILE"), "Desktop", "Teyvat Pulse.lnk"))
}
func removeApp(dest string) {
	_ = os.RemoveAll(filepath.Join(dest, "resources", "app"))
	_ = os.Remove(filepath.Join(dest, "Istaroth.exe"))
    _ = os.Remove(filepath.Join(dest, "electron.exe"))
	_ = os.Remove(filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Istaroth", "Istaroth.lnk"))
	_ = os.Remove(filepath.Join(os.Getenv("USERPROFILE"), "Desktop", "Istaroth.lnk"))
	_, _ = reg("DELETE", uninstallKey, "/f")
	regDelete(runKey, appName)
	message(appName+" · Uninstall", "Application files and Windows startup entry removed. Your HoYoLAB settings and resin history were left untouched. You may delete the remaining app folder after a restart.", 0x40)
}
