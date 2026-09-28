export type {
  StillAspectRatio,
  StillBrief,
  StillJobResult,
  StillOption,
  StillProvider,
  StillProviderCapabilities,
  StillProviderContext,
  StillProviderId,
  StillRef,
  StillRefRole,
  StillTechnique,
} from "./still-brief";

export {
  STILL_TECHNIQUE_GUIDE,
  recommendTechnique,
  refsByRole,
  resolvePromptSent,
} from "./techniques";

export {
  STILL_RUBRIC,
  AUTOMATED_THRESHOLDS,
  automatedPass,
  casePass,
  weightedRubricScore,
} from "./eval-rubric";
export type {
  AutomatedStillChecks,
  DimensionScore,
  RubricDimension,
  RubricDimensionId,
  StillEvalCaseResult,
  VisualGrade,
} from "./eval-rubric";

export {
  histogramDistance,
  listFixtureFiles,
  loadFixture,
  runAutomatedStillChecks,
} from "./eval-metrics";
export type { StillEvalFixture } from "./eval-metrics";

export {
  buildStillProviderRegistry,
  createFolderImportProvider,
  createFalFluxProvider,
  createGoogleGeminiImageProvider,
  createLocalComfyThinProvider,
  createMidjourneyBridgeProvider,
  createNightCafeProvider,
  createOpenAiImagesProvider,
  createReplicateProvider,
  pickProvider,
  suggestProviderForBrief,
} from "./providers";
