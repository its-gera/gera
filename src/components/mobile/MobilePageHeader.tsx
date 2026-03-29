import { ReactNode } from 'react';

interface MobilePageHeaderProps {
  label: string;
  right?: ReactNode;
  className?: string;
}

export function MobilePageHeader({ label, right, className }: MobilePageHeaderProps) {
  return (
    <div className={`mobile-page-header${className ? ` ${className}` : ''}`}>
      <div className="mobile-page-header__top">
        <span className="mobile-page-header__label">{label}</span>
        {right && <div className="mobile-page-header__right">{right}</div>}
      </div>
    </div>
  );
}
