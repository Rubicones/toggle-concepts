import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findingPresentation, matchVisualSource} from '../packages/brand/finding-presentation';

test('palette records become named swatches with roles and groups', () => {
  const value = '{"name":"Canvas","hex":"#000000","roles":["field"],"group":"core"}';
  const result = findingPresentation(value, 'primaryColors');
  assert.deepEqual(result.colors, [{value: '#000000', label: 'Canvas', context: 'field · core'}]);
  assert.equal(result.text, '');
  assert.equal(value, '{"name":"Canvas","hex":"#000000","roles":["field"],"group":"core"}');
});

test('preserves alpha and original functional color spaces without converting values', () => {
  const result = findingPresentation('Accent #DFFF00; wash #dfff0011; oklch(0.72 0.20 350); rgb(20 30 40 / 50%)', 'secondaryColors');
  assert.deepEqual(result.colors.map(c => c.value), ['#DFFF00', '#dfff0011', 'oklch(0.72 0.20 350)', 'rgb(20 30 40 / 50%)']);
  assert.match(result.text, /wash/);
  assert.equal(findingPresentation('#12345 #123456789', 'primaryColors').colors.length, 0);
});

test('nested token palettes retain candidate labels and all entries', () => {
  const result = findingPresentation(JSON.stringify({colors: [{name: 'Ink', value: '#123'}, {name: 'Paper', value: '#fff'}]}), 'semanticColors');
  assert.deepEqual(result.colors.map(c => [c.label, c.value]), [['Ink', '#123'], ['Paper', '#fff']]);
});

test('raw or JSON-embedded SVG becomes an isolated image data URL', () => {
  const svg = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#DFFF00"/></svg>';
  for (const value of [svg, JSON.stringify({name: 'App icon', svg})]) {
    const result = findingPresentation(value, 'icon');
    assert.equal(result.images[0].kind, 'svg');
    assert.match(result.images[0].src, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.match(decodeURIComponent(result.images[0].src), /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.equal(result.colors.length, 0);
    assert.equal(result.text, '');
  }
});

test('uploaded file references resolve uniquely within the campaign', () => {
  const sources = [{id: 'one', relative_path: 'brand/logos/icon.svg'}, {id: 'two', relative_path: 'other/icon.svg'}];
  assert.equal(matchVisualSource('logos/icon.svg', sources)?.id, 'one');
  assert.equal(matchVisualSource('icon.svg', sources), null);
  assert.equal(matchVisualSource('../brand/logos/icon.svg', sources), null);
  const result = findingPresentation('{"path":"logos/icon.svg"}', 'icon', sources);
  assert.deepEqual(result.images, [{src: 'one', label: 'brand/logos/icon.svg', kind: 'source'}]);
});

test('image findings can preview the actual uploaded source without inventing an asset', () => {
  const source = {id: 'photo', relative_path: 'brand/photo.jpg'};
  assert.equal(findingPresentation('Warm natural light.', 'photography', [], source).images[0].src, 'photo');
  assert.equal(findingPresentation('Warm natural light.', 'photography').images.length, 0);
  assert.equal(findingPresentation('Use the name unchanged.', 'productIdentity', [], source).images.length, 0);
});

test('untrusted remote URLs and HTML do not become preview requests', () => {
  for (const value of ['https://example.org/image.svg', 'javascript:alert(1)', '<img src="/api/action" onerror="alert(1)">', 'data:text/html,<script>alert(1)</script>']) {
    assert.equal(findingPresentation(value, 'icon').images.length, 0);
  }
  const raster = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(findingPresentation(raster, 'imagery').images[0].src, raster);
});

test('ordinary prose and unknown structured findings remain fully readable', () => {
  for (const value of ['App icon', '{"instructions":"Do not distort"}']) assert.equal(findingPresentation(value, 'logoUsage').text, value);
});
