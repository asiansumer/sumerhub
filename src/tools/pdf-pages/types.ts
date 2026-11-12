import type { PagePlan } from './lib/pdf';

export type PdfRequest =
  | { id: string; kind: 'image'; bytes: ArrayBuffer; type: 'jpeg' | 'png' }
  | { id: string; kind: 'build'; mode: 'single' | 'each'; sources: { id: string; bytes: ArrayBuffer }[]; pages: PagePlan[] };

export type PdfResponse =
  | { id: string; kind: 'image'; bytes: ArrayBuffer }
  | { id: string; kind: 'build'; files: ArrayBuffer[] }
  | { id: string; kind: 'progress'; done: number }
  | { id: string; kind: 'error'; error: string };
