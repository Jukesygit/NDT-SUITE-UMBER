/** All linear dimensions are millimetres; angles are degrees unless noted. */

export type WeldType = 'single-v' | 'double-v';
export type JointType = 'butt' | 'tee-fillet';
export type WaveMode = 'shear' | 'longitudinal';
export type BeamMode = 'conventional' | 'sectorial';
export type ProbeSide = 'A' | 'B'; // A = left of weld centreline, B = right

export interface MaterialSpec {
  id: string;
  name: string;
  /** longitudinal velocity, m/s */
  vLong: number;
  /** shear velocity, m/s */
  vShear: number;
}

export interface WedgeSpec {
  id: string;
  name: string;
  /** longitudinal velocity in the wedge, m/s */
  velocity: number;
}

export interface PartConfig {
  /** plate thickness */
  thickness: number;
  /** half-width of drawn plate each side of weld centreline */
  halfWidth: number;
  materialId: string;
}

export interface WeldConfig {
  /** butt weld in a flat plate, or external fillets on a T-joint */
  joint: JointType;
  type: WeldType;
  /** tee-fillet: fillet leg length (both legs equal) */
  filletLeg: number;
  /** tee-fillet: thickness of the upstanding (chord) plate */
  chordThickness: number;
  /** bevel angle from vertical, per side */
  bevelAngle: number;
  /** root opening between plates */
  rootGap: number;
  /** root face (land) height */
  rootFace: number;
  /** extra cap width beyond groove edge, per side */
  capExtra: number;
  /** cap reinforcement height */
  capHeight: number;
  /** heat-affected-zone band width beyond fusion line */
  hazWidth: number;
  showHaz: boolean;
}

export interface ProbeConfig {
  side: ProbeSide;
  /** distance from weld centreline to beam index (exit) point */
  standoff: number;
  /** conventional probe: crystal size along the beam direction */
  elementSize: number;
  /** phased array: element count (active aperture = elements × pitch) */
  elements: number;
  /** phased array: element pitch, mm */
  pitch: number;
  /** nominal frequency, MHz */
  frequency: number;
  wedgeId: string;
  waveMode: WaveMode;
}

export interface BeamConfig {
  mode: BeamMode;
  /** conventional: nominal refracted angle */
  angle: number;
  /** sectorial: sweep start/end/step (refracted angles) */
  sweepStart: number;
  sweepEnd: number;
  sweepStep: number;
  /** number of half-skip legs to trace (1 = to backwall) */
  legs: number;
  showSpread: boolean;
  /** beam-spread envelope dB drop: 6, 12, or 20 */
  spreadDb: number;
  showSkipMarkers: boolean;
}

export interface AppState {
  part: PartConfig;
  weld: WeldConfig;
  probe: ProbeConfig;
  beam: BeamConfig;
}

/** One traced ray: a polyline of points, one per leg boundary. */
export interface TracedRay {
  /** nominal refracted angle for this ray */
  angle: number;
  /** polyline in part coordinates (x right, y down from scan surface) */
  points: { x: number; y: number }[];
}

export interface RayFanResult {
  center: TracedRay[];
  /** beam-spread edge rays (lower/upper), only for conventional mode */
  spreadLower?: TracedRay;
  spreadUpper?: TracedRay;
  /** incident wedge angle computed via Snell for the nominal angle */
  incidentAngle: number;
  /** effective half-angle of the drawn beam spread (deg, -6 dB) */
  spreadHalfAngle: number;
  /** physics caveat for the current configuration, or null if clean */
  beamWarning: string | null;
}
