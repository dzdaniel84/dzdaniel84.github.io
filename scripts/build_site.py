#!/usr/bin/env python3
"""Compile and validate a Pages artifact containing only public website files."""
import argparse
import html
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
from urllib.parse import quote, unquote, urljoin, urlsplit
from xml.etree import ElementTree as ET

from sync_content import ROOT, sync
from routes import clean_catalog, clean_html, output_path, public_route, redirect_html

PAGES = ('index.html', 'about.html', 'photography.html', 'world-albums.html', 'work.html', '404.html')
RUNTIME = ('theme.js', 'theme.css', 'app.js', 'atlas-overview.js', 'navigation.js', 'about.js', 'fonts.css', 'style.css', 'editorial.css', 'atlas.css')
ASSET_TYPES = {'.js', '.css', '.json', '.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp', '.avif',
               '.gif', '.ttf', '.woff', '.woff2', '.otf', '.txt', '.license', '.pdf'}
IMAGE_TYPES = {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'}
MAX_SITE_BYTES = 1_000_000_000


class BuildError(ValueError):
    pass


class PageInfo(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.ids, self.images = [], set(), []
        self.title, self.description, self.in_title = '', '', False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.add(a['id'])
        self.refs.extend(a[k] for k in ('href', 'src', 'poster') if a.get(k))
        if a.get('srcset'):
            self.refs.extend(part.strip().split()[0] for part in a['srcset'].split(',') if part.strip())
        if tag == 'title':
            self.in_title = True
        if tag == 'meta' and a.get('name') == 'description':
            self.description = a.get('content', '')
        if tag == 'img' and a.get('src'):
            self.images.append(a)

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


def page_info(text):
    info = PageInfo()
    info.feed(text)
    return info


def site_url(value):
    u = urlsplit(value)
    if u.scheme != 'https' or not u.netloc or u.path not in ('', '/') or u.query or u.fragment or u.username:
        raise BuildError('Site URL must be an HTTPS origin, e.g. https://dzdaniel84.github.io (no path).')
    return value.rstrip('/') + '/'


def local_path(ref, current=PurePosixPath('index.html')):
    u = urlsplit(ref)
    if u.scheme or u.netloc:
        return None
    raw = unquote(u.path)
    if '\\' in raw or '\x00' in raw:
        raise BuildError(f'Invalid local reference: {ref!r}')
    path = PurePosixPath(raw.lstrip('/')) if raw.startswith('/') else current.parent / raw if raw else current
    if '..' in path.parts:
        raise BuildError(f'Parent-directory reference is not allowed: {ref!r}')
    return path


def copy_public(root, stage, relative):
    relative = PurePosixPath(relative)
    if relative.is_absolute() or '..' in relative.parts:
        raise BuildError(f'Invalid public path: {relative}')
    source = root / relative
    if not source.is_file():
        raise BuildError(f'Missing public file: {relative}')
    if source.is_symlink() or not source.resolve().is_relative_to(root.resolve()):
        raise BuildError(f'Public files must be real files inside the project: {relative}')
    destination = stage / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    destination.chmod(0o644)


def catalog_images(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from catalog_images(item)
    elif isinstance(value, list):
        for item in value:
            yield from catalog_images(item)
    elif isinstance(value, str):
        u = urlsplit(value)
        if not u.scheme and PurePosixPath(u.path).suffix.lower() in IMAGE_TYPES:
            path = local_path(value)
            if path.parts and path.parts[0] in {'content', 'generated', 'assets'}:
                yield path


def add_metadata(text, filename, config, base, fallback, description_override=None):
    info = page_info(text)
    canonical = urljoin(base, public_route('about.html' if filename == 'work.html' else filename))
    image = next((p for p in info.images if p.get('id') in {'hero-photo', 'collection-cover-photo'}), fallback)
    image_url = urljoin(base, image['src'])
    title = info.title.strip() or config['name']
    description = description_override or info.description or config['description']
    if len(description) > 170:
        description = description[:167].rsplit(' ', 1)[0] + '…'
    values = [
        ('property', 'og:type', 'website'), ('property', 'og:site_name', config['name']),
        ('property', 'og:title', title), ('property', 'og:description', description),
        ('property', 'og:url', canonical), ('property', 'og:image', image_url),
        ('property', 'og:image:alt', image.get('alt', config['name'] + ' photography')),
        ('name', 'twitter:card', 'summary_large_image'), ('name', 'twitter:title', title),
        ('name', 'twitter:description', description), ('name', 'twitter:image', image_url),
        ('name', 'twitter:image:alt', image.get('alt', config['name'] + ' photography')),
        ('name', 'description', description),
        ('name', 'robots', 'noindex,follow' if filename in {'work.html', '404.html'} else 'index,follow'),
    ]
    text = re.sub(r'<link\b(?=[^>]*\brel=["\']canonical["\'])[^>]*>', '', text, flags=re.I)
    text = re.sub(r'<meta\b(?=[^>]*(?:property=["\']og:|name=["\'](?:twitter:|(?:robots|description)["\'])))[^>]*>', '', text, flags=re.I)
    tags = ['<link rel="canonical" href="' + html.escape(canonical, quote=True) + '">']
    tags.extend(f'<meta {kind}="{key}" content="{html.escape(value, quote=True)}">' for kind, key, value in values)
    return text.replace('</head>', '\n'.join(tags) + '\n</head>', 1)


def validate_artifact(stage):
    infos = {p.relative_to(stage).as_posix(): page_info(p.read_text()) for p in stage.rglob('*.html')}
    errors = []
    for filename, info in infos.items():
        for ref in info.refs:
            path = local_path(ref)
            if path is None:
                continue
            target = stage / path
            if target.is_dir():
                target /= 'index.html'
            if not target.is_file():
                errors.append(f'{filename}: missing {ref}')
            fragment = unquote(urlsplit(ref).fragment)
            target_name = target.relative_to(stage).as_posix()
            if fragment and target_name in infos and fragment not in infos[target_name].ids:
                errors.append(f'{filename}: missing anchor {ref}')
    for css in stage.rglob('*.css'):
        for ref in re.findall(r'url\(\s*["\']?([^\)"\']+)', css.read_text()):
            path = local_path(ref.strip(), PurePosixPath(css.relative_to(stage).as_posix()))
            if path is not None and not (stage / path).is_file():
                errors.append(f'{css.relative_to(stage)}: missing {ref}')
    for p in stage.rglob('*'):
        if p.is_symlink():
            errors.append(f'Symlink in artifact: {p.relative_to(stage)}')
        if p.is_file() and (p.suffix in {'.csv', '.py', '.md'} or p.name == 'metadata.json'):
            errors.append(f'Build-only file in artifact: {p.relative_to(stage)}')
    if errors:
        raise BuildError('\n'.join(errors))
    total = sum(p.stat().st_size for p in stage.rglob('*') if p.is_file())
    if total >= MAX_SITE_BYTES:
        raise BuildError(f'Published site is {total} bytes; GitHub Pages permits at most 1 GB.')
    return total


def stage_site(root, stage, base_url=None):
    config = json.loads((root / 'site.json').read_text())
    base = site_url(base_url or config['url'])
    catalog = clean_catalog(json.loads((root / 'generated/content.json').read_text()))
    if not catalog.get('carousel'):
        raise BuildError('Add at least one included photograph to content/carousel/photos.csv.')
    generated = json.loads((root / 'generated/pages.json').read_text())
    pages = set(PAGES) | set(generated)
    for name in pages:
        if not re.fullmatch(r'[a-z0-9-]+\.html', name):
            raise BuildError(f'Invalid generated page: {name}')
    for name in sorted(pages | set(RUNTIME) | {'cv.pdf', '.nojekyll', 'generated/content.json'}):
        copy_public(root, stage, name)
    for p in sorted((root / 'assets').rglob('*')):
        if p.is_file() and p.suffix.lower() in ASSET_TYPES:
            copy_public(root, stage, p.relative_to(root).as_posix())
    images = set(catalog_images(catalog))
    for name in pages:
        for image in page_info((root / name).read_text()).images:
            path = local_path(image['src'])
            if path is not None:
                images.add(path)
    for path in sorted(images):
        copy_public(root, stage, path)
    first = catalog['carousel'][0]
    fallback = {'src': first.get('largeSrc') or first['src'],
                'alt': ', '.join(x for x in (first.get('location'), first.get('country')) if x)}
    descriptions = {'index.html': config['description'],
                    'about.html': 'About Daniel Zhang: software engineer, photographer, and graduate of Stanford University and UC Berkeley.',
                    'world-albums.html': 'Explore Daniel Zhang’s photographs on an interactive world atlas and browse albums by country.'}
    descriptions.update({g['page']: g['description'] for g in catalog.get('galleries', []) if g.get('description')})
    descriptions.update({a['page']: f'Photographs from {a["name"]} by Daniel Zhang. Explore the country album and view each photograph fullscreen.'
                         for a in catalog.get('countryAlbums', [])})
    (stage / 'generated/content.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    destinations = {}
    for name in sorted(pages):
        destination = output_path(name)
        if destination in destinations:
            raise BuildError(f'Conflicting public routes: {name}, {destinations[destination]}')
        destinations[destination] = name
        p = stage / name
        text = add_metadata(p.read_text(), name, config, base, fallback, descriptions.get(name) or descriptions.get(public_route(name)))
        target = stage / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(clean_html(text, name))
        if destination != name:
            redirect = redirect_html(name)
            route = public_route('about.html' if name == 'work.html' else name)
            redirect = redirect.replace('rel="canonical" href="' + route + '"', 'rel="canonical" href="' + urljoin(base, route) + '"')
            p.write_text(redirect)
    namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    ET.register_namespace('', namespace)
    sitemap = ET.Element('{' + namespace + '}urlset')
    for name in sorted(pages - {'work.html', '404.html'}):
        node = ET.SubElement(sitemap, '{' + namespace + '}url')
        ET.SubElement(node, '{' + namespace + '}loc').text = urljoin(base, public_route(name))
    ET.ElementTree(sitemap).write(stage / 'sitemap.xml', encoding='utf-8', xml_declaration=True)
    (stage / 'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: ' + base + 'sitemap.xml\n')
    cname = root / 'CNAME'
    if cname.exists():
        if cname.read_text().strip() != urlsplit(base).hostname:
            raise BuildError('CNAME differs from the site URL. Update site.json/SITE_URL or remove the old CNAME.')
        copy_public(root, stage, 'CNAME')
    return dict(bytes=validate_artifact(stage), pages=len(pages), images=len(images), url=base)


def build(root=ROOT, base_url=None):
    root = Path(root).resolve()
    sync(root)
    output = root / '_site'
    if output.is_symlink():
        raise BuildError('_site must not be a symlink.')
    with tempfile.TemporaryDirectory(prefix='.site-build-', dir=root) as temporary:
        temporary = Path(temporary)
        stage = temporary / 'site'
        stage.mkdir()
        report = stage_site(root, stage, base_url)
        previous = temporary / 'previous'
        if output.exists():
            output.rename(previous)
        try:
            stage.rename(output)
        except OSError:
            if previous.exists():
                previous.rename(output)
            raise
    print(f'Built {report["pages"]} pages / {report["images"]} image paths / '
          f'{report["bytes"] / 1048576:.1f} MiB in {output} for {report["url"]}')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', help='Override site.json URL (HTTPS origin).')
    args = parser.parse_args()
    try:
        build(base_url=args.base_url)
    except (BuildError, OSError, ValueError) as error:
        parser.exit(1, f'Build failed: {error}\n')
