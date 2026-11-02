from pathlib import Path
import zipfile, sys
root = Path(__file__).resolve().parents[1]
app = root / 'app'
archive = root / 'installer/app.zip'
with zipfile.ZipFile(archive) as z:
    actual = {f.relative_to(app).as_posix():f.read_bytes() for f in app.rglob('*') if f.is_file()}
    names = set(z.namelist())
    if names != set(actual):
        print('Embedded file-list mismatch. Missing:', sorted(set(actual)-names), 'Extra:', sorted(names-set(actual)))
        sys.exit(1)
    bad = [name for name,b in actual.items() if z.read(name)!=b]
    if bad:
        print('Embedded content mismatch:', bad)
        sys.exit(1)
    if z.testzip() is not None: sys.exit('Invalid ZIP CRC')
print(f'OK: {len(actual)} embedded files match app source')
