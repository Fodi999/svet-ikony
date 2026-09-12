'use client';

import { useState } from 'react';
import { useI18n } from '@/components/site/LanguageProvider';
import type { ChurchVisualizerEventDto } from '@/lib/types';
import { dateText } from '@/lib/visualizer/chronology';
import { explorerMessages } from '@/lib/visualizer/explorer-messages';
import { scrubberIndexAtClientX, scrubberPercent } from '@/lib/visualizer/timeline-position';
import styles from './history.module.css';

type Props = {
  events: ChurchVisualizerEventDto[];
  selectedEventId: string | null;
  onSelect: (id: string) => void;
};

export function TimelineScrubber({ events, selectedEventId, onSelect }: Props) {
  const { locale } = useI18n();
  const copy = explorerMessages[locale];
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (events.length === 0) return null;

  const lastIndex = events.length - 1;
  const rawSelectedIndex = selectedEventId == null ? -1 : events.findIndex((event) => event.id === selectedEventId);
  const selectedIndex = rawSelectedIndex === -1 ? null : rawSelectedIndex;
  const activeIndex = dragIndex ?? selectedIndex;
  const percent = scrubberPercent(activeIndex ?? 0, events.length);

  function selectIndex(index: number) {
    const id = events[index]?.id;
    if (id && id !== selectedEventId) onSelect(id);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (lastIndex <= 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragIndex(scrubberIndexAtClientX(event.clientX, event.currentTarget.getBoundingClientRect(), events.length));
  }
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    setDragIndex(scrubberIndexAtClientX(event.clientX, event.currentTarget.getBoundingClientRect(), events.length));
  }
  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    const index = scrubberIndexAtClientX(event.clientX, event.currentTarget.getBoundingClientRect(), events.length);
    setDragIndex(null);
    selectIndex(index);
  }
  function handlePointerCancel() { setDragIndex(null); }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const current = activeIndex ?? 0;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, current - 1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(lastIndex, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lastIndex;
    if (next === null) return;
    event.preventDefault();
    selectIndex(next);
  }

  const activeEvent = events[activeIndex ?? 0];

  return (
    <div
      className={styles.scrubberTrack}
      data-dragging={dragIndex !== null}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className={styles.scrubberTicks} aria-hidden="true">
        {events.map((event, index) => (
          <span key={event.id} className={styles.scrubberTick} style={{ '--scrubber-position': `${scrubberPercent(index, events.length)}%` } as React.CSSProperties}>
            <span className={styles.scrubberTickMark} />
            <span className={styles.scrubberTickLabel}>{dateText(event, locale, false)}</span>
          </span>
        ))}
      </div>
      {selectedIndex !== null || dragIndex !== null ? (
        <button
          type="button"
          role="slider"
          className={styles.scrubberHandle}
          style={{ '--scrubber-position': `${percent}%` } as React.CSSProperties}
          aria-label={copy.timeline}
          aria-valuemin={0}
          aria-valuemax={lastIndex}
          aria-valuenow={activeIndex ?? 0}
          aria-valuetext={activeEvent ? `${dateText(activeEvent, locale)} — ${activeEvent.title}` : undefined}
          onKeyDown={handleKeyDown}
        >
          ▲
        </button>
      ) : null}
    </div>
  );
}
