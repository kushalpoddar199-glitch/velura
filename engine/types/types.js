// types.js — Data contracts between Velura MR modules.
// Pure documentation + constants. No logic, no imports, no side effects.
// Isomorphic: runs unmodified in Node (tests) and the browser (WebXR runtime).
//
// Spatial convention: metres, right-handed, Y-up, matching WebXR.
// Floor geometry lives in the XZ plane in each FloorPolygon's own
// anchor-local space (see FloorPolygon.anchorMatrix).

/**
 * @typedef {Object} Point2
 * @property {number} x  metres, floor-plane horizontal
 * @property {number} z  metres, floor-plane depth
 */

/**
 * FloorPolygon — sole output of Scene Understanding (Module 1).
 * Nothing downstream of Geometry Engine knows WebXR exists.
 *
 * @typedef {Object} FloorPolygon
 * @property {Point2[]} points          ordered CCW boundary, anchor-local metres
 * @property {number}   y               floor height in anchor-local space (metres)
 * @property {Float32Array} anchorMatrix 4x4 column-major world transform of the anchor
 * @property {number}   areaM2
 * @property {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 * @property {string}   anchorId        stable id, for re-tiling without re-detecting
 */

/**
 * BuildableFloorRegion — sole output of the Geometry Engine (Module 2).
 * The Layout Engine treats this as an opaque region and never performs
 * polygon boolean operations itself.
 *
 * @typedef {Object} BuildableFloorRegion
 * @property {Point2[]}   outer   simplified, validated outer boundary
 * @property {Point2[][]} holes   subtracted regions (columns, stairs, islands)
 * @property {number}     areaM2  net buildable area (outer minus holes)
 * @property {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 */

/**
 * SlabSpec — physical specification of one stone product.
 * Dimensions in MILLIMETRES (industry standard for stone); engines convert
 * to metres internally.
 *
 * @typedef {Object} SlabSpec
 * @property {number} widthMM
 * @property {number} heightMM    this is DEPTH on the floor plane
 * @property {number} groutMM     gap between slabs
 * @property {'grid'|'brick'|'herringbone'} pattern
 * @property {number} pricePerM2  currency-agnostic
 */

/**
 * PatternRule — sole output of the Design Rule Engine (Module 4).
 * A strategy object, not a class hierarchy — stays data-like and serializable.
 *
 * @typedef {Object} PatternRule
 * @property {(row:number, col:number) => {dx:number, dz:number, rotationY:number}} computeOffset
 * @property {(row:number, col:number) => string} computeSlot
 * @property {string} name
 */

/**
 * Placement — one slab instance produced by the Layout Engine (Module 3).
 * Position is in the SAME anchor-local space as FloorPolygon / BuildableFloorRegion.
 * `id` is stable: unchanged across re-runs with identical (region, spec, rule, seed),
 * different the moment any of those inputs changes. This is what future supplier
 * inventory, quotations, ordering, editing, and collaboration depend on.
 *
 * @typedef {Object} Placement
 * @property {string}  id
 * @property {string}  slabId       identity of the physical slab this maps to (V3)
 * @property {number}  variantId    which Material Engine variant this slab uses
 * @property {Object}  transform    { position:{x,y,z}, rotationY, scale:{x,y,z} }
 * @property {Object}  geometry     { widthM, depthM, isCut, cutPolygon? }
 * @property {Object}  metadata     { row, col, patternSlot, isBookmatchPair, pairId? }
 */

/**
 * LayoutMetrics — everything the Material Intelligence Panel displays.
 * Derived purely from the layout; no separate calculation elsewhere.
 *
 * @typedef {Object} LayoutMetrics
 * @property {number} floorAreaM2
 * @property {number} slabCount
 * @property {number} fullSlabs
 * @property {number} cutSlabs
 * @property {number} coveredAreaM2
 * @property {number} materialAreaM2   area of stone consumed incl. cut waste
 * @property {number} wasteAreaM2
 * @property {number} wastePercent
 * @property {number} estimatedCost
 * @property {number} rows
 * @property {number} cols
 * @property {string} pattern
 */

/**
 * LayoutResult — full output of the Layout Engine (Module 3).
 * @typedef {Object} LayoutResult
 * @property {Placement[]}   placements
 * @property {LayoutMetrics} metrics
 * @property {SlabSpec}      spec
 */

/**
 * MaterialAsset — full PBR description of one physical, scanned marble.
 * Every channel is present from V1 onward so the Renderer's shader never
 * branches on channel availability.
 *
 * @typedef {Object} MaterialAsset
 * @property {*} albedo
 * @property {*} normal
 * @property {*} roughness
 * @property {*} ao
 * @property {*} height
 * @property {{grainAxis:{x:number,z:number}, seed:number, sourceId:string}} metadata
 */

/**
 * MaterialRequirements — sole output of the Variant Budget Manager (Module 6).
 * @typedef {Object} MaterialRequirements
 * @property {number} variantCount
 * @property {number} textureResolution
 * @property {'low'|'medium'|'high'} shaderComplexity
 */

/**
 * MaterialVariant / VariantSet — sole output of any MaterialProvider (Module 5).
 * @typedef {Object} MaterialVariant
 * @property {number} id
 * @property {*} albedo
 * @property {*} normal
 * @property {*} roughness
 * @property {*} ao
 * @property {*} height
 * @property {{grainAxis:Object, seed:number}} metadata
 *
 * @typedef {Object} VariantSet
 * @property {MaterialVariant[]} variants
 * @property {Object} metadata
 */

/**
 * AtlasDescriptor — sole output of the Atlas Builder (Module 7).
 * @typedef {Object} AtlasDescriptor
 * @property {*} albedo
 * @property {*|null} normal
 * @property {*|null} orm       packed occlusion/roughness/metalness
 * @property {number} cols
 * @property {number} rows
 * @property {number} variantCount
 * @property {(i:number) => {u0:number,v0:number,u1:number,v1:number}} uvForVariant
 */

/**
 * DeviceProfile — static, known hardware budget (Module 6 amendment).
 * @typedef {Object} DeviceProfile
 * @property {number} vramMB
 * @property {number} maxDrawCalls
 * @property {number} maxVariants
 * @property {number} maxTextureResolution
 */

// ---- Standard stone dimensions (mm). Custom dims are just a SlabSpec literal. ----
export const SLAB_PRESETS = Object.freeze({
  '2400x1600': { widthMM: 2400, heightMM: 1600 },
  '2800x1800': { widthMM: 2800, heightMM: 1800 },
  '3200x1600': { widthMM: 3200, heightMM: 1600 },
});

export const DEFAULT_SPEC = Object.freeze({
  widthMM: 2400,
  heightMM: 1600,
  groutMM: 3,
  pattern: 'grid',
  pricePerM2: 0,
});

// Nothing else to export — the JSDoc @typedefs above are the contracts
// every module is written against.
