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
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from 'lucide-react'; // Wait, Badge is not in lucide-react. I'll use a simple span or create a Badge component.
// Actually, I'll just use a styled span for now as I didn't create a Badge component.
import { ChevronDown, ChevronUp, Search, Trash2, Share2, FolderOpen } from 'lucide-react';

interface ProjectsListProps {
  onSelectProject?: (projectId: string) => void;
}

export function ProjectsList({ onSelectProject }: ProjectsListProps) {
  const { user } = useSupabaseAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [activeShareProject, setActiveShareProject] = useState<string | null>(null);
  const [shares, setShares] = useState<Record<string, ProjectShare[]>>({});
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const rows = await listProjectsForUser(user.id);
        setProjects(rows);
      } catch (err: any) {
        console.error(err);
        setError(`Could not load projects: ${err?.message || 'unknown error'}`);
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
    } catch (err: any) {
      console.error(err);
      setError(`Could not load shared users: ${err?.message || 'unknown error'}`);
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

  const projectCount = projects.length;

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Projects</CardTitle>
          <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
            {projectCount}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
        >
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CardHeader>

      {isOpen && (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {loading && <p className="text-xs text-muted-foreground whitespace-nowrap">Loading...</p>}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border">
            {filteredProjects.map((p) => (
              <Card key={p.id} className="bg-muted/30 border-l-4 border-l-transparent hover:border-l-primary transition-colors">
                <CardContent className="p-3 space-y-3">
                  <div className="flex flex-col gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate" title={p.name}>{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.client_name || 'No client'} • {p.isOwner ? 'Owner' : 'Shared'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {onSelectProject && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1 h-8 text-xs"
                          onClick={() => onSelectProject(p.id)}
                        >
                          <FolderOpen className="mr-2 h-3 w-3" />
                          Open
                        </Button>
                      )}
                      {p.isOwner && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => toggleSharePanel(p.id)}
                            title="Share"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(p.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {activeShareProject === p.id && p.isOwner && (
                    <div className="bg-background rounded-lg p-3 space-y-3 border animate-in slide-in-from-top-2">
                      <div className="flex gap-2">
                        <Input
                          className="flex-1 h-8 text-xs"
                          placeholder="Email to share"
                          value={shareEmail}
                          onChange={(e) => setShareEmail(e.target.value)}
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => handleShare(p.id)}
                          disabled={!shareEmail.trim()}
                        >
                          Share
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">Shared with:</div>
                        {(shares[p.id] ?? []).length === 0 && (
                          <div className="text-xs text-muted-foreground italic">No shared users yet.</div>
                        )}
                        {(shares[p.id] ?? []).map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-xs bg-muted/50 p-2 rounded">
                            <span className="truncate max-w-[120px]" title={s.shared_with_email || s.shared_with_user_id}>
                              {s.shared_with_email || s.shared_with_user_id}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleUnshare(p.id, s.id)}
                            >
                              <span className="sr-only">Remove</span>
                              &times;
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {!filteredProjects.length && !loading && (
              <p className="text-sm text-muted-foreground text-center py-4">No projects found.</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
