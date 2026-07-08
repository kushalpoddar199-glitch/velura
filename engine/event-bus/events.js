// events.js — canonical event type names for the Velura MR pipeline.
// Kept as plain string constants so typos fail fast (undefined import)
// rather than silently mismatching a hand-typed string elsewhere.

export const EVENTS = Object.freeze({
  FLOOR_POLYGON_READY: 'FloorPolygonReady',
  BUILDABLE_REGION_READY: 'BuildableRegionReady',
  LAYOUT_GENERATED: 'LayoutGenerated',
  MATERIAL_REQUIREMENTS_COMPUTED: 'MaterialRequirementsComputed',
  VARIANTS_GENERATED: 'VariantsGenerated',
  ATLAS_BUILT: 'AtlasBuilt',
  SCENE_RENDERED: 'SceneRendered',
  METRICS_READY: 'MetricsReady',

  // Typed error events — engines emit these instead of throwing across the bus.
  GEOMETRY_ERROR: 'GeometryError',
  LAYOUT_ERROR: 'LayoutError',
  MATERIAL_GENERATION_FAILED: 'MaterialGenerationFailed',
});
