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
  // Fetch owned projects
  const ownedPromise = supabase
    .from('fee_projects')
    .select('*, project_shares!left(shared_with_user_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Fetch projects shared with the user
  const sharedPromise = supabase
    .from('project_shares')
    .select('project_id, fee_projects!inner(*)')
    .eq('shared_with_user_id', userId);

  const [{ data: owned, error: ownedErr }, { data: shared, error: sharedErr }] = await Promise.all([
    ownedPromise,
    sharedPromise,
  ]);
  if (ownedErr) throw ownedErr;
  if (sharedErr) throw sharedErr;

  const ownedRows: ProjectRow[] = (owned ?? []).map((row: any) => ({
    ...row,
    project_shares: row.project_shares ?? [],
    isOwner: true,
  }));

  const sharedRows: ProjectRow[] = (shared ?? []).map((row: any) => {
    const proj = (row as any).fee_projects;
    return { ...proj, project_shares: [], isOwner: false };
  });

  // Combine and sort newest first
  return [...ownedRows, ...sharedRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
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
    .select('id, project_id, shared_with_user_id, created_at')
    .eq('project_id', projectId);
  if (error) throw error;
  const rows = data ?? [];

  // Fetch emails for shared users without relying on FK relationships in Supabase schema cache
  const userIds = Array.from(new Set(rows.map((r) => r.shared_with_user_id).filter(Boolean)));
  let profilesById: Record<string, string | undefined> = {};
  if (userIds.length) {
    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds);
    if (profilesErr) throw profilesErr;
    profilesById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.email]));
  }

  return rows.map((row: any) => ({
    id: row.id,
    project_id: row.project_id,
    shared_with_user_id: row.shared_with_user_id,
    created_at: row.created_at,
    shared_with_email: profilesById[row.shared_with_user_id],
  }));
}

export async function unshareProject(shareId: string) {
  const { error } = await supabase.from('project_shares').delete().eq('id', shareId);
  if (error) throw error;
}
