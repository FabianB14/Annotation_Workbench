// Lightweight inline SVG icon set (no external icon dependency).

interface IconProps {
  size?: number;
  className?: string;
}

const svg = (children: React.ReactNode, size = 18, className?: string) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const FolderIcon = ({ size, className }: IconProps) =>
  svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, size, className);

export const PlusIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>,
    size,
    className
  );

export const SettingsIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    size,
    className
  );

export const CheckIcon = ({ size, className }: IconProps) =>
  svg(<polyline points="20 6 9 17 4 12" />, size, className);

export const ChevronRightIcon = ({ size, className }: IconProps) =>
  svg(<polyline points="9 18 15 12 9 6" />, size, className);

export const ArrowForwardIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </>,
    size,
    className
  );

export const CloseIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>,
    size,
    className
  );

export const UploadIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>,
    size,
    className
  );

export const DocumentIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </>,
    size,
    className
  );

export const VideoIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </>,
    size,
    className
  );

export const SparkleIcon = ({ size, className }: IconProps) =>
  svg(
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />,
    size,
    className
  );

export const BrainIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>,
    size,
    className
  );

export const PlayIcon = ({ size, className }: IconProps) =>
  svg(<polygon points="5 3 19 12 5 21 5 3" />, size, className);

export const PlayCircleIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </>,
    size,
    className
  );

export const PauseCircleIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="10" y1="9" x2="10" y2="15" />
      <line x1="14" y1="9" x2="14" y2="15" />
    </>,
    size,
    className
  );

export const Rewind5Icon = ({ size, className }: IconProps) =>
  svg(
    <>
      <polyline points="11 19 4 12 11 5" />
      <polyline points="20 19 13 12 20 5" />
    </>,
    size,
    className
  );

export const Forward5Icon = ({ size, className }: IconProps) =>
  svg(
    <>
      <polyline points="13 19 20 12 13 5" />
      <polyline points="4 19 11 12 4 5" />
    </>,
    size,
    className
  );

export const ClockIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>,
    size,
    className
  );

export const SplitIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M8 3H3v5" />
      <path d="M3 3l7 7v11" />
      <path d="M16 3h5v5" />
      <path d="M21 3l-7 7" />
    </>,
    size,
    className
  );

export const MergeIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M8 3v6a5 5 0 0 0 5 5h8" />
      <polyline points="18 11 22 14 18 17" />
    </>,
    size,
    className
  );

export const TrashIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>,
    size,
    className
  );

export const RegenIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>,
    size,
    className
  );

export const CheckSquareIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>,
    size,
    className
  );

export const ClearIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="17" x2="10" y2="17" />
    </>,
    size,
    className
  );

export const ExportIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </>,
    size,
    className
  );

export const CopyIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
    size,
    className
  );

export const CodeIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>,
    size,
    className
  );

export const GridIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </>,
    size,
    className
  );

export const EditIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </>,
    size,
    className
  );

export const SubtitlesOffIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <line x1="7" y1="15" x2="13" y2="15" />
    </>,
    size,
    className
  );

export const HomeIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M3 9.5L12 3l9 6.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M9 21v-6h6v6" />
    </>,
    size,
    className
  );

export const KeyIcon = ({ size, className }: IconProps) =>
  svg(
    <>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" />
    </>,
    size,
    className
  );
