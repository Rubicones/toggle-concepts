import json from "./scene.json";
import { parseScene } from "../packages/contracts/scene";

export const sampleScene = parseScene(json);
