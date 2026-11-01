import base64
import csv
import json
import hashlib
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from sync_content import ContentError, album_presentation, image_size, sync


class ContentSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.test-', dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ('content/galleries', 'content/carousel', 'content/countries', 'templates'):
            (self.root / directory).mkdir(parents=True)
        for name in ('manual-gallery.html', 'manual-country.html'):
            shutil.copy2(ROOT / 'templates' / name, self.root / 'templates' / name)
        (self.root / 'content/locations.csv').write_text(
            'location,country,latitude,longitude,coordinate_precision\nParis,France,48.8566,2.3522,City\n')

    def folder(self, name='night-walks'):
        folder = self.root / 'content/galleries' / name
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def photo(self, folder, name='city view.png'):
        # A real one-pixel PNG; identical copies exercise identity deduplication.
        data = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=')
        path = folder / name
        path.write_bytes(data)
        return path

    def csv(self, folder, rows, fields=None):
        fields = fields or ['filename', 'location', 'country', 'description']
        with (folder / 'photos.csv').open('w', newline='', encoding='utf-8-sig') as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

    def data(self):
        return json.loads((self.root / 'generated/content.json').read_text())

    def test_r2_manifest_builds_gallery_without_local_photos_or_thumbnail_cache(self):
        folder = self.folder()
        path = self.photo(folder)
        self.csv(folder, [dict(filename=path.name, location='Paris', country='France', description='The river')])
        sync(self.root)
        original = self.data()['photos'][0]
        key = path.relative_to(self.root).as_posix()
        objects = {key: dict(sha256=hashlib.sha256(path.read_bytes()).hexdigest(), bytes=path.stat().st_size)}
        for variant in original['thumbnailVariants']:
            thumb = self.root / variant['src']
            objects[variant['src']] = dict(sha256=hashlib.sha256(thumb.read_bytes()).hexdigest(), bytes=thumb.stat().st_size)
        entry = dict(sha256=objects[key]['sha256'], width=1, height=1,
                     thumbnailVariants=original['thumbnailVariants'], displayWidth=1, displayHeight=1)
        (self.root / 'site.json').write_text(json.dumps(dict(url='https://example.com', image_origin='https://photos.example.com')))
        (self.root / 'content/photo-assets.json').write_text(json.dumps(dict(objects=objects, sources={key: entry})))
        path.unlink()
        shutil.rmtree(self.root / 'generated/thumbnails')
        sync(self.root)
        photo = self.data()['photos'][0]
        self.assertEqual(photo['id'], original['id'])
        self.assertEqual(photo['src'], 'https://photos.example.com/content/galleries/night-walks/city%20view.png')
        self.assertTrue(photo['thumbnailSrc'].startswith('https://photos.example.com/generated/thumbnails/'))
        self.assertEqual(photo['albums'], original['albums'])
        self.assertIn(photo['src'], (self.root / 'gallery-night-walks.html').read_text())

    def test_new_gallery_csv_quoting_pin_country_and_escaped_page(self):
        folder = self.folder()
        self.photo(folder)
        self.csv(folder, [dict(filename='city view.png', location='Paris', country='france',
                               description='Evening, after the rain')])
        (folder / 'gallery.json').write_text(json.dumps(dict(title='Night & Day', description='<script>hello</script>')))
        result = sync(self.root)
        self.assertEqual((result['photos'], result['galleries']), (1, 1))
        data = self.data()
        photo = data['photos'][0]
        self.assertEqual(photo['country'], 'France')
        self.assertEqual(photo['lat'], 48.8566)
        self.assertEqual(photo['description'], 'Evening, after the rain')
        self.assertTrue((self.root / photo['thumbnailSrc']).is_file())
        self.assertIn('city%20view.png', photo['src'])
        self.assertEqual(data['countryAlbums'][0]['count'], 1)
        page = (self.root / 'gallery-night-walks.html').read_text()
        self.assertIn('Night &amp; Day', page)
        self.assertIn('&lt;script&gt;hello&lt;/script&gt;', page)
        self.assertNotIn('<script>hello</script>', page)

    def test_extend_existing_gallery_and_deduplicate_carousel_copy(self):
        folder = self.folder('metros')
        (folder / 'gallery.json').write_text('{"title":"World Metros","category":"Metros"}')
        self.photo(folder)
        row = dict(filename='city view.png', location='Paris', country='France', description='The station')
        self.csv(folder, [row])
        carousel = self.root / 'content/carousel'
        self.photo(carousel)
        self.csv(carousel, [row])
        sync(self.root)
        data = self.data()
        self.assertEqual(len(data['photos']), 1)
        self.assertEqual(data['photos'][0]['collections'], ['Metros'])
        self.assertEqual(len(data['galleries']), 1)
        self.assertEqual(data['carousel'][0]['id'], data['photos'][0]['id'])
        self.assertEqual(data['countryAlbums'][0]['count'], 1)

    def test_cover_only_photo_is_featured_without_sequence_or_atlas_membership(self):
        folder = self.folder('metros')
        self.photo(folder, 'station.png')
        self.photo(folder, 'cover.png')
        self.csv(folder, [
            dict(filename='station.png', id='station', title='Station', city='Paris'),
            dict(filename='cover.png', id='cover', title='The Loop', city='Chicago',
                 cover_only='true', country='United States'),
        ], fields=['filename', 'id', 'title', 'city', 'cover_only', 'country'])
        (folder / 'gallery.json').write_text(json.dumps(dict(
            title='Metros', category='Metros', cover='cover.png')))
        sync(self.root)
        data = self.data()
        cover = next(p for p in data['photos'] if p['id'] == 'cover')
        station = next(p for p in data['photos'] if p['id'] == 'station')
        self.assertTrue(cover['coverOnly'])
        self.assertFalse(cover['atlas'])
        self.assertEqual(cover['collections'], [])
        self.assertEqual(cover['albums'], [])
        self.assertEqual(station['collections'], ['Metros'])
        self.assertEqual(data['galleries'][0]['photo'], 'cover')
        self.assertIn('The Loop, Chicago', (self.root / 'gallery-metros.html').read_text())
        self.assertTrue((self.root / cover['thumbnailSrc']).is_file())

    def test_atlas_keeps_gallery_or_country_membership_only(self):
        folder = self.folder('metros')
        for name in ('station.png', 'map-only.png', 'country-only.png'):
            self.photo(folder, name)
        fields = ['filename', 'id', 'location', 'country', 'gallery_sequence', 'country_album']
        self.csv(folder, [
            dict(filename='station.png', id='station', location='Paris', country='France', country_album='false'),
            dict(filename='map-only.png', id='map-only', location='Paris', country='France',
                 gallery_sequence='false', country_album='false'),
            dict(filename='country-only.png', id='country-only', location='Paris', country='France',
                 gallery_sequence='false', country_album='true'),
        ], fields)
        (folder / 'gallery.json').write_text('{"title":"Metros","category":"Metros"}')
        sync(self.root)
        photos = {p['id']: p for p in self.data()['photos']}
        self.assertEqual(photos['station']['collections'], ['Metros'])
        self.assertTrue(photos['station']['atlas'])
        for identity in ('map-only', 'country-only'):
            self.assertEqual(photos[identity]['collections'], [])
            self.assertEqual(photos[identity]['atlas'], identity == 'country-only')
            self.assertFalse(photos[identity]['coverOnly'])
        self.assertEqual(photos['map-only']['albums'], [])
        self.assertEqual(photos['country-only']['albums'], ['France'])
        self.assertEqual(self.data()['countryAlbums'][0]['photoIds'], ['country-only'])

    def test_country_sequence_exclusion_hides_unshowcased_map_photo(self):
        folder = self.root / 'content/countries/france'
        folder.mkdir(parents=True)
        self.photo(folder, 'selected.png')
        self.photo(folder, 'map-only.png')
        self.csv(folder, [
            dict(filename='selected.png', id='selected', location='Paris', country='France'),
            dict(filename='map-only.png', id='map-only', location='Paris', country='France',
                 country_sequence='false'),
        ], ['filename', 'id', 'location', 'country', 'country_sequence'])
        sync(self.root)
        data = self.data()
        self.assertEqual(data['countryAlbums'][0]['photoIds'], ['selected'])
        photos = {p['id']: p for p in data['photos']}
        self.assertFalse(photos['map-only']['atlas'])
        self.assertEqual(photos['map-only']['albums'], [])
        self.assertTrue((self.root / photos['map-only']['src']).is_file())

    def test_country_chapters_preserve_all_photos_and_allow_highlight_overlap(self):
        presentation = album_presentation({
            'highlights': ['tokyo', 'kyoto'],
            'chapters': [{'title': 'Tokyo', 'photoIds': ['tokyo']},
                         {'title': 'Kyoto', 'photoIds': ['kyoto']}]
        }, ['tokyo', 'kyoto', 'new-photo'])
        self.assertEqual(presentation['highlights'], ['tokyo', 'kyoto'])
        self.assertEqual(presentation['chapters'][-1], {
            'title': 'Other moments', 'photoIds': ['new-photo']})
        self.assertEqual([p for c in presentation['chapters'] for p in c['photoIds']],
                         ['tokyo', 'kyoto', 'new-photo'])

    def test_country_chapters_reject_missing_or_duplicate_memberships(self):
        for config in [
            {'highlights': ['outside'], 'chapters': [{'title': 'Tokyo', 'photoIds': ['tokyo']}]},
            {'chapters': [{'title': 'Tokyo', 'photoIds': ['tokyo', 'tokyo']}]},
            {'chapters': [{'title': 'Tokyo', 'photoIds': ['tokyo']},
                          {'title': 'Kyoto', 'photoIds': ['tokyo']}]},
        ]:
            with self.assertRaises(ContentError):
                album_presentation(config, ['tokyo'])

    def test_bad_csv_preserves_last_valid_output(self):
        folder = self.folder()
        self.photo(folder)
        sync(self.root)
        before = (self.root / 'generated/content.json').read_bytes()
        self.csv(folder, [dict(filename='missing.jpg')])
        with self.assertRaises(ContentError):
            sync(self.root)
        self.assertEqual((self.root / 'generated/content.json').read_bytes(), before)

    def test_path_escape_and_duplicate_rows_are_rejected(self):
        folder = self.folder()
        self.csv(folder, [dict(filename='../outside.jpg')])
        with self.assertRaises(ContentError):
            sync(self.root)
        self.photo(folder)
        self.csv(folder, [dict(filename='city view.png'), dict(filename='city view.png')])
        with self.assertRaises(ContentError):
            sync(self.root)

    def test_coordinates_new_country_and_generated_page_cleanup(self):
        folder = self.folder()
        self.photo(folder)
        fields = ['filename', 'location', 'country', 'description', 'latitude', 'longitude']
        self.csv(folder, [dict(filename='city view.png', location='Test Place', country='New Country',
                               latitude='0', longitude='0')], fields)
        sync(self.root)
        data = self.data()
        self.assertEqual(data['photos'][0]['lat'], 0)
        self.assertEqual(data['photos'][0]['lng'], 0)
        self.assertTrue((self.root / 'country-new-country.html').is_file())
        shutil.rmtree(folder)
        sync(self.root)
        self.assertFalse((self.root / 'gallery-night-walks.html').exists())
        self.assertFalse((self.root / 'country-new-country.html').exists())

    def test_replace_carousel_requires_an_image_and_respects_exclusions(self):
        carousel = self.root / 'content/carousel'
        (carousel / 'settings.json').write_text('{"mode":"replace"}')
        with self.assertRaises(ContentError):
            sync(self.root)
        self.photo(carousel)
        sync(self.root)
        self.assertEqual(self.data()['carouselMode'], 'replace')
        self.csv(carousel, [dict(filename='city view.png', include='false')], ['filename', 'include'])
        with self.assertRaises(ContentError):
            sync(self.root)

    def test_dimensions_for_png(self):
        self.assertEqual(image_size(self.photo(self.folder())), (1, 1))

    def test_shared_photo_edit_in_one_csv_updates_catalog_and_conflicts_are_reported(self):
        first, second = self.folder('first'), self.folder('second')
        image = self.photo(first)
        self.photo(second)
        baseline = dict(id='shared', title='Original caption', description='', location='Paris',
                        country='France', lat=48.8566, lng=2.3522, coordinatePrecision='City',
                        locationMethod='gps', _atlasOrder=1,
                        _imageSha256=hashlib.sha256(image.read_bytes()).hexdigest())
        fields = ['filename', 'id', 'title', 'location', 'country', 'description']
        row = dict(filename='city view.png', id='shared', title='Original caption',
                   location='Paris', country='France', description='')
        for folder in (first, second):
            (folder / 'metadata.json').write_text(json.dumps({'shared': baseline}))
            self.csv(folder, [row], fields)
        self.csv(second, [dict(row, title='Corrected caption')], fields)
        sync(self.root)
        self.assertEqual(len(self.data()['photos']), 1)
        self.assertEqual(self.data()['photos'][0]['title'], 'Corrected caption')
        self.assertEqual(len(self.data()['photos'][0]['collections']), 2)
        before = (self.root / 'generated/content.json').read_bytes()
        self.csv(first, [dict(row, title='A conflicting caption')], fields)
        with self.assertRaises(ContentError):
            sync(self.root)
        self.assertEqual((self.root / 'generated/content.json').read_bytes(), before)

    def test_fallback_copy_is_not_imported_as_an_extra_photo(self):
        folder = self.folder()
        self.photo(folder)
        self.photo(folder, 'fallback.png')
        fields = ['filename', 'fallback_filename', 'include']
        self.csv(folder, [dict(filename='city view.png', fallback_filename='fallback.png')], fields)
        sync(self.root)
        self.assertEqual(len(self.data()['photos']), 1)
        self.assertTrue(self.data()['photos'][0]['src'].endswith('/fallback.png'))
        self.csv(folder, [dict(filename='city view.png', fallback_filename='fallback.png', include='false')], fields)
        sync(self.root)
        self.assertEqual(self.data()['photos'], [])

    def test_country_folder_order_and_disabling_membership(self):
        folder = self.root / 'content/countries/france'
        folder.mkdir(parents=True)
        self.photo(folder, 'first.png')
        other = self.photo(folder, 'second.png')
        other.write_bytes(other.read_bytes() + b'\x00')
        self.csv(folder, [dict(filename='second.png', location='Paris', country='France'),
                          dict(filename='first.png', location='Paris', country='France')])
        sync(self.root)
        album = self.data()['countryAlbums'][0]
        photos = {p['id']: p for p in self.data()['photos']}
        self.assertTrue(photos[album['photoIds'][0]]['src'].endswith('/second.png'))
        self.csv(folder, [dict(filename='second.png', include='false'), dict(filename='first.png')],
                 ['filename', 'include'])
        sync(self.root)
        self.assertEqual(self.data()['countryAlbums'][0]['count'], 1)


if __name__ == '__main__':
    unittest.main()
