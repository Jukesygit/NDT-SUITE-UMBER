// =============================================================================
// Vessel Modeler - Inspection Image Labels (CSS2DObject thumbnails)
// =============================================================================
// Creates HTML thumbnail elements positioned at the end of each inspection
// image's leader line using CSS2DRenderer. Thumbnails are clickable to open
// the full image viewer and draggable to reposition.
// =============================================================================

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { InspectionImageConfig, VesselState } from '../types';
import { getLeaderEndPosition } from './inspection-image-geometry';
import type { LabelDragContext } from './annotation-labels';
import { attachFreeFormDrag } from './annotation-labels';

/** Thumbnail size in pixels */
const THUMBNAIL_SIZE = 64;

export interface InspectionImageClickHandler {
  onThumbnailClick: (imageId: number) => void;
}

/**
 * Create a CSS2DObject thumbnail label for a single inspection image.
 * Positioned at the outer end of the leader line. Draggable for repositioning.
 */
export function createInspectionImageLabel(
  config: InspectionImageConfig,
  vesselState: VesselState,
  isSelected: boolean,
  clickHandler?: InspectionImageClickHandler,
  dragContext?: LabelDragContext,
): CSS2DObject {
  const el = document.createElement('div');
  el.className = 'vm-inspection-thumbnail';
  if (isSelected) el.classList.add('selected');
  el.style.cssText = `
    width: ${THUMBNAIL_SIZE}px;
    height: ${THUMBNAIL_SIZE}px;
    border-radius: 4px;
    border: 2px solid ${isSelected ? '#00ccff' : 'rgba(255,255,255,0.6)'};
    overflow: hidden;
    cursor: ${config.locked ? 'default' : 'grab'};
    background: #222;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    pointer-events: auto;
    transition: border-color 0.15s;
  `;

  const img = document.createElement('img');
  img.src = config.imageData;
  img.alt = config.name;
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  `;
  el.appendChild(img);

  // Name tag below thumbnail
  const nameTag = document.createElement('div');
  nameTag.textContent = config.name;
  nameTag.style.cssText = `
    position: absolute;
    bottom: -18px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: rgba(255,255,255,0.8);
    background: rgba(0,0,0,0.6);
    padding: 1px 4px;
    border-radius: 2px;
    white-space: nowrap;
    pointer-events: none;
  `;
  el.appendChild(nameTag);

  // Drag support for free-form repositioning (takes priority over click)
  let didDrag = false;
  if (dragContext) {
    // Wrap the drag to track whether we actually dragged vs just clicked
    let startX = 0;
    let startY = 0;
    const origPointerDown = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      didDrag = false;
    };
    const origPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didDrag = true;
      }
    };
    el.addEventListener('pointerdown', origPointerDown, { capture: true });
    el.addEventListener('pointermove', origPointerMove, { capture: true });

    attachFreeFormDrag(el, config.id, 'inspectionImage', dragContext);
  }

  // Click handler to open full image viewer (only if not dragging)
  if (clickHandler) {
    el.addEventListener('click', (e) => {
      if (didDrag) { didDrag = false; return; }
      e.stopPropagation();
      clickHandler.onThumbnailClick(config.id);
    });
  }

  // Hover effect
  el.addEventListener('mouseenter', () => {
    if (el.style.cursor !== 'grabbing') {
      el.style.borderColor = '#00ccff';
      el.style.transform = 'scale(1.1)';
    }
  });
  el.addEventListener('mouseleave', () => {
    el.style.borderColor = isSelected ? '#00ccff' : 'rgba(255,255,255,0.6)';
    el.style.transform = 'scale(1)';
  });

  const label = new CSS2DObject(el);
  const position = getLeaderEndPosition(config, vesselState);
  label.position.copy(position);
  label.userData = { type: 'inspection-image-label', inspectionImageId: config.id };

  return label;
}

/**
 * Create all inspection image thumbnail labels.
 */
export function createAllInspectionImageLabels(
  vesselState: VesselState,
  selectedImageId: number,
  clickHandler?: InspectionImageClickHandler,
  dragContext?: LabelDragContext,
): CSS2DObject[] {
  return vesselState.inspectionImages
    .filter((img) => img.visible !== false)
    .map((img) =>
      createInspectionImageLabel(img, vesselState, img.id === selectedImageId, clickHandler, dragContext),
    );
}
