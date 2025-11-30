/**
 * Data Model Type Definitions
 */

export interface Asset {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  vessels: Vessel[];
  metadata?: AssetMetadata;
}

export interface AssetMetadata {
  location?: string;
  type?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  tags?: string[];
  customFields?: Record<string, any>;
}

export interface Vessel {
  id: string;
  assetId: string;
  name: string;
  description?: string;
  model3d?: string | null; // Base64 or URL
  model3dUrl?: string;
  images: VesselImage[];
  scans: Scan[];
  strakes?: Strake[];
  metadata?: VesselMetadata;
  createdAt: Date;
  updatedAt?: Date;
}

export interface VesselMetadata {
  manufacturer?: string;
  model?: string;
  year?: number;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  };
  material?: string;
  customFields?: Record<string, any>;
}

export interface VesselImage {
  id: string;
  vesselId: string;
  name: string;
  dataUrl?: string; // Base64
  url?: string; // Remote URL
  timestamp: Date;
  metadata?: ImageMetadata;
}

export interface ImageMetadata {
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  tags?: string[];
}

export interface Strake {
  id: string;
  vesselId: string;
  name: string;
  totalArea: number;
  requiredCoverage: number;
  scans: Scan[];
  coveragePercentage?: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Scan {
  id: string;
  vesselId: string;
  strakeId?: string | null;
  name: string;
  toolType: ScanToolType;
  timestamp: Date;
  data?: ScanData | null;
  dataUrl?: string; // URL to large data file
  thumbnail?: string; // Base64 image with axes/labels
  heatmapOnly?: string; // Base64 clean heatmap for 3D texturing
  thumbnailUrl?: string;
  heatmapUrl?: string;
  metadata?: ScanMetadata;
}

export enum ScanToolType {
  PEC = 'pec',
  CSCAN = 'cscan',
  TOFD = 'tofd',
  PAUT = 'paut',
  VIEW_3D = '3dview',
}

export interface ScanData {
  type: string;
  version?: string;
  dimensions?: {
    x: number;
    y: number;
    z?: number;
  };
  resolution?: {
    x: number;
    y: number;
    z?: number;
  };
  values: number[][] | number[][][];
  units?: string;
  metadata?: Record<string, any>;
}

export interface ScanMetadata {
  operator?: string;
  equipment?: string;
  calibration?: Record<string, any>;
  environmentalConditions?: {
    temperature?: number;
    humidity?: number;
    pressure?: number;
  };
  qualityMetrics?: {
    snr?: number; // Signal-to-noise ratio
    coverage?: number;
    confidence?: number;
  };
  customFields?: Record<string, any>;
}

export interface SyncStatus {
  inProgress: boolean;
  lastSync: Date | null;
  lastAttempt: Date | null;
  queueSize: number;
  autoSyncEnabled: boolean;
  pendingChanges: boolean;
  consecutiveFailures: number;
  backedOff: boolean;
}

export interface SyncResult {
  success: boolean;
  uploaded?: number;
  downloaded?: number;
  conflicts?: SyncConflict[];
  errors?: string[];
  timestamp?: Date;
}

export interface SyncConflict {
  itemId: string;
  itemType: 'asset' | 'vessel' | 'scan';
  localVersion: Date;
  remoteVersion: Date;
  resolution?: 'local' | 'remote' | 'merged';
}

export interface DataQuery {
  organizationId?: string;
  assetId?: string;
  vesselId?: string;
  toolType?: ScanToolType;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}