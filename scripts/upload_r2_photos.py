#!/usr/bin/env python3
"""Copy published website images to R2, retaining all local and GitHub copies."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
IMAGE_TYPES = {'.jpg', '.jpeg', '.webp', '.png', '.avif', '.gif'}
REPORT = ROOT / 'generated/r2-upload'


def prepare(source):
    if not (source / 'generated/content.json').is_file():
        raise ValueError('Build the website first: .venv/bin/python -B scripts/build_site.py')
    images = sorted(p for p in source.rglob('*') if p.is_file() and p.suffix.lower() in IMAGE_TYPES)
    if not images and (ROOT / 'content/photo-assets.json').exists():
        print('No new local images in the build; existing images are already registered in R2.')
        return []
    if not images:
        raise ValueError('The published build contains no images.')
    records = []
    for path in images:
        if path.is_symlink():
            raise ValueError('Symlinks are not allowed in the image upload.')
        records.append(dict(key=path.relative_to(source).as_posix(), bytes=path.stat().st_size,
                            sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    REPORT.mkdir(parents=True, exist_ok=True)
    (REPORT / 'files.txt').write_text(''.join(r['key'] + '\n' for r in records))
    (REPORT / 'manifest.json').write_text(json.dumps(dict(source=str(source), images=records), indent=2) + '\n')
    print(f"{len(records)} published images / {sum(r['bytes'] for r in records) / 1_000_000:.1f} MB")
    return records



def register_verified(source, records, remote):
    path = ROOT / 'content/photo-assets.json'
    if not path.exists():
        return
    data = json.loads(path.read_text())
    if remote.split(':', 1)[-1] != data.get('bucket'):
        raise ValueError('The upload bucket differs from the website photo manifest.')
    from sync_content import image_size
    keys = {record['key'] for record in records}
    for record in records:
        key = record['key']
        data['objects'][key] = {field: record[field] for field in ('sha256', 'bytes')}
        if key.startswith(('content/', 'assets/photos/')):
            width, height = image_size(source / key)
            data['sources'][key] = dict(data['objects'][key], width=width, height=height)
    catalog = json.loads((source / 'generated/content.json').read_text())
    for photo in catalog['photos']:
        key = unquote(urlsplit(photo.get('largeSrc') or photo['src']).path).lstrip('/')
        if key not in keys:
            continue
        entry = data['sources'][key]
        variants = [{**v, 'src': unquote(urlsplit(v['src']).path).lstrip('/')} for v in photo.get('thumbnailVariants', [])]
        if variants:
            entry.update(thumbnailVariants=variants, thumbnailSrc=variants[0]['src'],
                         displayWidth=photo.get('displayWidth', entry['width']),
                         displayHeight=photo.get('displayHeight', entry['height']))
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)
    print('Registered verified R2 objects; rebuild the site to use their remote URLs.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'copy', 'verify'])
    parser.add_argument('--remote', default='r2:personal-website-photos')
    parser.add_argument('--source', type=Path, default=ROOT / '_site')
    args = parser.parse_args()
    source = args.source.resolve()
    if not shutil.which('rclone'):
        raise ValueError('Install rclone and configure your r2 remote first.')
    records = prepare(source)
    if not records:
        return 0
    common = [str(source), args.remote, '--files-from-raw', str(REPORT / 'files.txt'),
              '--s3-no-check-bucket', '--stats', '15s', '--stats-one-line', '--stats-log-level', 'NOTICE',
              '--retries', '2', '--low-level-retries', '2']
    if args.action == 'plan':
        command = ['rclone', 'copy', *common, '--dry-run', '--log-level', 'ERROR']
    elif args.action == 'copy':
        command = ['rclone', 'copy', *common, '--transfers', '8', '--checkers', '8']
    else:
        command = ['rclone', 'check', *common, '--one-way', '--download', '--checkers', '8']
    print(f"{args.action}: {args.remote} (no deletion; credentials stay in your local rclone config)", flush=True)
    result = subprocess.run(command)
    if result.returncode == 0:
        if args.action == 'verify':
            register_verified(source, records, args.remote)
        (REPORT / (args.action + '-result.json')).write_text(json.dumps(
            dict(action=args.action, remote=args.remote, files=len(records),
                 bytes=sum(r['bytes'] for r in records), success=True), indent=2) + '\n')
    return result.returncode


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
