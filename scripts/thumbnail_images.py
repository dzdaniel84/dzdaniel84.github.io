#!/usr/bin/env python3
"""Cache responsive WebP derivatives while leaving source photographs untouched."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

PROJECT = Path(__file__).resolve().parents[1]
RECIPE = dict(version=1, edges=[240, 960], quality=80, method=4, format='WEBP')
RECIPE_KEY = hashlib.sha256(json.dumps(RECIPE, sort_keys=True).encode()).hexdigest()[:8]
OWNED_FILE = re.compile(r'[a-f0-9]{32}-[a-f0-9]{8}(?:-\d+)?\.(?:json|webp)')


class ThumbnailError(ValueError):
    pass


def atomic_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
        stream.write(data)
        temporary = Path(stream.name)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def encode(job):
    # Pillow is imported only by the isolated worker, not by the CSV compiler.
    from PIL import Image, ImageCms, ImageOps
    output = Path(job['output'])
    with Image.open(job['source']) as source:
        source.seek(0)
        image = ImageOps.exif_transpose(source)
        transparent = 'A' in image.getbands() or 'transparency' in image.info
        original_profile = source.info.get('icc_profile')
        output_profile = None
        if original_profile:
            try:
                alpha = image.convert('RGBA').getchannel('A') if transparent else None
                color_input = image if image.mode in {'RGB', 'CMYK', 'LAB', 'L'} else image.convert('RGB')
                converted = ImageCms.profileToProfile(color_input,
                    ImageCms.ImageCmsProfile(io.BytesIO(original_profile)),
                    ImageCms.createProfile('sRGB'), outputMode='RGB')
                if alpha is not None:
                    converted.putalpha(alpha)
                image = converted
            except (ImageCms.PyCMSError, OSError, ValueError):
                # Preserve an unusual profile if its color space cannot be converted.
                output_profile = original_profile if image.mode in {'RGB', 'RGBA'} else None
        image = image.convert('RGBA' if transparent else 'RGB')
        variants, dimensions = [], set()
        for edge in RECIPE['edges']:
            resized = image.copy()
            resized.thumbnail((edge, edge), Image.Resampling.LANCZOS, reducing_gap=3.0)
            if resized.size in dimensions:
                continue
            dimensions.add(resized.size)
            # Strip EXIF/XMP, including the orientation already applied to the pixels.
            resized.info.clear()
            buffer = io.BytesIO()
            options = dict(format='WEBP', quality=RECIPE['quality'], method=RECIPE['method'])
            if output_profile:
                options['icc_profile'] = output_profile
            resized.save(buffer, **options)
            filename = job['key'] + '-' + str(edge) + '.webp'
            data = buffer.getvalue()
            atomic_bytes(output / filename, data)
            variants.append(dict(file=filename, width=resized.width, height=resized.height, bytes=len(data)))
        manifest = dict(recipe=RECIPE, digest=job['digest'],
                        sourceWidth=image.width, sourceHeight=image.height, variants=variants)
        atomic_bytes(output / (job['key'] + '.json'), (json.dumps(manifest, sort_keys=True) + '\n').encode())
        return manifest


def image_python():
    if importlib.util.find_spec('PIL') is not None:
        return sys.executable
    executable = PROJECT / '.venv' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if executable.exists() and subprocess.run([str(executable), '-c', 'import PIL'],
                                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        return str(executable)
    # A fresh checkout gets its build-only dependency on the first image import.
    result = subprocess.run([sys.executable, str(PROJECT / 'scripts/setup_images.py')])
    if result.returncode:
        raise ThumbnailError('Image setup failed. Run python3 scripts/setup_images.py and retry the sync.')
    return str(executable)


def attach_thumbnails(root, photos, sources):
    output = root / 'generated/thumbnails'
    output.mkdir(parents=True, exist_ok=True)
    jobs, manifests, identities = {}, {}, {}
    for identity, photo in photos.items():
        # Carousel-only images never need a grid derivative.
        if not (photo['atlas'] or photo['collections'] or photo['albums'] or photo.get('coverOnly')):
            continue
        source = sources[identity]
        key = source['digest'][:32] + '-' + RECIPE_KEY
        identities[identity] = key
        shard = output / key[:2]
        manifest_path = shard / (key + '.json')
        manifest = None
        try:
            manifest = json.loads(manifest_path.read_text())
            if (manifest['recipe'] != RECIPE or manifest['digest'] != source['digest']
                    or not manifest['variants'] or any(
                        not OWNED_FILE.fullmatch(variant['file'])
                        or not (shard / variant['file']).is_file()
                        or (shard / variant['file']).stat().st_size != variant['bytes']
                        for variant in manifest['variants'])):
                manifest = None
        except (OSError, ValueError, KeyError, TypeError):
            manifest = None
        if manifest is not None:
            manifests[key] = manifest
        else:
            jobs[key] = dict(key=key, source=str(source['path']), digest=source['digest'], output=str(shard))
    if jobs:
        print(f'Generating optimized thumbnails for {len(jobs)} new or changed images...', flush=True)
        result = subprocess.run([image_python(), str(Path(__file__).resolve()), '--encode'],
                                input=json.dumps(list(jobs.values())), text=True, stdout=subprocess.PIPE)
        if result.returncode:
            raise ThumbnailError('Thumbnail generation failed; the last valid photo catalog is unchanged.')
        try:
            manifests.update(json.loads(result.stdout))
        except (ValueError, TypeError) as error:
            raise ThumbnailError('The thumbnail worker returned an invalid result.') from error
    retained = set()
    for identity, key in identities.items():
        manifest = manifests[key]
        variants = sorted([dict(src='generated/thumbnails/' + key[:2] + '/' + item['file'],
                                 width=item['width'], height=item['height'])
                           for item in manifest['variants']], key=lambda item: item['width'])
        photos[identity].update(thumbnailSrc=variants[0]['src'], thumbnailVariants=variants,
                               displayWidth=manifest['sourceWidth'], displayHeight=manifest['sourceHeight'])
        retained.add(key[:2] + '/' + key + '.json')
        retained.update(key[:2] + '/' + item['file'] for item in manifest['variants'])
    return retained


def prune_thumbnails(root, retained):
    # Called only after successfully publishing the new catalog.
    output = root / 'generated/thumbnails'
    for path in output.rglob('*'):
        if path.is_file() and OWNED_FILE.fullmatch(path.name) and path.relative_to(output).as_posix() not in retained:
            path.unlink()


def main():
    if sys.argv[1:] != ['--encode']:
        raise SystemExit('This worker is called automatically by scripts/sync_content.py.')
    jobs = json.load(sys.stdin)
    results = {}
    try:
        with ThreadPoolExecutor(max_workers=min(4, os.cpu_count() or 1)) as pool:
            futures = {pool.submit(encode, job): job for job in jobs}
            for index, future in enumerate(as_completed(futures), 1):
                job = futures[future]
                results[job['key']] = future.result()
                if len(jobs) > 100 and index % 200 == 0:
                    print(f'Thumbnails: {index}/{len(jobs)} images processed.', file=sys.stderr, flush=True)
    except Exception as error:
        print(f'Unable to create thumbnails: {error}', file=sys.stderr)
        return 1
    json.dump(results, sys.stdout)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
