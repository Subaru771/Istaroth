#!/usr/bin/env python3
"""Recreate the Istaroth graphical installer's app.zip directly from the tracked Electron source."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root=Path(__file__).resolve().parents[1]
app=root/'app'
target=root/'installer/app.zip'
with ZipFile(target,'w',compression=ZIP_DEFLATED,compresslevel=8) as zip_file:
    for path in sorted(app.rglob('*')):
        if path.is_file():
            zip_file.write(path,path.relative_to(app).as_posix())
print('Created',target)
