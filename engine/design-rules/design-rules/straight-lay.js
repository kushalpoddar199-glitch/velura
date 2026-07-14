import {
  polygonArea,
  clipPolygon,
  getRectangleCorners,
  polygonBounds
} from '../../geometry/geometry.js';

export const StraightLayRule = {
  name: 'straight-lay',

  compute(polygon, slabSpec, config, prng) {
    const { width, height, spacing = 0.003 } = slabSpec;
    const angle = config.angle ?? 0;
    const centered = config.centered !== false;

    const stepX = width + spacing;
    const stepY = height + spacing;
    const fullArea = width * height;
    const floorArea = polygonArea(polygon);

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const toLocal = p => ({ x: p.x * cosA + p.y * sinA, y: -p.x * sinA + p.y * cosA });
    const toWorld = p => ({ x: p.x * cosA - p.y * sinA, y: p.x * sinA + p.y * cosA });

    let lMinX = Infinity, lMinY = Infinity, lMaxX = -Infinity, lMaxY = -Infinity;
    for (const p of polygon) {
      const lp = toLocal(p);
      lMinX = Math.min(lMinX, lp.x);
      lMinY = Math.min(lMinY, lp.y);
      lMaxX = Math.max(lMaxX, lp.x);
      lMaxY = Math.max(lMaxY, lp.y);
    }

    let startX = lMinX;
    let startY = lMinY;
    if (centered) {
      const spanX = lMaxX - lMinX;
      const spanY = lMaxY - lMinY;
      const overX = Math.ceil(spanX / stepX) * stepX - spanX;
      const overY = Math.ceil(spanY / stepY) * stepY - spanY;
      startX = lMinX - overX * 0.5;
      startY = lMinY - overY * 0.5;
    }

    const cols = Math.ceil((lMaxX - startX) / stepX) + 1;
    const rows = Math.ceil((lMaxY - startY) / stepY) + 1;

    const placements = [];
    let totalSlabArea = 0;
    let placedArea = 0;
    let id = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const localCenter = {
          x: startX + col * stepX + stepX * 0.5,
          y: startY + row * stepY + stepY * 0.5
        };
        const worldCenter = toWorld(localCenter);
        const corners = getRectangleCorners(worldCenter, width, height, angle);
        const intersection = clipPolygon(polygon, corners);

        if (intersection.length < 3) continue;

        const interArea = polygonArea(intersection);
        if (interArea < 1e-8) continue;

        const isCut = Math.abs(interArea - fullArea) > 1e-6;
        const bounds = polygonBounds(intersection);

        placements.push({
          id: id++, row, col,
          x: worldCenter.x, y: worldCenter.y,
          rotation: angle, isCut,
          cutPolygon: isCut ? intersection : null,
          bounds, originalArea: fullArea, actualArea: interArea,
          patternType: 'straight-lay'
        });

        totalSlabArea += fullArea;
        placedArea += interArea;
      }
    }

    const wasteArea = totalSlabArea - placedArea;

    return {
      placements,
      fullSlabCount: placements.filter(p => !p.isCut).length,
      cutSlabCount: placements.filter(p => p.isCut).length,
      totalSlabArea, placedArea, wasteArea,
      wastePercentage: totalSlabArea > 0 ? (wasteArea / totalSlabArea) * 100 : 0,
      floorArea,
      coveragePercentage: floorArea > 0 ? (placedArea / floorArea) * 100 : 0,
      patternName: 'straight-lay',
      seed: config._seed ?? 0
    };
  }
};
