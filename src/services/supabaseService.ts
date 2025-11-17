import { supabase } from '../lib/supabaseClient';
import type { FeeSnapshot } from '../utils/feeSnapshot';

export interface FeeProjectInput {
  name: string;
  client_name?: string;
  site_address?: string;
  value_of_works?: number | null;
}

export async function upsertProfile(userId: string, email: string | undefined) {
  const { error } = await supabase.from('profiles').upsert({ id: userId, email });
  if (error) throw error;
}

export async function listProjects() {
  const { data, error } = await supabase
    .from('fee_projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(userId: string, payload: FeeProjectInput) {
  const { data, error } = await supabase
    .from('fee_projects')
    .insert({ user_id: userId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveCalculation(projectId: string, snapshot: FeeSnapshot) {
  const { data, error } = await supabase
    .from('fee_calculations')
    .insert({
      project_id: projectId,
      parameters: snapshot,
      results: {
        basket: snapshot.basket,
        projectDetails: snapshot.projectDetails,
        totals: snapshot.totals,
        sacap: snapshot.sacap,
        bim: snapshot.bim,
        hourly: snapshot.hourly,
      },
    })
    .select('created_at')
    .single();
  if (error) throw error;
  return data?.created_at as string | undefined;
}

export async function loadLatestCalculation(
  projectId: string,
): Promise<{ snapshot: FeeSnapshot | null; createdAt: string | null }> {
  const { data, error } = await supabase
    .from('fee_calculations')
    .select('parameters, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = data as { parameters?: FeeSnapshot; created_at?: string } | null;
  return { snapshot: row?.parameters ?? null, createdAt: row?.created_at ?? null };
}

export async function fetchLatestTimestampsByProject(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('fee_calculations')
    .select('project_id, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const map: Record<string, string> = {};
  (data ?? []).forEach((row) => {
    if (row.project_id && !map[row.project_id]) {
      map[row.project_id] = row.created_at;
    }
  });
  return map;
}
