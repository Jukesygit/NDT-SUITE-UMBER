/**
 * Drawing Extraction — Prompt + Response Schema
 *
 * The Gemini prompt text and the v1beta responseSchema (OpenAPI subset) for the
 * GA-drawing extraction. Every schema leaf is nullable — that is how "couldn't
 * read it" becomes `null` rather than a fabricated value. Kept separate from the
 * parser's network/rendering plumbing so each file stays a single concern.
 */

/** Region labels for the prompt. Images arrive in order [side, end?, table?]. */
function buildRegionDescriptions(hasEnd: boolean, hasTable: boolean): string[] {
  const descs = ['IMAGE 1: Side Elevation View (nozzle positions along vessel length)'];
  let idx = 2;
  if (hasEnd) {
    descs.push(`IMAGE ${idx}: End View / Section A-A (angular nozzle positions)`);
    idx++;
  }
  if (hasTable) {
    descs.push(`IMAGE ${idx}: Nozzle Schedule Table (sizes, projections, ratings)`);
  }
  return descs;
}

export function buildPrompt(hasEnd: boolean, hasTable: boolean): string {
  return `You are analyzing HIGH-RESOLUTION CROPPED SECTIONS of a Pressure Vessel GA Drawing.

**IMAGES PROVIDED:**
${buildRegionDescriptions(hasEnd, hasTable).join('\n')}

**EXTRACTION INSTRUCTIONS:**
- Side Elevation: vessel Internal Diameter (ID, mm) and Tan-Tan length (mm). For each nozzle tag (N1, N2, ...), trace its leader line to its elevation/position and note saddle positions.
- End View / Section A-A: determine each nozzle's angular position (clock position) around the vessel. Report degrees measured clockwise from the top (12 o'clock = 0). Estimating the angle from the nozzle's drawn position on the circle is expected and correct when no numeric label exists. Do not convert into any other angle convention.
- End View / Section A-A — nozzle orientation: nozzles drawn clustered at the 3 o'clock / 9 o'clock positions with EL elevation labels are HORIZONTAL nozzles: report nozzleOrientation='horizontal', angle = the side they face as drawn (90 or 270), and elevation = the signed EL value in mm relative to the vessel centerline (null if the EL reference is not the vessel centerline or is unreadable). All other nozzles: nozzleOrientation='radial'. Classify every nozzle; use null only when genuinely undeterminable. The projection/outstand for horizontal nozzles is the horizontal distance from the vessel centerline plane to the flange face, exactly as tabulated — report it as-is.
- Nozzle Schedule Table: exact sizes (convert NPS/DN to mm ID), projections (centerline to flange face). Match tags exactly (N2 vs N2A differ).
- Nozzle 'name' must always be the nozzle TAG (N1, N2A, M1, K5B, ...) used consistently across all views — never the schedule item/drawing number. Include EVERY nozzle you can identify in any view, even if some of its fields are null.
- Positions are Distance from Left T/L (convert if given from Right T/L).

**NOZZLE MOUNT LOCATION (mount + radialOffset):**
- Decide where each nozzle mounts: 'shell' (on the cylindrical body), 'head-left' (on the left dished end/head), or 'head-right' (on the right dished end/head). Manways and nozzles drawn on a dished end — often shown in the end view rather than the side elevation — are head-left or head-right.
- Shell nozzles: set mount='shell', report 'pos' as the tangent-line distance as above, and leave radialOffset null.
- Head nozzles: set mount to the correct head, and report radialOffset = the distance in mm from the vessel centerline to the nozzle centerline as seen in the end view (0 for a nozzle on the centerline / apex). 'pos' is not required for head nozzles.

**CRITICAL — DO NOT GUESS VALUES, DO NOT OMIT FEATURES:**
- Return a numeric/text value ONLY if you can read or geometrically determine it from the drawing; if a field is illegible or absent, return null for that FIELD. Never fill in a typical value.
- Returning null for a field is always better than omitting the nozzle. Omit nothing: every nozzle tag visible in any view must appear in the nozzles array.
- Output must match the provided JSON schema exactly.`;
}

const NUM = { type: 'NUMBER', nullable: true } as const;

/** Nozzle angle: drawing-native (0 = top, clockwise) — conversion to the engine
 *  convention happens ONLY in code (head-nozzle-placement.ts). Kept as a plain
 *  nullable number: the convention is taught in the prompt text, matching the
 *  proven-good schema shape (a verbose per-leaf description here coincided with
 *  the model returning empty nozzle arrays — do not re-add one). */
const ANGLE = NUM;

/** Gemini v1beta responseSchema (OpenAPI subset). Every leaf is nullable. */
export const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: NUM,
    length: NUM,
    headRatio: NUM,
    orientation: { type: 'STRING', nullable: true, enum: ['horizontal', 'vertical'] },
    nozzles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', nullable: true },
          pos: NUM,
          proj: NUM,
          angle: ANGLE,
          size: NUM,
          mount: {
            type: 'STRING',
            nullable: true,
            enum: ['shell', 'head-left', 'head-right'],
          },
          radialOffset: NUM,
          nozzleOrientation: {
            type: 'STRING',
            nullable: true,
            enum: ['radial', 'horizontal'],
          },
          elevation: NUM,
        },
      },
    },
    saddles: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { pos: NUM } },
    },
  },
} as const;
