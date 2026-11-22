import type { ReactNode } from 'react';
import { MusicIcon, SparkIcon } from './Icons';

interface EmptyStateProps {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
  suggestions?: string[];
  onSuggestion?: (value: string) => void;
}

export function EmptyState({
  kicker,
  title,
  description,
  action,
  suggestions,
  onSuggestion,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-disc">
        <MusicIcon size={24} />
      </div>
      <span className="empty-kicker">{kicker}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {suggestions?.length ? (
        <div className="suggestion-row" aria-label="Búsquedas sugeridas">
          <SparkIcon size={14} />
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="suggestion-chip"
              onClick={() => onSuggestion?.(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      {action}
    </div>
  );
}
