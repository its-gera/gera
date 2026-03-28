import { CheckIcon } from '../icons/Icons';

interface CheckboxProps {
  checked: boolean;
  onChange?: () => void;
  className?: string;
}

export function Checkbox({ checked, onChange, className = '' }: CheckboxProps) {
  return (
    <div 
      className={`checkbox ${checked ? 'checked' : ''} ${className}`} 
      onClick={onChange}
      role="checkbox"
      aria-checked={checked}
      style={{ cursor: 'pointer' }}
    >
      {checked && <CheckIcon />}
    </div>
  );
}
