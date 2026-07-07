import { useEffect, useMemo, useRef, useState } from 'react';
import type { Store } from '../store';
import type { TrackId } from '../types';
import VideoPlayer from './VideoPlayer';
import SegmentRow from './SegmentRow';
import { Spinner } from './Shared';
import { getTracks, getTrackList } from '../services/spec';
import { formatTime, formatTimeMs, safeParseObject, copyToClipboard, downloadText } from '../utils';
import {
  PlayCircleIcon,
  PauseCircleIcon,
  Rewind5Icon,
  Forward5Icon,
  CheckSquareIcon,
  ClearIcon,
  PlusIcon,
  ExportIcon,
  CopyIcon,
  CodeIcon,
  GridIcon,
  SubtitlesOffIcon,
  ClockIcon,
} from './Icons';

const SPEEDS = [0.25, 0.5, 0.75, 1.0];

export default function Step3ReviewWorkspace({ store }: { store: Store }) {
  const { currentProject, segments, isLinting, timeFormat } = store;

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [seekToMs, setSeekToMs] = useState<number | null>(null);
  const [speedMenu, setSpeedMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [isWide, setIsWide] = useState(() => window.innerWidth > 720);
  const [activeTab, setActiveTab] = useState<TrackId>('speech');

  const [regenCell, setRegenCell] = useState<{ segId: string; colId: string; colName: string } | null>(
    null
  );
  const [regenInstruction, setRegenInstruction] = useState('');

  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth > 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const specJson = currentProject?.confirmedSpecJson ?? '{}';
  const tracks = useMemo(() => getTracks(specJson), [specJson]);
  const trackList = useMemo(() => getTrackList(specJson), [specJson]);

  // Annotations for the active track, ordered by start time.
  const trackSegments = useMemo(
    () =>
      segments
        .filter((s) => s.track === activeTab)
        .sort((a, b) => a.startTimeMs - b.startTimeMs),
    [segments, activeTab]
  );

  const columns = useMemo(
    () => tracks[activeTab].captions.map((c) => ({ id: c.id, name: c.name })),
    [tracks, activeTab]
  );

  const activeId = useMemo(() => {
    const seg = trackSegments.find(
      (s) => currentTimeMs >= s.startTimeMs && currentTimeMs <= s.endTimeMs
    );
    return seg?.id ?? null;
  }, [trackSegments, currentTimeMs]);

  // Auto-scroll the active row (of the current tab) into view during playback.
  useEffect(() => {
    if (activeId && isPlaying) {
      rowRefs.current[activeId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeId, isPlaying]);

  if (!currentProject) return null;

  const seek = (ms: number) => {
    const clamped = Math.max(0, durationMs > 0 ? Math.min(ms, durationMs) : ms);
    setCurrentTimeMs(clamped);
    setSeekToMs(clamped);
  };

  const countFor = (id: TrackId) => segments.filter((s) => s.track === id).length;

  // ---- exports (both tracks) ----
  const exportCopyText = () => {
    let out = '=== ANNOTATION WORKBENCH EXPORT ===\n';
    out += `Project: ${currentProject.name}\n\n`;
    for (const track of trackList) {
      out += `## ${track.name} track\n`;
      const rows = segments.filter((s) => s.track === track.id).sort((a, b) => a.startTimeMs - b.startTimeMs);
      for (const seg of rows) {
        out += `[${formatTimeMs(seg.startTimeMs)} - ${formatTimeMs(seg.endTimeMs)}]\n`;
        const caps = safeParseObject(seg.captionsJson);
        for (const cap of track.captions) out += `- ${cap.name}: ${caps[cap.id] ?? ''}\n`;
        out += '\n';
      }
    }
    void copyToClipboard(out);
    setExportMenu(false);
  };

  const exportJson = () => {
    const root: any = {
      project: currentProject.name,
      tracks: {},
      annotations: {},
    };
    for (const track of trackList) {
      root.tracks[track.id] = { name: track.name, captions: track.captions };
      root.annotations[track.id] = segments
        .filter((s) => s.track === track.id)
        .sort((a, b) => a.startTimeMs - b.startTimeMs)
        .map((seg) => {
          const caps = safeParseObject(seg.captionsJson);
          return {
            startTime: seg.startTimeMs / 1000,
            endTime: seg.endTimeMs / 1000,
            [track.captions[0].id]: caps[track.captions[0].id] ?? '',
            [track.captions[1].id]: caps[track.captions[1].id] ?? '',
          };
        });
    }
    downloadText(`${currentProject.name} - Export.json`, JSON.stringify(root, null, 2), 'application/json');
    setExportMenu(false);
  };

  const exportCsv = () => {
    const headers = ['Track', 'Start Time', 'End Time', 'Caption 1', 'Caption 2'];
    let csv = headers.map((h) => `"${h}"`).join(',') + '\n';
    for (const track of trackList) {
      const rows = segments.filter((s) => s.track === track.id).sort((a, b) => a.startTimeMs - b.startTimeMs);
      for (const seg of rows) {
        const caps = safeParseObject(seg.captionsJson);
        const row = [
          track.name,
          String(seg.startTimeMs / 1000),
          String(seg.endTimeMs / 1000),
          String(caps[track.captions[0].id] ?? ''),
          String(caps[track.captions[1].id] ?? ''),
        ];
        csv += row.map((v) => `"${v.replace(/"/g, '""')}"`).join(',') + '\n';
      }
    }
    downloadText(`${currentProject.name} - Export.csv`, csv, 'text/csv');
    setExportMenu(false);
  };

  const videoPanel = (
    <div className="video-panel">
      <div style={{ position: 'relative' }}>
        <VideoPlayer
          projectId={currentProject.id}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          seekToMs={seekToMs}
          onTimeUpdate={setCurrentTimeMs}
          onDuration={setDurationMs}
          onSeekProcessed={() => setSeekToMs(null)}
          onEnded={() => setIsPlaying(false)}
        />
      </div>

      <div className="video-hud">
        <span className="time mono">
          {formatTime(currentTimeMs, timeFormat)} / {formatTime(durationMs, timeFormat)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" title="Back 0.5s" onClick={() => seek(currentTimeMs - 500)}>
            <Rewind5Icon size={20} />
          </button>
          <button className="icon-btn" onClick={() => setIsPlaying((p) => !p)}>
            {isPlaying ? (
              <PauseCircleIcon size={34} className="primary-text" />
            ) : (
              <PlayCircleIcon size={34} className="primary-text" />
            )}
          </button>
          <button className="icon-btn" title="Forward 0.5s" onClick={() => seek(currentTimeMs + 500)}>
            <Forward5Icon size={20} />
          </button>
        </div>
        <div className="speed">
          <button className="value mono" onClick={() => setSpeedMenu((s) => !s)}>
            {playbackSpeed}x
          </button>
          {speedMenu && (
            <div className="menu">
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  className="mono"
                  onClick={() => {
                    setPlaybackSpeed(sp);
                    setSpeedMenu(false);
                  }}
                >
                  {sp}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <input
        type="range"
        className="timeline"
        min={0}
        max={1000}
        value={durationMs > 0 ? (currentTimeMs / durationMs) * 1000 : 0}
        onChange={(e) => seek((Number(e.target.value) / 1000) * durationMs)}
      />
    </div>
  );

  const editor = (
    <div className="editor">
      <div className="toolbar">
        <div className="group">
          <button
            className="btn btn-primary"
            disabled={isLinting}
            onClick={() => store.lintAllSegments()}
          >
            {isLinting ? <Spinner className="on-primary" /> : <CheckSquareIcon size={16} />} Lint Rules
          </button>
          <button className="btn btn-outline" onClick={() => store.clearLintWarnings()}>
            <ClearIcon size={16} /> Clear Warnings
          </button>
        </div>
        <div className="group">
          <button
            className="btn btn-outline"
            title="Toggle timestamp format (MM:SS.S / seconds)"
            onClick={() => store.setTimeFormat(timeFormat === 'mmss' ? 'seconds' : 'mmss')}
          >
            <ClockIcon size={16} /> {timeFormat === 'mmss' ? 'MM:SS.S' : 'Seconds'}
          </button>
          <button
            className="btn btn-ghost"
            title={`Add ${tracks[activeTab].name} annotation`}
            onClick={() => store.addSegment(activeTab)}
          >
            <PlusIcon size={16} /> Add
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setExportMenu((e) => !e)}>
              <ExportIcon size={16} /> Export
            </button>
            {exportMenu && (
              <div className="menu" style={{ minWidth: 200 }}>
                <button onClick={exportCopyText}>
                  <CopyIcon size={16} /> Copy Format text
                </button>
                <button onClick={exportJson}>
                  <CodeIcon size={16} /> Download JSON
                </button>
                <button onClick={exportCsv}>
                  <GridIcon size={16} /> Download CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Track tabs */}
      <div className="tabs">
        {trackList.map((track) => (
          <button
            key={track.id}
            className={`tab ${activeTab === track.id ? 'active' : ''}`}
            onClick={() => setActiveTab(track.id)}
          >
            {track.name}
            <span className="tab-count">{countFor(track.id)}</span>
          </button>
        ))}
      </div>

      {trackSegments.length === 0 ? (
        <div className="annotation-list">
          <div className="empty">
            <SubtitlesOffIcon size={48} />
            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
              No {tracks[activeTab].name} annotations yet
            </div>
            <div>Generate a draft, or click "Add" to append a {tracks[activeTab].name} annotation.</div>
          </div>
        </div>
      ) : (
        <div className="annotation-list">
          {trackSegments.map((seg, i) => (
            <div key={seg.id} ref={(el) => (rowRefs.current[seg.id] = el)}>
              <SegmentRow
                segment={seg}
                isLast={i === trackSegments.length - 1}
                columns={columns}
                isActive={seg.id === activeId}
                currentPlaybackTimeMs={currentTimeMs}
                timeFormat={timeFormat}
                onSeek={seek}
                onUpdateText={store.updateCellText}
                onUpdateTimes={store.updateSegmentTimes}
                onSplit={store.splitSegment}
                onMerge={store.mergeSegmentWithNext}
                onDelete={store.deleteSegment}
                onRegen={(segId, colId, colName) => {
                  setRegenCell({ segId, colId, colName });
                  setRegenInstruction('');
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={`workspace ${isWide ? 'split' : 'stacked'}`}>
      {videoPanel}
      {editor}

      {regenCell && (
        <div className="modal-backdrop" onClick={() => setRegenCell(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="h1 primary-text" style={{ fontSize: 16 }}>
              Regenerate Caption ({regenCell.colName})
            </h2>
            <p className="muted">
              Prompt Gemini to rewrite this caption. Provide specific instructions or click
              Regenerate to enforce the baseline spec.
            </p>
            <textarea
              className="textarea"
              placeholder="e.g. 'Shorten to under 5 words', 'Transcribe verbatim stutter', 'Note the accent'"
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
            />
            <div className="row">
              <button className="btn btn-outline" onClick={() => setRegenCell(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const seg = segments.find((s) => s.id === regenCell.segId);
                  const existing = seg
                    ? String(safeParseObject(seg.captionsJson)[regenCell.colId] ?? '')
                    : '';
                  store.regenerateCell(
                    regenCell.segId,
                    regenCell.colId,
                    regenCell.colName,
                    existing,
                    regenInstruction
                  );
                  setRegenCell(null);
                }}
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
