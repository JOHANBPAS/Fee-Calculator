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
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Supabase Projects</CardTitle>
          <p className="text-sm text-muted-foreground">Cloud sync & backup</p>
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="flex flex-col gap-3" onSubmit={handleCreateProject}>
          <div className="grid gap-3">
            <Input
              placeholder="Project name"
              value={projectForm.name}
              onChange={(e) => setProjectForm((v) => ({ ...v, name: e.target.value }))}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Client (opt)"
                value={projectForm.client_name}
                onChange={(e) => setProjectForm((v) => ({ ...v, client_name: e.target.value }))}
              />
              <Input
                placeholder="Address (opt)"
                value={projectForm.site_address}
                onChange={(e) => setProjectForm((v) => ({ ...v, site_address: e.target.value }))}
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Create New Project
          </Button>
        </form>

        <div className="space-y-3 pt-4 border-t">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Active Project</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                props.onProjectSelected?.(e.target.value);
              }}
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {selectedProjectId && lastSavedByProject[selectedProjectId] && (
              <div className="text-xs text-primary flex items-center gap-1">
                <Save className="h-3 w-3" />
                Saved: {new Date(lastSavedByProject[selectedProjectId]).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadFromSupabase}
              disabled={loading}
              className="w-full px-2"
              title="Load from Cloud"
            >
              <RefreshCw className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Load</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={saveToSupabase}
              disabled={loading}
              className="w-full px-2"
              title="Save to Cloud"
            >
              <Save className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Save</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportPdf}
              disabled={loading || !selectedProjectId}
              className="w-full px-2"
              title="Export PDF"
            >
              <Download className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">PDF</span>
            </Button>
          </div>
        </div>

        {message && <p className="text-sm text-primary font-medium bg-primary/10 p-2 rounded">{message}</p>}
      </CardContent>
    </Card>
  );
}
