'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/site/LanguageProvider';
import type { ChurchVisualizerEventDto } from '@/lib/types';
import { eventImage } from '@/lib/visualizer/historical-territories';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const reveal = () => handleRef.current?.scrollIntoView?.({block: 'nearest', inline: 'center'});
    reveal();
    if (!scrollRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reveal); observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [selectedEventId]);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (events.length === 0) return null;

  const lastIndex = events.length - 1;
  const rawSelectedIndex = selectedEventId == null ? -1 : events.findIndex((event) => event.id === selectedEventId);
  const selectedIndex = rawSelectedIndex === -1 ? null : rawSelectedIndex;
  const activeIndex = dragIndex ?? selectedIndex;
  const percent = dragPercent ?? scrubberPercent(activeIndex ?? 0, events.length);
  function updateDrag(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setDragPercent(Math.max(0, Math.min(100, (event.clientX - rect.left) / Math.max(1, rect.width) * 100)));
    setDragIndex(scrubberIndexAtClientX(event.clientX, rect, events.length));
  }

  function selectIndex(index: number) {
    const id = events[index]?.id;
    if (id && id !== selectedEventId) onSelect(id);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (lastIndex <= 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateDrag(event);
  }
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    updateDrag(event);
  }
  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    const index = scrubberIndexAtClientX(event.clientX, event.currentTarget.getBoundingClientRect(), events.length);
    setDragPercent(null);
    setDragIndex(null);
    selectIndex(index);
  }
  function handlePointerCancel() { setDragPercent(null); setDragIndex(null); }

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
    <div ref={scrollRef} className={styles.scrubberScroll}><div
      className={styles.scrubberTrack}
      style={{ minWidth: `${Math.max(320, events.length * 144)}px` }}
      data-dragging={dragIndex !== null}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className={styles.scrubberProgress} style={{ width: `${percent}%` }} aria-hidden="true" />
      <div className={styles.scrubberTicks}>
        {events.map((event, index) => (
          <button type="button" key={event.id} aria-label={`${dateText(event, locale)} — ${event.title}`} aria-pressed={event.id === selectedEventId} onClick={(e) => { if (e.detail === 0 || events.length === 1) selectIndex(index); }} className={styles.scrubberTick} style={{ '--scrubber-position': `${scrubberPercent(index, events.length)}%` } as React.CSSProperties}>
            {event.id === selectedEventId && eventImage(event) ? <img className={styles.timelineThumbnail} src={eventImage(event)!} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.hidden = true; }} /> : null}
            <span className={styles.scrubberTickTitle}>{event.title}</span><span className={styles.srOnly}>{event.locationName}</span>
            <span className={styles.scrubberTickMark} />
            <span className={styles.scrubberTickLabel}>{dateText(event, locale)}</span>
          </button>
        ))}
      </div>
      {selectedIndex !== null || dragIndex !== null ? (
        <button
          type="button"
          ref={handleRef}
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
          <span aria-hidden="true" />
        </button>
      ) : null}
    </div></div>
  );
}
