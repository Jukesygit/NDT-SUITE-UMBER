/**
 * ClientSharePage — the loginless `/share/:token` page.
 *
 * CHUNK RULE (design #13, and the reason this page is its own route): nothing
 * reachable from here may import `VesselModeler.tsx`, the auth context or
 * supabase-js. Data comes from `services/client-share-client.ts`, which is plain
 * `fetch`; 3D comes from `ReadOnlyViewport`, whose graph was verified clean when
 * it was built. If you add an import to this subtree, re-check the module graph.
 *
 * ONE dead-link state. Nonexistent, revoked and expired tokens are
 * indistinguishable by design — the edge function answers all three identically
 * and this page renders one message for all of them. Do not add a friendlier
 * variant for any of them; the uniformity is the security property.
 *
 * A network failure is NOT a dead link and says so separately, because telling
 * someone their report was withdrawn when their train went into a tunnel is a
 * different kind of wrong.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type * as THREE from 'three';
import {
  ShareFetchError,
  fetchShareBlobUrl,
  fetchShareJson,
  fetchShareManifest,
  type ShareFetchFailure,
} from '../../services/client-share-client';
import type { VesselState } from '../../components/VesselModeler/types';
// Imported STATICALLY, not behind `import()`. The page already pulls three.js
// through ReadOnlyViewport, so deferring these buys nothing — and a dynamic
// import here made Vite hang its preload helper off the supabase vendor chunk,
// which quietly dragged supabase-js into a logged-out client page. Keep them
// static; re-check the chunk graph if that ever changes.
import { deserializeVesselState } from '../../components/VesselModeler/engine/vessel-serialization';
import { hydrateSavedTextures } from '../../components/VesselModeler/engine/texture-hydration';
import {
  SHARE_BUNDLE_FORMAT,
  type ShareManifest,
  type ShareManifestVessel,
} from '../../components/clientShare/bundle-types';
import { SharePasscodeGate } from '../../components/clientShare/SharePasscodeGate';
import { ShareVesselCards } from '../../components/clientShare/ShareVesselCards';
import { ShareVesselViewer } from '../../components/clientShare/ShareVesselViewer';
import './client-share.css';

type PageState =
  | { kind: 'loading' }
  | { kind: 'gate'; invalid: boolean; rateLimitedFor: number | null; submitting: boolean }
  | { kind: 'ready'; manifest: ShareManifest }
  | { kind: 'unavailable' }
  | { kind: 'network' }
  | { kind: 'unsupported' };

const NO_TEXTURES: Record<number, THREE.Texture> = {};

function failureToState(failure: ShareFetchFailure, submittedPasscode: boolean): PageState {
  switch (failure.kind) {
    case 'passcode_required':
      return { kind: 'gate', invalid: false, rateLimitedFor: null, submitting: false };
    case 'passcode_invalid':
      return { kind: 'gate', invalid: true, rateLimitedFor: null, submitting: false };
    case 'rate_limited':
      return {
        kind: 'gate',
        invalid: submittedPasscode,
        rateLimitedFor: failure.retryAfterSeconds,
        submitting: false,
      };
    case 'network':
      return { kind: 'network' };
    default:
      return { kind: 'unavailable' };
  }
}

export default function ClientSharePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [passcode, setPasscode] = useState<string | null>(null);

  // Opened vessel: null on the landing page.
  const [openVessel, setOpenVessel] = useState<ShareManifestVessel | null>(null);
  const [vesselState, setVesselState] = useState<VesselState | null>(null);
  const [textureObjects, setTextureObjects] = useState<Record<number, THREE.Texture>>(NO_TEXTURES);
  const [vesselError, setVesselError] = useState(false);

  // Card images, vesselId → object URL. Filled in AFTER the manifest renders.
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});

  const load = useCallback(
    async (candidate: string | null) => {
      setState((prev) =>
        prev.kind === 'gate' ? { ...prev, submitting: true } : { kind: 'loading' }
      );
      try {
        const manifest = (await fetchShareManifest(token, candidate)) as ShareManifest;
        if (manifest.formatVersion !== SHARE_BUNDLE_FORMAT) {
          setState({ kind: 'unsupported' });
          return;
        }
        setPasscode(candidate);
        setState({ kind: 'ready', manifest });
      } catch (error) {
        setState(
          error instanceof ShareFetchError
            ? failureToState(error.failure, candidate !== null)
            : { kind: 'unavailable' }
        );
      }
    },
    [token]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  // Open a vessel: fetch its model, then decode any overlay textures it carries.
  useEffect(() => {
    if (!openVessel) return;
    let cancelled = false;
    setVesselState(null);
    setTextureObjects(NO_TEXTURES);
    setVesselError(false);

    (async () => {
      try {
        const config = (await fetchShareJson(token, passcode, openVessel.modelPath)) as Record<
          string,
          unknown
        >;
        const saved = Array.isArray(config.textures) ? config.textures : [];
        const { configs, objects } = await hydrateSavedTextures(saved, null);
        if (cancelled) return;
        setVesselState(deserializeVesselState(config, { path: 'cloud', textures: configs }));
        setTextureObjects(objects);
      } catch {
        if (!cancelled) setVesselError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openVessel, token, passcode]);

  // Card screenshots. Deliberately AFTER the cards have rendered and one at a
  // time: the landing page must paint from the manifest alone, and each image
  // is a separate round trip through the share function, so they arrive as they
  // arrive rather than as a burst. A failure is silent — that card keeps its
  // typographic tile, which is also what a pre-screenshot bundle shows.
  const readyManifest = state.kind === 'ready' ? state.manifest : null;
  useEffect(() => {
    const pending = (readyManifest?.vessels ?? []).flatMap((vessel) =>
      vessel.screenshotPath ? [{ id: vessel.id, path: vessel.screenshotPath }] : []
    );
    if (pending.length === 0) return;

    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      for (const vessel of pending) {
        try {
          const url = await fetchShareBlobUrl(token, passcode, vessel.path);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          created.push(url);
          setScreenshots((prev) => ({ ...prev, [vessel.id]: url }));
        } catch {
          // Cosmetic. The client is never told a thumbnail was missing.
        }
      }
    })();

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
      setScreenshots({});
    };
  }, [readyManifest, token, passcode]);

  if (state.kind === 'loading') {
    return <div className="cs-page cs-centered">Loading…</div>;
  }

  if (state.kind === 'gate') {
    return (
      <div className="cs-page">
        <SharePasscodeGate
          invalid={state.invalid}
          rateLimitedFor={state.rateLimitedFor}
          submitting={state.submitting}
          onSubmit={(value) => void load(value)}
        />
      </div>
    );
  }

  if (state.kind === 'network') {
    return (
      <div className="cs-page cs-centered">
        <div className="cs-message">
          <h1 className="cs-message-title">We couldn&apos;t reach the report</h1>
          <p className="cs-message-text">
            Check your connection and try again. The link itself is fine.
          </p>
          <button type="button" className="cs-gate-submit" onClick={() => void load(passcode)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'unsupported') {
    return (
      <div className="cs-page cs-centered">
        <div className="cs-message">
          <h1 className="cs-message-title">This report needs a newer viewer</h1>
          <p className="cs-message-text">
            Please refresh the page. If it keeps happening, contact your Matrix representative for
            an up-to-date link.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    // The one message for nonexistent, revoked and expired. See the file note.
    return (
      <div className="cs-page cs-centered">
        <div className="cs-message">
          <h1 className="cs-message-title">This link is no longer active</h1>
          <p className="cs-message-text">
            Please contact your Matrix representative for an up-to-date link.
          </p>
        </div>
      </div>
    );
  }

  const { manifest } = state;
  const published = new Date(manifest.publishedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="cs-page">
      <header className="cs-header">
        <span className="cs-brand">{manifest.preparedBy}</span>
        <span className="cs-header-project">{manifest.project.name}</span>
        <span className="cs-header-rev">
          Rev {manifest.revision} · {published}
        </span>
      </header>

      <main className="cs-main">
        {!openVessel ? (
          <ShareVesselCards
            manifest={manifest}
            screenshots={screenshots}
            onOpen={(vessel) => setOpenVessel(vessel)}
          />
        ) : vesselError ? (
          <div className="cs-message">
            <h1 className="cs-message-title">That vessel could not be loaded</h1>
            <button type="button" className="cs-gate-submit" onClick={() => setOpenVessel(null)}>
              Back to vessels
            </button>
          </div>
        ) : !vesselState ? (
          <div className="cs-centered">Loading vessel…</div>
        ) : (
          <ShareVesselViewer
            vessel={openVessel}
            vesselState={vesselState}
            textureObjects={textureObjects}
            publishedLayers={manifest.publishedLayers}
            onBack={() => setOpenVessel(null)}
          />
        )}
      </main>

      <footer className="cs-footer">
        Prepared by {manifest.preparedBy}
        {manifest.project.client && ` for ${manifest.project.client}`}. Questions? Contact your
        Matrix representative.
      </footer>
    </div>
  );
}
