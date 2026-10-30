import { sampleScene } from "./scene";
import { parseScene } from "../packages/contracts/scene";

// English presentation of the M00 fixture. Historical fixture/render bytes stay intact.
export const previewScene = parseScene({ ...sampleScene, revisionId: "m00-scene-en-preview-r1", locale: "en-GB",
  copy: { headline: "Light for what matters", cta: "Explore Luma One", logo: "LUMA / LOCAL RENDER STUDY" } });
