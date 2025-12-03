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
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { LogOut, Save, Download, RefreshCw, Plus } from 'lucide-react';

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
      } catch (err: any) {
        console.error(err);
        setMessage(`Could not load projects from Supabase: ${err?.message || 'unknown error'}`);
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
      const createdAt = await saveCalculation(selectedProjectId, snapshot, { id: user?.id ?? '', email: user?.email });
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Supabase Projects</CardTitle>
          <p className="text-sm text-muted-foreground">Login required. All data is saved per user.</p>
        </div>
        <Button variant="ghost" size="sm" className="text-amber-500 hover:text-amber-600" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="grid md:grid-cols-3 gap-3" onSubmit={handleCreateProject}>
          <Input
            placeholder="Project name"
            value={projectForm.name}
            onChange={(e) => setProjectForm((v) => ({ ...v, name: e.target.value }))}
            required
          />
          <Input
            placeholder="Client (optional)"
            value={projectForm.client_name}
            onChange={(e) => setProjectForm((v) => ({ ...v, client_name: e.target.value }))}
          />
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="Site address (optional)"
              value={projectForm.site_address}
              onChange={(e) => setProjectForm((v) => ({ ...v, site_address: e.target.value }))}
            />
            <Button type="submit" disabled={loading}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </form>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className='flex-1 w-full'>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div className="text-xs text-emerald-500 mt-1">
                Last saved: {new Date(lastSavedByProject[selectedProjectId]).toLocaleString()}
              </div>
            )}
          </div>

          <div className='flex gap-2 w-full md:w-auto'>
            <Button
              variant="outline"
              onClick={loadFromSupabase}
              disabled={loading}
              className='flex-1 md:flex-none'
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Load
            </Button>
            <Button
              variant="default"
              onClick={saveToSupabase}
              disabled={loading}
              className='flex-1 md:flex-none'
            >
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={exportPdf}
              disabled={loading || !selectedProjectId}
              className='flex-1 md:flex-none'
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto border rounded p-2">
            {projects.map((p) => (
              <div key={p.id} className='flex justify-between py-1 border-b last:border-0 border-border/50'>
                <span>{p.name}</span>
                <span className='text-muted-foreground/70'>{lastSavedByProject[p.id] ? new Date(lastSavedByProject[p.id]).toLocaleDateString() : 'No saves'}</span>
              </div>
            ))}
          </div>
        )}

        {message && <p className="text-sm text-amber-500 font-medium">{message}</p>}
        <p className="text-xs text-muted-foreground">
          Snapshot includes client/project details, basket rows, VAT totals, and the active tab. CSV/JSON export can be added
          later if you want.
        </p>
      </CardContent>
    </Card>
  );
}
