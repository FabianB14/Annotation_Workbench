import { useState } from 'react';
import type { AnnotationSegment } from '../types';
import type { TimeFormat } from '../utils';
import { formatTime, safeParseObject } from '../utils';
import {
  PlayIcon,
  ClockIcon,
  SplitIcon,
  MergeIcon,
  TrashIcon,
  RegenIcon,
} from './Icons';

interface Props {
  segment: AnnotationSegment;
  isLast: boolean;
  columns: Array<{ id: string; name: string }>;
  isActive: boolean;
  currentPlaybackTimeMs: number;
  timeFormat: TimeFormat;
  onSeek: (ms: number) => void;
  onUpdateText: (segId: string, colId: string, text: string) => void;
  onUpdateTimes: (segId: string, startMs: number, endMs: number) => void;
  onSplit: (segId: string, splitMs: number) => void;
  onMerge: (segId: string) => void;
  onDelete: (segId: string) => void;
  onRegen: (segId: string, colId: string, colName: string) => void;
}

export default function SegmentRow({
  segment,
  isLast,
  columns,
  isActive,
  currentPlaybackTimeMs,
  timeFormat,
  onSeek,
  onUpdateText,
  onUpdateTimes,
  onSplit,
  onMerge,
  onDelete,
  onRegen,
}: Props) {
  const captions = safeParseObject(segment.captionsJson);
  const violations = segment.violationsJson ? safeParseObject(segment.violationsJson) : null;
  const [showTimeEdit, setShowTimeEdit] = useState(false);

  const canSplit =
    currentPlaybackTimeMs > segment.startTimeMs && currentPlaybackTimeMs < segment.endTimeMs;

  return (
    <div className={`segment ${isActive ? 'active' : ''}`}>
      <div className="segment-head">
        <div
          className={`timestamp ${isActive ? 'active' : ''}`}
          onClick={() => onSeek(segment.startTimeMs)}
          style={{ cursor: 'pointer' }}
          title="Jump playhead to segment start"
        >
          <PlayIcon size={13} />
          <span className="mono">
            {formatTime(segment.startTimeMs, timeFormat)} -{' '}
            {formatTime(segment.endTimeMs, timeFormat)}
          </span>
        </div>

        <div className="seg-actions">
          <button className="icon-btn small" title="Edit times" onClick={() => setShowTimeEdit(true)}>
            <ClockIcon size={16} />
          </button>
          <button
            className="icon-btn small"
            title="Split at playhead"
            disabled={!canSplit}
            onClick={() => onSplit(segment.id, currentPlaybackTimeMs)}
            style={{ color: canSplit ? 'var(--primary)' : undefined }}
          >
            <SplitIcon size={16} />
          </button>
          {!isLast && (
            <button
              className="icon-btn small"
              title="Merge with next"
              onClick={() => onMerge(segment.id)}
            >
              <MergeIcon size={16} />
            </button>
          )}
          <button
            className="icon-btn small"
            title="Delete row"
            style={{ color: 'var(--red)' }}
            onClick={() => onDelete(segment.id)}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      {columns.map(({ id, name }) => {
        const warning = violations ? String(violations[id] ?? '') : '';
        return (
          <div className="lane" key={id}>
            <div className="lane-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="lane-name">{name.toUpperCase()}</span>
                {warning && <span className="warn-badge">{warning}</span>}
              </div>
              <button
                className="icon-btn small"
                title="Regenerate cell with Gemini"
                onClick={() => onRegen(segment.id, id, name)}
              >
                <RegenIcon size={14} className="primary-text" />
              </button>
            </div>
            <textarea
              className={`textarea mono ${warning ? 'warn' : ''}`}
              style={{ minHeight: 52 }}
              value={String(captions[id] ?? '')}
              onChange={(e) => onUpdateText(segment.id, id, e.target.value)}
            />
          </div>
        );
      })}

      {showTimeEdit && (
        <TimeEditDialog
          startMs={segment.startTimeMs}
          endMs={segment.endTimeMs}
          onCancel={() => setShowTimeEdit(false)}
          onSave={(s, e) => {
            onUpdateTimes(segment.id, s, e);
            setShowTimeEdit(false);
          }}
        />
      )}
    </div>
  );
}

function TimeEditDialog({
  startMs,
  endMs,
  onCancel,
  onSave,
}: {
  startMs: number;
  endMs: number;
  onCancel: () => void;
  onSave: (startMs: number, endMs: number) => void;
}) {
  const [start, setStart] = useState((startMs / 1000).toString());
  const [end, setEnd] = useState((endMs / 1000).toString());

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="h1 primary-text" style={{ fontSize: 15 }}>
          Edit Segment Range
        </h2>
        <p className="muted">Set start and end bounds in decimal seconds.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">Start (s)</label>
            <input
              className="text-input mono"
              type="number"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">End (s)</label>
            <input
              className="text-input mono"
              type="number"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          <button className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const s = parseFloat(start);
              const e = parseFloat(end);
              if (!isNaN(s) && !isNaN(e) && s < e) onSave(Math.round(s * 1000), Math.round(e * 1000));
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
