import PreviewLoader from "./preview-loader";

export default function PreviewPage() {
  return <section className="render-lab-page">
    <div className="page-heading"><div><p className="eyebrow">LOCAL RENDERING · CAPABILITY STUDY</p>
    <h1>Render lab</h1>
    <p>A verified path from a local composition to a real video. Text, image, video, and a quiet audio signal.</p></div></div>
    <div className="notice">This is a capability sample, not an approved campaign. Rendering runs in a separate local process.</div>
    <PreviewLoader />
  </section>;
}
