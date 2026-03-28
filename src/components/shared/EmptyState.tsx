interface EmptyStateProps {
  message?: string;
  className?: string;
}

export function EmptyState({ 
  message = 'No items yet',
  className = ''
}: EmptyStateProps) {
  return (
    <div 
      style={
        {
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          gridColumn: '1 / -1',
          padding: '20px',
        }
      }
      className={className}
    >
      {message}
    </div>
  );
}
