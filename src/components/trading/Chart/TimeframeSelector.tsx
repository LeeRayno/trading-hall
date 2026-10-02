'use client';

/**
 * Interval picker for the chart.
 *
 * The interval itself drives the REST query and the WebSocket topic, so this
 * is a controlled input rather than local state.
 *
 * Buttons show the bare code (`1m`, `4H`) because that is the notation every
 * trading interface uses and it is not ambiguous in any language. The
 * translated name is still supplied, as the tooltip and the accessible label.
 */

import { useTranslation } from '@/i18n/I18nProvider';
import { TIMEFRAMES, type Timeframe } from '@/lib/market-data/types';

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (timeframe: Timeframe) => void;
}

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  const t = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('trade.timeframe')}
      className="flex flex-wrap items-center gap-0.5"
    >
      {TIMEFRAMES.map((timeframe) => {
        const active = timeframe === value;
        const label = t(`trade.timeframes.${timeframe}`);

        return (
          <button
            key={timeframe}
            type="button"
            onClick={() => onChange(timeframe)}
            aria-pressed={active}
            title={label}
            aria-label={label}
            className={`tabular rounded px-2 py-0.5 text-xs transition-colors ${
              active
                ? 'bg-accent-subtle text-accent'
                : 'text-text-muted hover:bg-panel-hover hover:text-foreground'
            }`}
          >
            {timeframe}
          </button>
        );
      })}
    </div>
  );
}
