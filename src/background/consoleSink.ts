import type { SessionSink } from './tracker';

/** Phase-1 sink: logs segments instead of persisting them. */
export const consoleSink: SessionSink = {
  async writeSegment(seg) {
    const rowId = seg.rowId ?? seg.rowStartTs;
    console.info(
      `[sundial] flush ${seg.session.key} ${seg.date} +${((seg.toTs - seg.fromTs) / 1000).toFixed(1)}s` +
        ` (row ${rowId}, ${((seg.toTs - seg.rowStartTs) / 1000).toFixed(1)}s total)`,
    );
    return rowId;
  },
};
