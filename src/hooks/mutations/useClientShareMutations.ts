/**
 * Client-share publish / revoke mutations.
 *
 * The publish mutation is the orchestrator: it gathers each vessel's linked
 * model, builds the bundle, uploads it and only then points the link at it.
 *
 * CHUNKING: the bundle builder and the screenshot capture both reach the vessel
 * engine and therefore three.js, so both are imported dynamically INSIDE the
 * mutation. A project page that never publishes never loads the 3D engine.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LayerKey } from '../../components/VesselModeler/outliner-tree';
import type { VesselState } from '../../components/VesselModeler/types';
import type { ProjectVessel, InspectionProject } from '../../types/inspection-project';
import { getVesselModelByProjectVessel } from '../../services/vessel-model-service';
import { describeHydrationFailures, hydrateScanGrids } from '../../services/scan-grid-hydration';
import {
  bumpClientShareRevision,
  createClientShare,
  deleteClientShare,
  expiryFromDays,
  mintShareToken,
  nextBundlePath,
  pruneShareRevisions,
  restoreClientShare,
  revokeClientShare,
  uploadShareBundle,
  type ClientShareRecord,
} from '../../services/client-share-service';
import { hashPasscode } from '../../utils/client-share-passcode';

export interface PublishClientShareParams {
  project: InspectionProject;
  /** Vessels the publisher ticked. Those without a linked model are skipped. */
  vessels: ProjectVessel[];
  publishedLayers: LayerKey[];
  /** null = no expiry. */
  expiryDays: number | null;
  /**
   * Plaintext, hashed here and never stored or sent anywhere else.
   * `null` = no passcode / remove it; `undefined` on a RE-publish = leave the
   * existing passcode exactly as it was.
   */
  passcode: string | null | undefined;
  userId: string;
  /**
   * Re-publish target. When present the link is preserved and only repointed;
   * when absent a brand-new share (and token) is minted.
   */
  existingShare?: ClientShareRecord | null;
  onProgress?: (done: number, total: number) => void;
}

export interface PublishClientShareResult {
  share: ClientShareRecord;
  /** Vessels that had no linked model and were therefore not published. */
  skipped: string[];
}

/**
 * Load a project vessel's saved model, or null when it has none.
 *
 * @internal Exported for `__tests__/publish-hydration.test.ts`, which pins the
 * refusal below; nothing outside this module should call it.
 */
export async function loadVesselState(
  vesselId: string,
  vesselName: string
): Promise<VesselState | null> {
  const record = await getVesselModelByProjectVessel(vesselId);
  const config = record?.config as Record<string, unknown> | undefined;
  if (!record || !config?.vessel || !config?.version) return null;

  const { deserializeVesselState } = await import(
    '../../components/VesselModeler/engine/vessel-serialization'
  );
  const { hydrateSavedTextures } = await import(
    '../../components/VesselModeler/engine/texture-hydration'
  );

  // Textures are decoded ONLY to recover each overlay's aspect ratio, which the
  // deserializer cannot know without the image. The THREE objects are discarded;
  // the published bundle carries the same base64 the model already stored.
  const saved = Array.isArray(config.textures) ? config.textures : [];
  const { configs } = await hydrateSavedTextures(saved, null);

  const deserialized = deserializeVesselState(config, { path: 'cloud', textures: configs });

  // A cloud save strips composite grids (they live in `scan_composites`), but a
  // bundle is the client's ONLY copy — an unhydrated publish ships stats with no
  // heatmap and no hover thickness. Refuse rather than ship that: a publisher
  // who is told nothing assumes the report is complete.
  const { state, failures } = await hydrateScanGrids(deserialized);
  if (failures.length > 0) {
    throw new Error(
      `Could not load scan data for ${vesselName} (${describeHydrationFailures(failures)}) — ` +
        'the share was not published. Check your connection and try again.'
    );
  }

  return state;
}

export function usePublishClientShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PublishClientShareParams): Promise<PublishClientShareResult> => {
      const [{ buildShareBundle }, { createScreenshotSession }] = await Promise.all([
        import('../../components/clientShare/bundle-builder'),
        import('../../components/clientShare/vessel-screenshot'),
      ]);

      const sources: {
        id: string;
        name: string;
        tag?: string;
        type?: string;
        vesselState: VesselState;
        screenshot?: Blob;
      }[] = [];
      const skipped: string[] = [];

      // The ONE published set. Both the bundle and the card images are built
      // from it, so a screenshot can never show a category the model omits.
      const published = new Set(params.publishedLayers);

      // Card images are decoration: a share must not fail, or even stall, over
      // a thumbnail. A session that cannot open (no WebGL) simply yields none,
      // and the client page falls back to its typographic cards.
      const screenshots = createScreenshotSession();
      // Warned once per publish, not once per vessel: a browser that cannot
      // render one card cannot render twenty, and the console is not a log.
      const warned = new Set<string>();
      const warnOnce = (message: string) => {
        if (warned.has(message)) return;
        warned.add(message);
        console.warn(message);
      };
      if (!screenshots) {
        warnOnce('Client share: no WebGL context — publishing without vessel card images.');
      }

      try {
        for (const vessel of params.vessels) {
          const vesselState = await loadVesselState(vessel.id, vessel.vessel_name);
          if (!vesselState) {
            skipped.push(vessel.vessel_name);
            continue;
          }

          let screenshot: Blob | undefined;
          try {
            screenshot = (await screenshots?.capture(vesselState, published)) ?? undefined;
          } catch {
            screenshot = undefined;
          }
          if (screenshots && !screenshot) {
            warnOnce(
              'Client share: a vessel screenshot could not be captured — that card falls back to its typographic tile.'
            );
          }

          sources.push({
            id: vessel.id,
            name: vessel.vessel_name,
            tag: vessel.vessel_tag ?? undefined,
            type: vessel.vessel_type ?? undefined,
            vesselState,
            screenshot,
          });
        }
      } finally {
        screenshots?.dispose();
      }

      if (sources.length === 0) {
        throw new Error('None of the selected vessels has a linked 3D model to publish.');
      }

      // Mint the row first on a FIRST publish (the storage policy keys on the
      // share id); on a re-publish the existing row stays pointed at the live
      // revision until the new one is fully uploaded.
      // undefined ⇒ untouched; null ⇒ cleared; string ⇒ set.
      const passcodeHash =
        params.passcode === undefined
          ? undefined
          : params.passcode
            ? await hashPasscode(params.passcode)
            : null;
      let share = params.existingShare ?? null;
      let targetPath: string;
      let revision: number;

      if (share) {
        revision = share.revision + 1;
        targetPath = nextBundlePath(share);
      } else {
        share = await createClientShare({
          projectId: params.project.id,
          userId: params.userId,
          token: mintShareToken(),
          expiresAt: expiryFromDays(params.expiryDays),
          passcodeHash: passcodeHash ?? null,
        });
        revision = share.revision;
        targetPath = share.bundle_path;
      }

      const bundle = buildShareBundle({
        project: {
          name: params.project.name,
          number: params.project.report_number ?? undefined,
          client: params.project.client_name ?? undefined,
          location: params.project.site_name ?? params.project.location_description ?? undefined,
        },
        vessels: sources,
        published,
        revision,
        publishedAt: new Date().toISOString(),
      });

      await uploadShareBundle(targetPath, bundle.files, params.onProgress);

      // The one moment the live link changes what it serves.
      if (params.existingShare) {
        share = await bumpClientShareRevision(
          params.existingShare.id,
          params.existingShare.revision,
          { expiresAt: expiryFromDays(params.expiryDays), passcodeHash }
        );

        // Housekeeping, strictly after the flip and strictly best-effort: the
        // publish has already succeeded and the client's link is already live
        // and correct, so a failure to sweep up superseded bundles must not
        // fail this mutation, delay its result, or reach the publisher's screen.
        // Whatever is left behind is recomputed and retried by the next
        // re-publish. A first publish has nothing to prune.
        try {
          await pruneShareRevisions(share);
        } catch {
          console.warn(
            'Client share: superseded revisions could not be removed — the link published successfully; they will be swept up on the next re-publish.'
          );
        }
      }

      return { share: share!, skipped };
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: ['clientShares', params.project.id] });
    },
  });
}

export function useRevokeClientShare(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => revokeClientShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientShares', projectId] });
    },
  });
}

export function useRestoreClientShare(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => restoreClientShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientShares', projectId] });
    },
  });
}

/**
 * Permanent deletion — the irreversible sibling of revoke. The service removes
 * the published files before the row (see its comment: the storage policy is
 * authorised by the row, so the reverse order strands the objects); the view
 * history goes with the row by cascade. Errors surface to the dialog; nothing is
 * best-effort here, because a publisher who asked for this expects it done.
 */
export function useDeleteClientShare(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => deleteClientShare({ id: shareId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientShares', projectId] });
    },
  });
}
