# Alps border replacement, 2026-09-17

## Fix

The previous implementation clipped elevated globe segments exactly at the DEM
boundary. Their surviving high-altitude pieces did not join the draped line.
This revision replaces entire affected segments, including selected/hovered
FR/CH/IT outlines. Only unaffected original segments remain in the global layer.
Leaving terrain mode restores the original geometry by reference and hides
every local line. The globe border radius is unchanged; material visibility is
temporarily suppressed only in close terrain views and restored on exit.

Inside the DEM footprint every sample uses the displayed LOD's DEM-derived
height, including LOD morphing, plus a 30 m radial clearance. Coordinates use
the existing spherical point factory/geography convention and Earth radius.
The geographic sample spacing is at most approximately 50 m.

Outside the footprint a smoothstep transition joins the existing globe line.
Its 20 km value is a HORIZONTAL transition width, not a height offset. No
kilometer-scale extra offset is applied inside the DEM. Endpoints outside the
transition match the original rendered chord, including each layer's scale.

At close range the remaining high-altitude global layers are suppressed too,
including hovered-country outlines. Local line alpha fades over 500 m outside
the DEM, so remote floating globe contours do not appear behind the mountain.
At wider range the complete smooth bridge and unchanged outside globe segments
return. This is visibility handling, not disabling depth testing.

Materials explicitly use depthTest=true, depthWrite=false, renderOrder=2 and
polygonOffset=false. Lines remain occluded by terrain. Updated source geometry
is re-registered; parent visibility and highlighted line colors are respected.

## Verification

- 134 visualizer tests passed (16 files); TypeScript and changed-file ESLint passed.
- Real FR and IT boundary data: 2,396 checked positions per country within the
  footprint, including quarter/mid-segment samples. Vertex clearance is 30 m;
  smallest checked interpolated clearance is 17.118 m. No checked line sample
  intersects the native DEM. Maximum sample spacing is 49.992 m.
- Tests check complete original-segment removal, no retained global segment
  crossing the DEM, continuity at the boundary, exact external endpoint joins,
  per-vertex heights, depth settings, visibility and globe restoration.
- Local browser FR -> IT -> CH selection: originalsHidden=true for all three;
  two visible local layers (base borders plus selected-country overlay).
- Close oblique Mont Blanc views with FR and IT selected: L2 terrain, roughly
  60 FPS, no tile or console errors. Border follows the snow slope and is
  occluded by the ridge. Screenshots:
  `/Users/dmitrijfomin/Desktop/CodexWorkspace/alps-border-review/fr-it-close-oblique.png`
  `/Users/dmitrijfomin/Desktop/CodexWorkspace/alps-border-review/it-fr-close-oblique.png`
- Back to globe: border active=false, visibleLocalLayers=0, originalsHidden=false;
  original near/far 0.1/100 restored. No console errors.

## Coverage limitation (not a passed test)

The current terrain footprint is lon 6.7..6.98, lat 45.75..45.95.
FR-IT crosses it. The nearest FR-CH shared segment is
(7.021,45.926)..(7.004,45.959); IT-CH is
(7.056,45.904)..(7.021,45.926). Neither Swiss pair enters this DEM footprint.
Their globe/transition behavior and country switching were checked, but close
DEM-draped screenshots of those two actual shared borders cannot be verified
with this terrain. Do not treat the FR-IT screenshots as Swiss-border evidence.
The only local source TIFF found is N45_E006; no N45_E007 neighbor was found in
Downloads or Earth_Blender/dem. No additional region or external data was added.

## Files

- lib/visualizer/alps-borders.ts
- lib/visualizer/terrain-controller.ts (border audit only)
- lib/visualizer/alps-borders.test.ts
- lib/visualizer/alps-spherical.test.ts (updated offset expectation)

R2/D1 = UNTOUCHED. No upload, publish or production operation was performed.
