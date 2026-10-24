import type { AskResult, HelpOpportunity, NoteExtraction, TeamPlan, TeamRole } from '@bridge/core';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let msg = error.message;
      try { msg = ((await error.context.json()) as { error?: string }).error ?? msg; } catch { /* keep default */ }
      throw new ApiError(msg, error.context.status);
    }
    throw new ApiError(error.message ?? 'Request failed', 0);
  }
  return data as T;
}

export type Reciprocal = HelpOpportunity;
export type AskResponse = AskResult & { queryId?: string; embeddingModel: string; reciprocal: Reciprocal[] };
export type TeamResponse = TeamPlan & { requestId: string; reciprocal: Reciprocal[] };
export type ExtractResponse = NoteExtraction & { noteId?: string };

export const api = {
  ask: (query: string, save = true) => invoke<AskResponse>('ask', { query, save }),
  team: (description: string, roles?: Pick<TeamRole, 'title' | 'tags'>[], requestId?: string) => invoke<TeamResponse>('team', { description, roles, requestId }),
  extractNote: (input: { noteId?: string; text?: string }) => invoke<ExtractResponse>('extract-note', input),
  plugins: <T = unknown>(body: Record<string, unknown>) => invoke<T>('plugins', body),
  exportAccount: () => invoke<Record<string, unknown>>('account', { action: 'export' }),
  deleteAccount: () => invoke<{ ok: boolean }>('account', { action: 'delete', confirm: 'DELETE' }),
};

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message;
  return typeof e === 'string' ? e : 'Something went wrong';
}
