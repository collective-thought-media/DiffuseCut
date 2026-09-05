import fs from "fs";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { resolveProjectRoot, resolveMediaPath } from "@/lib/paths/project-paths";

const db = getDb();
const project = db
  .select()
  .from(schema.projects)
  .where(eq(schema.projects.id, "XR2JauFsrvIvpBnIZ4rGN"))
  .get()!;
const root = resolveProjectRoot(project);
console.log("root", root);

const files = [
  "locations/4VFKlUg4gi9I_hQWEvm6Q/states/wkDxv7Mkz0bvCCPJbb3tR/angles/aNdSwSZWx-yd26FrXx3W8/reference.png",
  ".diffusecut/scratch/batches/CjyMI-wfmudEOaPi4xeQq/RtUaxiJP2uBvuIS0myWiS-character.png",
  "storyboard/shots/sRiy3p8VWsrlWnOpHMMpN/candidates/CjyMI-wfmudEOaPi4xeQq/mFWk89S5hLFob9EZsbc5g.png",
];

for (const rel of files) {
  const abs = resolveMediaPath(root, rel);
  console.log(rel, fs.existsSync(abs) ? "OK" : "MISSING");
  console.log(" ", abs);
}
