/** Presentation only: original findings and review decisions stay unchanged. */
export type BrandVisualSource = {id: string; relative_path: string};
export type FindingColor = {value: string; label: string; context: string};
export type FindingImage = {src: string; label: string; kind: 'svg' | 'image' | 'source'};

const colorFields = new Set(['primaryColors', 'secondaryColors', 'semanticColors']);
const visualFields = new Set(['wordmark', 'icon', 'imagery', 'photography', 'illustration']);
const imageExtension = /\.(?:svg|png|jpe?g|webp|gif|avif|bmp|tiff?)$/i;
const colorPattern = /#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color)\([^()]+\)/gi;
const colorValue = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color)\([\w\s.,%+\-/]+\))$/i;

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(v => typeof v === 'string' ? [v] : []);
  return [];
}

function svgImage(text: string): string | null {
  const match = text.match(/<svg\b[\s\S]*?<\/svg\s*>/i);
  if (!match) return null;
  let svg = match[0];
  if (!/^<svg\b[^>]*\sxmlns\s*=/i.test(svg)) svg = svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  // Used exclusively in an <img>, never injected into the application's DOM.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizedPath(path: string): string | null {
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(path)) return null;
  const clean = path.replaceAll('\\', '/').replace(/^(?:\.\/|\/)+/, '');
  if (clean.split('/').includes('..') || !imageExtension.test(clean)) return null;
  return clean;
}

/** Match uploaded references only; ambiguous filenames never pick an arbitrary asset. */
export function matchVisualSource(path: string, sources: BrandVisualSource[]) {
  const clean = normalizedPath(path);
  if (!clean) return null;
  const exact = sources.filter(s => s.relative_path === clean);
  if (exact.length === 1) return exact[0];
  const suffix = sources.filter(s => s.relative_path.endsWith('/' + clean));
  return suffix.length === 1 ? suffix[0] : null;
}

export function findingPresentation(value: string, field: string, sources: BrandVisualSource[] = [], source?: BrandVisualSource) {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { /* Prose and SVG are valid findings too. */ }
  const colors: FindingColor[] = [], images: FindingImage[] = [], seenColors = new Set<string>(), seenImages = new Set<string>();
  const addImage = (image: FindingImage) => {
    if (!seenImages.has(image.src)) { seenImages.add(image.src); images.push(image); }
  };
  const addColor = (candidate: string, label: string, context: string) => {
    if (!colorValue.test(candidate)) return;
    const key = `${candidate.toLowerCase()}|${label}|${context}`;
    if (!seenColors.has(key)) { seenColors.add(key); colors.push({value: candidate, label, context}); }
  };
  const queue: {value: unknown; label: string; context: string}[] = [{value: parsed ?? value, label: '', context: ''}];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i], current = item.value;
    if (Array.isArray(current)) { for (const value of current) queue.push({...item, value}); continue; }
    if (current && typeof current === 'object') {
      const object = current as Record<string, unknown>;
      const label = strings(object.name ?? object.label ?? object.token).join(' · ') || item.label;
      const context = [object.roles ?? object.role, object.group ?? object.usage].flatMap(strings).join(' · ') || item.context;
      for (const [key, entry] of Object.entries(object)) queue.push({value: entry, label: label || key, context});
      continue;
    }
    if (typeof current !== 'string') continue;
    // Only treat colors as swatches in color fields, not hex fills inside artwork.
    if (colorFields.has(field)) for (const match of current.matchAll(colorPattern)) addColor(match[0], item.label, item.context);
    const svg = svgImage(current);
    if (svg) addImage({src: svg, label: item.label || 'SVG artwork', kind: 'svg'});
    else {
      // Embedded raster data has no remote URL, HTML or script scheme.
      const embedded = current.match(/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[\da-z+/=\s]+$/i);
      const svgData = current.match(/^data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,[^\s]+$/i);
      if (embedded || svgData) addImage({src: current, label: item.label || 'Embedded image', kind: svgData ? 'svg' : 'image'});
      const paths = [current, ...Array.from(current.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g), m => m[1])];
      for (const path of paths) {
        const asset = matchVisualSource(path.trim(), sources);
        if (asset) addImage({src: asset.id, label: asset.relative_path, kind: 'source'});
      }
    }
  }
  // For a finding about an uploaded image, show the actual source, not a guessed URL.
  if (!images.length && visualFields.has(field) && source && imageExtension.test(source.relative_path)) {
    addImage({src: source.id, label: source.relative_path, kind: 'source'});
  }
  const visual = colors.length > 0 || images.length > 0;
  const prose = parsed === undefined ? value.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, '').replace(/^```(?:svg|xml)?\s*|```$/g, '').trim() : '';
  return {colors, images, text: visual ? (prose.startsWith('data:image/') ? '' : prose) : value};
}
