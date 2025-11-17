import React, { useEffect, useMemo, useState } from 'react';
import { useSupabaseAuth } from '../providers/SupabaseAuthProvider';
import { applySnapshotToApp, buildFeeSnapshot } from '../utils/feeSnapshot';
import {
  createProject,
  listProjectsForUser,
  loadLatestCalculation,
  saveCalculation,
  upsertProfile,
  fetchLatestTimestampsByProject,
} from '../services/supabaseService';
import { downloadSnapshotPdf } from '../services/reportService';

interface ProjectSyncPanelProps {
  clientName: string;
  setClientName: (val: string) => void;
  vatPct: number;
  setVatPct: (val: number) => void;
  globalVow: number;
  setGlobalVow: (val: number) => void;
  activeTab: string;
  setActiveTab: (val: string) => void;
  selectedProjectId?: string;
  onProjectSelected?: (id: string) => void;
}

interface FeeProjectRow {
  id: string;
  name: string;
  client_name?: string;
  site_address?: string;
  value_of_works?: number;
  isOwner: boolean;
}

export function ProjectSyncPanel(props: ProjectSyncPanelProps) {
  const { user, signOut } = useSupabaseAuth();
  const [projects, setProjects] = useState<FeeProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectForm, setProjectForm] = useState({ name: '', client_name: '', site_address: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSavedByProject, setLastSavedByProject] = useState<Record<string, string>>({});

  const snapshot = useMemo(
    () =>
      buildFeeSnapshot({
        clientName: props.clientName,
        vatPct: props.vatPct,
        globalVow: props.globalVow,
        activeTab: props.activeTab,
      }),
    [props.clientName, props.vatPct, props.globalVow, props.activeTab],
  );

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        await upsertProfile(user.id, user.email);
        const rows = await listProjectsForUser(user.id);
        setProjects(rows as FeeProjectRow[]);
        const timestamps = await fetchLatestTimestampsByProject();
        setLastSavedByProject(timestamps);
      } catch (err) {
        console.error(err);
        setMessage('Could not load projects from Supabase.');
      }
    })();
  }, [user]);

  useEffect(() => {
    if (props.selectedProjectId) {
      setSelectedProjectId(props.selectedProjectId);
    }
  }, [props.selectedProjectId]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setMessage(null);
    try {
      const row = await createProject(user.id, {
        name: projectForm.name,
        client_name: projectForm.client_name,
        site_address: projectForm.site_address,
        value_of_works: props.globalVow || null,
      });
      setProjects((prev) => [row as FeeProjectRow, ...prev]);
      setSelectedProjectId((row as FeeProjectRow).id);
      setProjectForm({ name: '', client_name: '', site_address: '' });
      setMessage('Project created.');
    } catch (err: any) {
      console.error(err);
      setMessage(`Failed to create project: ${err?.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const saveToSupabase = async () => {
    if (!selectedProjectId) {
      setMessage('Select or create a project first.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const createdAt = await saveCalculation(selectedProjectId, snapshot);
      if (createdAt) {
        setLastSavedByProject((prev) => ({ ...prev, [selectedProjectId]: createdAt }));
      }
      setMessage('Saved calculation to Supabase. You can export or reload anytime.');
    } catch (err) {
      console.error(err);
      setMessage('Failed to save calculation.');
    } finally {
      setLoading(false);
    }
  };

  const loadFromSupabase = async () => {
    if (!selectedProjectId) {
      setMessage('Select a project to load.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { snapshot: data, createdAt } = await loadLatestCalculation(selectedProjectId);
      if (!data) {
        setMessage('No calculations saved for this project yet.');
      } else {
        applySnapshotToApp(data, {
          setClientName: props.setClientName,
          setVatPct: props.setVatPct,
          setGlobalVow: props.setGlobalVow,
          setActiveTab: props.setActiveTab,
        });
        if (createdAt) {
          setLastSavedByProject((prev) => ({ ...prev, [selectedProjectId]: createdAt }));
        }
        setMessage('Loaded latest saved calculation (including SACAP / BIM / Hourly details).');
      }
    } catch (err) {
      console.error(err);
      setMessage('Failed to load calculation.');
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = async () => {
    await downloadSnapshotPdf(snapshot, projects.find((p) => p.id === selectedProjectId)?.name ?? '');
  };

  return (
    <section className="p-3 bg-zinc-900 rounded-2xl shadow space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-medium">Supabase Projects</h2>
          <p className="text-sm text-zinc-400">Login required. All data is saved per user.</p>
        </div>
        <button className="text-sm text-amber-300" onClick={() => signOut()}>
          Sign out
        </button>
      </div>

      <form className="grid md:grid-cols-3 gap-2" onSubmit={handleCreateProject}>
        <input
          className="bg-zinc-800 rounded-xl p-2"
          placeholder="Project name"
          value={projectForm.name}
          onChange={(e) => setProjectForm((v) => ({ ...v, name: e.target.value }))}
          required
        />
        <input
          className="bg-zinc-800 rounded-xl p-2"
          placeholder="Client (optional)"
          value={projectForm.client_name}
          onChange={(e) => setProjectForm((v) => ({ ...v, client_name: e.target.value }))}
        />
        <div className="flex gap-2">
          <input
            className="bg-zinc-800 rounded-xl p-2 flex-1"
            placeholder="Site address (optional)"
            value={projectForm.site_address}
            onChange={(e) => setProjectForm((v) => ({ ...v, site_address: e.target.value }))}
          />
          <button
            type="submit"
            className="bg-amber-400 text-zinc-900 font-semibold rounded-xl px-3"
            disabled={loading}
          >
            New
          </button>
        </div>
      </form>

      <div className="flex gap-2 flex-wrap items-center">
        <select
          className="bg-zinc-800 rounded-xl p-2 min-w-[200px]"
          value={selectedProjectId}
          onChange={(e) => {
            setSelectedProjectId(e.target.value);
            props.onProjectSelected?.(e.target.value);
          }}
        >
          <option value="">Select project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedProjectId && lastSavedByProject[selectedProjectId] && (
          <span className="text-xs text-emerald-300">
            Last saved: {new Date(lastSavedByProject[selectedProjectId]).toLocaleString()}
          </span>
        )}
        <button
          className="bg-zinc-800 px-3 py-2 rounded-xl text-sm"
          onClick={loadFromSupabase}
          disabled={loading}
        >
          Load latest
        </button>
        <button
          className="bg-amber-400 text-zinc-900 px-3 py-2 rounded-xl text-sm font-semibold"
          onClick={saveToSupabase}
          disabled={loading}
        >
          Save snapshot
        </button>
        <button
          className="bg-zinc-700 text-white px-3 py-2 rounded-xl text-sm"
          onClick={exportPdf}
          disabled={loading || !selectedProjectId}
        >
          Export PDF
        </button>
      </div>
      {projects.length > 0 && (
        <div className="text-xs text-zinc-500">
          {projects.map((p) => (
            <div key={p.id}>
              {p.name}: {lastSavedByProject[p.id] ? new Date(lastSavedByProject[p.id]).toLocaleString() : 'No saves yet'}
            </div>
          ))}
        </div>
      )}

      {message && <p className="text-sm text-amber-300">{message}</p>}
      <p className="text-xs text-zinc-500">
        Snapshot includes client/project details, basket rows, VAT totals, and the active tab. CSV/JSON export can be added
        later if you want.
      </p>
    </section>
  );
}
