import type { Project } from '../types';
import { CheckIcon, TrashIcon, CloseIcon } from './Icons';

interface Props {
  projects: Project[];
  activeProject: Project | null;
  onSelect: (p: Project) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function ProjectSelectorModal({
  projects,
  activeProject,
  onSelect,
  onDelete,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 className="h1 primary-text" style={{ flex: 1 }}>
            Select Workspace Project
          </h2>
          <button className="icon-btn small" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="project-list">
          {projects.map((proj) => {
            const isCurrent = proj.id === activeProject?.id;
            return (
              <div
                key={proj.id}
                className={`project-item ${isCurrent ? 'current' : ''}`}
                onClick={() => onSelect(proj)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{proj.name}</div>
                  <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {proj.videoName || 'No video'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isCurrent && <CheckIcon size={16} className="primary-text" />}
                  <button
                    className="icon-btn small"
                    style={{ color: 'var(--red)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(proj.id);
                    }}
                    title="Delete project"
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="row">
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
