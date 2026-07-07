interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function Switch({ checked, onChange }: SwitchProps) {
  return (
    <button
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="knob" />
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <div className={`spinner ${className}`} />;
}
