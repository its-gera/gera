import React from 'react';

interface TagProps {
  type: 'event' | 'project' | 'deadline';
  children: React.ReactNode;
  className?: string;
}

export function Tag({ type, children, className = '' }: TagProps) {
  // Special handling for deadline tags that include an icon
  if (type === 'deadline' && React.isValidElement(children)) {
    return (
      <span className={`task-tag task-tag--deadline ${className}`}>
        {children}
      </span>
    );
  }

  return (
    <span className={`task-tag task-tag--${type} ${className}`}>
      {children}
    </span>
  );
}
