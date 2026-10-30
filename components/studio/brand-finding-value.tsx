'use client';

import {useMemo, useState} from 'react';
import {findingPresentation, type BrandVisualSource, type FindingImage} from '@/packages/brand/finding-presentation';
import type {SavedBrandFinding} from '@/packages/brand/field-extraction';

export function BrandFindingValue({finding, endpoint, sources}: {finding: SavedBrandFinding; endpoint: string; sources: BrandVisualSource[]}) {
  const value = finding.edited_value ?? finding.value;
  const presentation = useMemo(() => findingPresentation(value, finding.field, sources, finding.material ? {id: finding.material_id, ...finding.material} : undefined), [value, finding.field, finding.material_id, finding.material, sources]);
  return <div className="brandbook-value">
    {presentation.colors.length > 0 && <div className="brandbook-swatches">{presentation.colors.map((color, i) => <figure className="brandbook-color" key={i}>
      <div className="brandbook-color-chip"><span style={{backgroundColor: color.value}} role="img" aria-label={color.value}/></div>
      <figcaption>{color.label && <strong>{color.label}</strong>}<code>{color.value}</code>{color.context && <small>{color.context}</small>}</figcaption>
    </figure>)}</div>}
    {presentation.images.length > 0 && <div className="brandbook-artworks">{presentation.images.map(image => <Artwork key={image.src} image={image} endpoint={endpoint}/>)}</div>}
    {presentation.text && <p className="brandbook-finding-value">{presentation.text}</p>}
  </div>;
}

function Artwork({image, endpoint}: {image: FindingImage; endpoint: string}) {
  const [failed, setFailed] = useState(false), [dark, setDark] = useState(false);
  const src = image.kind === 'source' ? `${endpoint.replace('/brand-fields', '/brand-intake')}?preview=${encodeURIComponent(image.src)}&page=1` : image.src;
  return <figure className="brandbook-artwork">
    <div className={`brandbook-artwork-stage ${dark ? 'is-dark' : ''}`}>
      {failed ? <p role="status">Preview unavailable. The original is available below.</p> :
        // Private previews and SVG data must stay in an isolated image context; no optimizer or HTML injection.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={image.label} loading="lazy" decoding="async" onError={() => setFailed(true)}/>}
    </div>
    <figcaption><span><strong>{image.kind === 'source' ? 'Source image' : image.kind === 'svg' ? 'SVG artwork' : 'Image'}</strong><small>{image.label}</small></span><button type="button" aria-pressed={dark} onClick={() => setDark(!dark)}>{dark ? 'Light background' : 'Dark background'}</button></figcaption>
  </figure>;
}
