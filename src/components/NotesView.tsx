import { useState } from 'react';
import { CONTEXT_TAGS } from '../lib/storage';
import type { AwarenessEvent, NoteEntry } from '../types';

interface NotesViewProps {
  notes: NoteEntry[];
  events: AwarenessEvent[];
  embedded?: boolean;
  onAddNote: (text: string, tags: string[]) => void;
  onDeleteNote: (id: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describeEvent(ev: AwarenessEvent): string {
  switch (ev.kind) {
    case 'redirect-stage1':
      return 'Urge redirected · Stage 1 gentle cue';
    case 'redirect-stage2':
      return 'Urge redirected · 60s pause completed';
    case 'grace':
      return ev.tag ? `Grace recovery · ${ev.tag}` : 'Grace recovery';
    case 'false-alarm':
      return 'False alarm dismissed';
    case 'welcome-back-calm':
      return ev.note || 'Returned calm from break';
    case 'calming-reset':
      return 'Calming reset completed';
  }
}

export function NotesView({
  notes,
  events,
  embedded = false,
  onAddNote,
  onDeleteNote,
}: NotesViewProps) {
  const [draft, setDraft] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddNote(trimmed, selectedTags);
    setDraft('');
    setSelectedTags([]);
  };

  const recentEvents = events.filter((e) => e.kind !== 'false-alarm').slice(0, 14);

  return (
    <div className="view-stack">
      {!embedded && (
        <header className="page-intro">
          <h1 className="page-title">Notes</h1>
          <p className="page-lead">
            Jot down what preceded an urge, what softened it, or how a short walk felt. Stored only
            on this device.
          </p>
        </header>
      )}

      {/* Quick Reflection Composer */}
      <form className="note-composer" onSubmit={handleSubmit}>
        <label htmlFor="note-textarea" className="sr-only">
          Write a brief reflection
        </label>
        <textarea
          id="note-textarea"
          className="note-textarea"
          rows={3}
          placeholder="Notice what was happening before restlessness or an urge showed up…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <div className="tag-row">
          {CONTEXT_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`tag-chip ${selectedTags.includes(tag) ? 'tag-chip--selected' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="composer-foot">
          <span className="composer-hint">Private · Saved only in this browser</span>
          <button
            type="submit"
            id="btn-save-note"
            className="btn btn-primary btn-sm"
            disabled={!draft.trim()}
          >
            Save note
          </button>
        </div>
      </form>

      {/* Saved Reflections */}
      <section className="editorial-section" aria-label="Saved notes">
        <div className="section-head-row">
          <h2 className="section-heading">Reflections</h2>
          <span className="section-meta">{notes.length} saved</span>
        </div>

        {notes.length === 0 ? (
          <p className="empty-state">
            No notes yet. Even one sentence after a quiet afternoon helps spot gentle patterns.
          </p>
        ) : (
          <div className="notes-list">
            {notes.map((note) => (
              <article key={note.id} className="note-card">
                <p className="note-body">{note.text}</p>
                <div className="note-meta-row">
                  <div className="note-tags-inline">
                    <span className="note-time">{formatTime(note.timestamp)}</span>
                    {note.tags.map((t) => (
                      <span key={t} className="mini-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-link-btn text-link-btn--muted"
                    onClick={() => onDeleteNote(note.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Recent Moments Log */}
      <section className="editorial-section" aria-label="Recent awareness moments">
        <div className="section-head-row">
          <h2 className="section-heading">Recent moments</h2>
          <span className="section-meta">Local log</span>
        </div>

        {recentEvents.length === 0 ? (
          <p className="empty-state">
            Redirected urges, calming resets, and grace recoveries will appear softly here.
          </p>
        ) : (
          <ul className="moments-list">
            {recentEvents.map((ev) => (
              <li key={ev.id} className="moment-row">
                <span className="moment-label">{describeEvent(ev)}</span>
                <span className="moment-time tabular">{formatTime(ev.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
