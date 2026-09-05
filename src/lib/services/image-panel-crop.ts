import fs from "fs";

import path from "path";

import ffmpeg from "fluent-ffmpeg";

import { getFfmpegPathSetting } from "@/lib/services/settings";



export type ImagePanelSide = "left" | "right";



const DEFAULT_PAD_COLOR = "0x808080";



function configureFfmpeg(customPath?: string | null): void {

  if (customPath) {

    ffmpeg.setFfmpegPath(customPath);

    const ffprobePath = customPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");

    if (fs.existsSync(ffprobePath)) {

      ffmpeg.setFfprobePath(ffprobePath);

    }

  }

}



function buildCropFilter(panel: ImagePanelSide): string {

  return panel === "left" ? "crop=iw/2:ih:0:0" : "crop=iw/2:ih:iw/2:0";

}



function buildCropPadFilter(

  panel: ImagePanelSide,

  targetWidth: number,

  targetHeight: number,

  padColor: string

): string {

  const crop = buildCropFilter(panel);

  return `${crop},scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`;

}



/** Crop the left or right half of a side-by-side panel image. */

export async function cropImagePanel(

  sourceAbs: string,

  destAbs: string,

  panel: ImagePanelSide

): Promise<void> {

  const ffmpegPath = await getFfmpegPathSetting();

  configureFfmpeg(ffmpegPath);

  fs.mkdirSync(path.dirname(destAbs), { recursive: true });



  const cropFilter = buildCropFilter(panel);



  await new Promise<void>((resolve, reject) => {

    ffmpeg(sourceAbs)

      .outputOptions(["-frames:v", "1"])

      .videoFilters(cropFilter)

      .output(destAbs)

      .on("end", () => resolve())

      .on("error", (err) => reject(err))

      .run();

  });

}



/**

 * Crop a diptych panel and pad to the project reference aspect ratio (e.g. 16:9).

 * Keeps the subject centered on a neutral gray backdrop.

 */

export async function cropAndPadImagePanel(

  sourceAbs: string,

  destAbs: string,

  panel: ImagePanelSide,

  targetWidth: number,

  targetHeight: number,

  padColor: string = DEFAULT_PAD_COLOR

): Promise<void> {

  const ffmpegPath = await getFfmpegPathSetting();

  configureFfmpeg(ffmpegPath);

  fs.mkdirSync(path.dirname(destAbs), { recursive: true });



  const filter = buildCropPadFilter(panel, targetWidth, targetHeight, padColor);



  await new Promise<void>((resolve, reject) => {

    ffmpeg(sourceAbs)

      .outputOptions(["-frames:v", "1"])

      .videoFilters(filter)

      .output(destAbs)

      .on("end", () => resolve())

      .on("error", (err) => reject(err))

      .run();

  });

}



export { buildCropPadFilter, DEFAULT_PAD_COLOR };


