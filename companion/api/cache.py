"""
Thread-safe immutable file cache for the NDT companion app.

Design: Every mutation creates a new frozen CacheSnapshot and atomically swaps
the pointer.  Readers call get_snapshot() to grab the current snapshot -- this is
a single pointer read which is atomic under CPython GIL.  All write methods
serialize through a threading.Lock so concurrent mutations are safe.

GIL assumption: A single-attribute read (self._snapshot) is a single bytecode
instruction (LOAD_ATTR) and therefore atomic under CPython.  This is the
documented CPython behavior -- the GIL guarantees that simple loads and stores
of object references are thread-safe.  We rely on this for lock-free reads.
If the implementation moves to a non-GIL runtime (e.g., free-threaded 3.13+),
the _snapshot attribute should be replaced with an atomic reference or wrapped
in a read lock.
"""

import logging
import threading
from dataclasses import dataclass, replace
from typing import Callable, Optional

from engine.models import CompositeResult, FileIndex

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CacheSnapshot:
    """Immutable point-in-time view of the companion indexed state.

    Every field is either a primitive, a tuple (immutable sequence), or None.
    The frozen dataclass guarantees no field can be mutated after creation.
    """

    version: int
    directory: str = ""
    files: tuple[FileIndex, ...] = ()
    calibration_directory: str = ""
    calibration_files: tuple[FileIndex, ...] = ()
    composite_progress: Optional[dict] = None
    composite: Optional[CompositeResult] = None
    port: int = 0


class StaleCompositeResult:
    """Returned by set_composite when the expected_version does not match.

    Callers should check isinstance(result, StaleCompositeResult) and
    handle the version mismatch (e.g., log a warning or notify the client).
    """

    def __init__(self, expected: int, actual: int):
        self.expected_version = expected
        self.actual_version = actual

    def __repr__(self) -> str:
        return (
            f"StaleCompositeResult(expected={self.expected_version}, "
            f"actual={self.actual_version})"
        )


class FileCache:
    """Thread-safe file cache using immutable snapshots.

    Write methods acquire the lock, create a new CacheSnapshot via
    dataclasses.replace(), and swap the pointer.  Read methods return the
    current snapshot without locking.

    The version counter is monotonically increasing -- every mutation bumps it
    by 1.  Readers can compare versions to detect changes.
    """

    def __init__(self, port: int = 0) -> None:
        self._lock = threading.Lock()
        self._snapshot = CacheSnapshot(version=0, port=port)

    def get_snapshot(self) -> CacheSnapshot:
        """Return the current snapshot.  Lock-free -- relies on GIL atomic
        pointer read (see module docstring).
        """
        return self._snapshot

    # -- Directory mutations --------------------------------------------------

    def set_directory(
        self, directory: str, files: list[FileIndex]
    ) -> CacheSnapshot:
        """Set the scan directory and its indexed files.

        Returns the new snapshot after the mutation.
        """
        with self._lock:
            snap = replace(
                self._snapshot,
                version=self._snapshot.version + 1,
                directory=directory,
                files=tuple(files),
                # Clear composite when directory changes -- it is stale
                composite=None,
                composite_progress=None,
            )
            self._snapshot = snap
            logger.info(
                "Cache v%d: set directory %s (%d files)",
                snap.version,
                directory,
                len(files),
            )
            return snap

    def set_calibration(
        self, directory: str, files: list[FileIndex]
    ) -> CacheSnapshot:
        """Set the calibration directory and its indexed files."""
        with self._lock:
            snap = replace(
                self._snapshot,
                version=self._snapshot.version + 1,
                calibration_directory=directory,
                calibration_files=tuple(files),
            )
            self._snapshot = snap
            logger.info(
                "Cache v%d: set calibration %s (%d files)",
                snap.version,
                directory,
                len(files),
            )
            return snap

    def refresh(
        self, indexer_fn: Callable[[str], list[FileIndex]]
    ) -> CacheSnapshot:
        """Re-index the current directory.

        I/O (indexer_fn) runs outside the lock to avoid blocking readers.
        The lock is only held for the pointer swap.
        """
        # Read directory outside lock -- it is an immutable string on the snapshot
        current = self._snapshot
        directory = current.directory
        if not directory:
            return current

        # Heavy I/O happens here, outside the lock
        files = indexer_fn(directory)

        with self._lock:
            snap = replace(
                self._snapshot,
                version=self._snapshot.version + 1,
                directory=directory,
                files=tuple(files),
            )
            self._snapshot = snap
            logger.info(
                "Cache v%d: refreshed %s (%d files)",
                snap.version,
                directory,
                len(files),
            )
            return snap

    # -- Composite mutations --------------------------------------------------

    def set_composite_progress(self, progress: Optional[dict]) -> None:
        """Update composite generation progress.

        This does NOT bump the version -- progress updates are ephemeral
        and should not trigger cache-change detection.
        """
        with self._lock:
            self._snapshot = replace(self._snapshot, composite_progress=progress)

    def set_composite(
        self,
        composite: CompositeResult,
        expected_version: int,
    ) -> "CacheSnapshot | StaleCompositeResult":
        """Store a completed composite result, guarding against stale writes.

        If the cache version has changed since the composite generation started
        (e.g., the directory was changed or refreshed), the composite is stale
        and must not overwrite the cache.  Returns StaleCompositeResult in that
        case so the caller can handle it explicitly.
        """
        with self._lock:
            actual = self._snapshot.version
            if actual != expected_version:
                logger.warning(
                    "Stale composite: expected v%d but cache is v%d -- discarding",
                    expected_version,
                    actual,
                )
                return StaleCompositeResult(
                    expected=expected_version, actual=actual
                )

            snap = replace(
                self._snapshot,
                version=self._snapshot.version + 1,
                composite=composite,
                composite_progress=None,
            )
            self._snapshot = snap
            logger.info("Cache v%d: composite stored", snap.version)
            return snap

    # -- Bulk initializer (used at startup) -----------------------------------

    def initialize(
        self,
        directory: str = "",
        files: Optional[list[FileIndex]] = None,
        calibration_directory: str = "",
        calibration_files: Optional[list[FileIndex]] = None,
    ) -> CacheSnapshot:
        """Set initial state at startup.  Bumps version once."""
        with self._lock:
            snap = replace(
                self._snapshot,
                version=self._snapshot.version + 1,
                directory=directory,
                files=tuple(files) if files else (),
                calibration_directory=calibration_directory,
                calibration_files=tuple(calibration_files) if calibration_files else (),
            )
            self._snapshot = snap
            logger.info(
                "Cache v%d: initialized (dir=%s, %d files, cal=%s, %d cal files)",
                snap.version,
                directory or "(none)",
                len(snap.files),
                calibration_directory or "(none)",
                len(snap.calibration_files),
            )
            return snap
