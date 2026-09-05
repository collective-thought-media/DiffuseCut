import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  creativePackSchema,
  loadCreativePack,
  parseCreativePackFromText,
} from "../../../scripts/eval/creative-pack";

describe("eval creative pack", () => {
  it("loads the default creative pack", () => {
    const packPath = path.join(
      process.cwd(),
      "scripts/eval/default-creative-pack.json"
    );
    const pack = loadCreativePack(packPath);
    expect(pack.characters.length).toBeGreaterThanOrEqual(2);
    expect(pack.shots.some((s) => s.renderDeep)).toBe(true);
  });

  it("parses JSON from markdown fences", () => {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "scripts/eval/default-creative-pack.json"),
      "utf8"
    );
    const wrapped = "```json\n" + raw + "\n```";
    const pack = parseCreativePackFromText(wrapped);
    expect(creativePackSchema.parse(pack).title).toBeTruthy();
  });
});
