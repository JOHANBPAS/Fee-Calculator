import React, { useEffect, useMemo, useState } from 'react';
import { useSupabaseAuth } from '../providers/SupabaseAuthProvider';
import {
  listProjectsForUser,
  deleteProject,
  shareProjectByEmail,
  listProjectShares,
  unshareProject,
  type ProjectRow,
  type ProjectShare,
} from '../services/supabaseService';

interface ProjectsListProps {
  onSelectProject?: (projectId: string) => void;
}

/**
 * Projects list with:
 * - Owned + shared projects
 * - Client-side search by name / client
 * - Owners: share/unshare via email, delete
 */
export function ProjectsList({ onSelectProject }: ProjectsListProps) {
  const { user } = useSupabaseAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [activeShareProject, setActiveShareProject] = useState<string | null>(null);
  const [shares, setShares] = useState<Record<string, ProjectShare[]>>({});

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const rows = await listProjectsForUser(user.id);
        setProjects(rows);
      } catch (err) {
        console.error(err);
        setError('Could not load projects.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filteredProjects = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return projects.filter((p) => {
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || (p.client_name || '').toLowerCase().includes(term);
    });
  }, [projects, searchTerm]);

  const handleDelete = async (projectId: string) => {
    if (!window.confirm('Delete this project and all its calculations? This cannot be undone.')) return;
    try {
      await deleteProject(projectId); // RLS enforces owner-only
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error(err);
      setError('Delete failed.');
    }
  };

  const loadShares = async (projectId: string) => {
    try {
      const rows = await listProjectShares(projectId);
      setShares((prev) => ({ ...prev, [projectId]: rows }));
    } catch (err) {
      console.error(err);
      setError('Could not load shared users.');
    }
  };

  const handleShare = async (projectId: string) => {
    try {
      await shareProjectByEmail(projectId, shareEmail.trim());
      setShareEmail('');
      await loadShares(projectId);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Share failed.');
    }
  };

  const handleUnshare = async (projectId: string, shareId: string) => {
    try {
      await unshareProject(shareId);
      await loadShares(projectId);
    } catch (err) {
      console.error(err);
      setError('Unshare failed.');
    }
  };

  const toggleSharePanel = async (projectId: string) => {
    if (activeShareProject === projectId) {
      setActiveShareProject(null);
      return;
    }
    setActiveShareProject(projectId);
    await loadShares(projectId);
  };

  return (
    <section className="p-4 bg-zinc-900 rounded-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Projects</h2>
        <input
          className="bg-zinc-800 rounded-xl px-3 py-2 text-sm w-72"
          placeholder="Search by project or client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-zinc-400">Loading projects...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {filteredProjects.map((p) => (
          <div key={p.id} className="bg-zinc-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{p.name}</div>
                <div className="text-sm text-zinc-400">
                  {p.client_name || 'No client'} • {p.isOwner ? 'Owner' : 'Shared with you'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onSelectProject && (
                  <button
                    className="px-3 py-2 bg-amber-400 text-zinc-900 rounded-lg text-sm"
                    onClick={() => onSelectProject(p.id)}
                  >
                    Open
                  </button>
                )}
                {p.isOwner && (
                  <>
                    <button
                      className="px-3 py-2 bg-zinc-700 text-white rounded-lg text-sm"
                      onClick={() => toggleSharePanel(p.id)}
                    >
                      {activeShareProject === p.id ? 'Close Sharing' : 'Share'}
                    </button>
                    <button
                      className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm"
                      onClick={() => handleDelete(p.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {activeShareProject === p.id && p.isOwner && (
              <div className="bg-zinc-900 rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-sm"
                    placeholder="User email to share with"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                  />
                  <button
                    className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm"
                    onClick={() => handleShare(p.id)}
                    disabled={!shareEmail.trim()}
                  >
                    Share
                  </button>
                </div>
                <div className="text-sm text-zinc-400">Shared with:</div>
                <div className="space-y-1">
                  {(shares[p.id] ?? []).length === 0 && (
                    <div className="text-xs text-zinc-500">No shared users yet.</div>
                  )}
                  {(shares[p.id] ?? []).map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span>{s.shared_with_email || s.shared_with_user_id}</span>
                      <button
                        className="text-red-400 text-xs"
                        onClick={() => handleUnshare(p.id, s.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {!filteredProjects.length && !loading && (
          <p className="text-sm text-zinc-500">No projects found.</p>
        )}
      </div>
    </section>
  );
}
