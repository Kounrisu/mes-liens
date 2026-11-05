/** Dates ISO 8601 UTC (ex. "2026-11-05T10:21:00.000Z"). Les id sont des UUID générés côté client. */
export interface Link {
  id: string;
  url: string;
  title: string;
  domain: string;
  tags: string[];
  note: string;
  screenshotId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Tombstone : non nul = lien supprimé (conservé pour la synchronisation). */
  deletedAt: string | null;
}

export type EventType =
  | 'created'
  | 'tagged'
  | 'untagged'
  | 'note_edited'
  | 'screenshot_added'
  | 'revisited';

export const EVENT_TYPES: readonly EventType[] = [
  'created',
  'tagged',
  'untagged',
  'note_edited',
  'screenshot_added',
  'revisited',
];

/** Journal en ajout seul : jamais modifié ni supprimé. */
export interface LinkEvent {
  id: string;
  linkId: string;
  type: EventType;
  payload: Record<string, unknown>;
  at: string;
}

export const EXPORT_FORMAT = 'mes-liens-export';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  links: Link[];
  events: LinkEvent[];
}
