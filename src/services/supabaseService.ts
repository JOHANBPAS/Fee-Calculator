import { supabase } from '../lib/supabaseClient';
import type { FeeSnapshot } from '../utils/feeSnapshot';

export interface FeeProjectInput {
  name: string;
  client_name?: string;
  site_address?: string;
  value_of_works?: number | null;
}

export interface ProjectShare {
  id: string;
  project_id: string;
  shared_with_user_id: string;
  created_at: string;
  shared_with_email?: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  client_name?: string;
  site_address?: string;
  value_of_works?: number | null;
  created_at: string;
  updated_at?: string;
  project_shares?: ProjectShare[];
  isOwner: boolean;
}

export async function upsertProfile(userId: string, email: string | undefined) {
  const { error } = await supabase.from('profiles').upsert({ id: userId, email });
  if (error) throw error;
}

export async function listProjectsForUser(userId: string): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('fee_projects')
    .select('*, project_shares!left(shared_with_user_id)')
    .or(`user_id.eq.${userId},project_shares.shared_with_user_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    project_shares: row.project_shares ?? [],
    isOwner: row.user_id === userId,
  }));
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

export async function deleteProject(projectId: string) {
  const { error } = await supabase.from('fee_projects').delete().eq('id', projectId);
  if (error) throw error;
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

// Sharing helpers
export async function shareProjectByEmail(projectId: string, email: string) {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile?.id) throw new Error('User not found with that email');

  const { error } = await supabase
    .from('project_shares')
    .insert({ project_id: projectId, shared_with_user_id: profile.id });
  if (error) throw error;
}

export async function listProjectShares(projectId: string): Promise<ProjectShare[]> {
  const { data, error } = await supabase
    .from('project_shares')
    .select('id, project_id, shared_with_user_id, created_at, profiles!project_shares_shared_with_user_id_fkey(email)')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    project_id: row.project_id,
    shared_with_user_id: row.shared_with_user_id,
    created_at: row.created_at,
    shared_with_email: row.profiles?.email,
  }));
}

export async function unshareProject(shareId: string) {
  const { error } = await supabase.from('project_shares').delete().eq('id', shareId);
  if (error) throw error;
}
