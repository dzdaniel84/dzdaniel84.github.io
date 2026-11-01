"""Resolve verified R2 photos while retaining CSV-based photo authoring."""
import copy
import hashlib
import html
import json
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit

IMAGE_TYPES = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'}


class PhotoAssets:
    def __init__(self, root):
        self.root = Path(root).resolve()
        config_path = self.root / 'site.json'
        config = json.loads(config_path.read_text()) if config_path.exists() else {}
        self.origin = config.get('image_origin', '').rstrip('/')
        if self.origin:
            parsed = urlsplit(self.origin)
            if (parsed.scheme != 'https' or not parsed.netloc or parsed.path
                    or parsed.query or parsed.fragment or parsed.username or parsed.password):
                raise ValueError('image_origin must be an HTTPS origin without a path or credentials.')
        path = self.root / 'content/photo-assets.json'
        self.data = json.loads(path.read_text()) if self.origin and path.exists() else {}
        self.objects = self.data.get('objects', {})
        self.sources = self.data.get('sources', {})
        self.site_host = urlsplit(config.get('url', '')).netloc
        self._digests = {}

    def key(self, path):
        path = Path(path).resolve()
        return path.relative_to(self.root).as_posix()

    def info(self, path):
        key = self.key(path)
        cached = self.sources.get(key)
        if path.is_file():
            with path.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            self._digests[key] = digest
            if cached and cached['sha256'] == digest:
                return cached
            from sync_content import image_size
            width, height = image_size(path)
            return dict(sha256=digest, width=width, height=height, bytes=path.stat().st_size)
        if cached:
            return cached
        raise ValueError('Missing photograph and no R2 manifest entry: ' + key)

    def available(self, path):
        return path.is_file() or self.key(path) in self.sources

    def verified(self, key):
        if key not in self.objects:
            return False
        path = self.root / key
        if path.is_file() and key not in self._digests:
            with path.open('rb') as stream:
                self._digests[key] = hashlib.file_digest(stream, 'sha256').hexdigest()
        return key not in self._digests or self._digests[key] == self.objects[key]['sha256']

    def hosted(self, path):
        return bool(self.origin) and self.verified(self.key(self.root / path))

    def url(self, value):
        if not self.origin or not isinstance(value, str):
            return value
        parsed = urlsplit(value)
        if parsed.netloc and parsed.netloc not in {self.site_host, urlsplit(self.origin).netloc}:
            return value
        if parsed.scheme and parsed.scheme not in {'https', 'http'}:
            return value
        key = unquote(parsed.path).lstrip('/')
        if not self.verified(key):
            return value
        return self.origin + '/' + quote(key, safe='/') + (
            '?' + parsed.query if parsed.query else '') + ('#' + parsed.fragment if parsed.fragment else '')

    def rewrite(self, value):
        if isinstance(value, dict):
            return {key: self.rewrite(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self.rewrite(item) for item in value]
        return self.url(value)

    def rewrite_html(self, text):
        def attribute(match):
            name, opening, quote_char, value = match.groups()
            raw = html.unescape(value)
            if name.lower() == 'srcset':
                values = []
                for part in raw.split(','):
                    pieces = part.split()
                    if pieces:
                        pieces[0] = self.url(pieces[0])
                        values.append(' '.join(pieces))
                rewritten = ', '.join(values)
            else:
                rewritten = self.url(raw)
            return name + opening + quote_char + html.escape(rewritten, quote=True) + quote_char
        return re.sub(r'\b(srcset|src|href|poster|content)(\s*=\s*)(["\'])(.*?)\3',
                      attribute, text, flags=re.I)

    def cached_thumbnails(self, photos, sources):
        pending_photos, pending_sources = {}, {}
        for identity, photo in photos.items():
            source = sources[identity]
            cached = self.sources.get(self.key(source['path']), {})
            variants = cached.get('thumbnailVariants', [])
            if (cached.get('sha256') == source['digest'] and variants
                    and all(unquote(v['src']) in self.objects for v in variants)):
                photo.update(thumbnailSrc=variants[0]['src'], thumbnailVariants=copy.deepcopy(variants),
                             displayWidth=cached.get('displayWidth', cached['width']),
                             displayHeight=cached.get('displayHeight', cached['height']))
            else:
                pending_photos[identity] = photo
                pending_sources[identity] = source
        return pending_photos, pending_sources
