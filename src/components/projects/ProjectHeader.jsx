import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  FolderOpen, 
  Settings, 
  CheckCircle2, 
  Clock,
  Archive,
  Inbox
} from 'lucide-react';

export default function ProjectHeader({ 
  project, 
  tasks, 
  onEditProject,
  selectedProjectId 
}) {
  // Calculate stats
  const projectTasks = selectedProjectId === 'none' 
    ? tasks.filter(t => !t.project_id)
    : selectedProjectId 
      ? tasks.filter(t => t.project_id === selectedProjectId)
      : tasks;

  const completed = projectTasks.filter(t => t.status === 'completed').length;
  const pending = projectTasks.filter(t => t.status === 'pending').length;
  const inProgress = projectTasks.filter(t => t.status === 'in_progress').length;
  const total = projectTasks.length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // No project selected - show all tasks view
  if (selectedProjectId === null) {
    return (
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Inbox className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Todas las Tareas</h1>
              <p className="text-sm text-slate-500">
                {total} tareas en total • {pending + inProgress} pendientes
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No project filter (tasks without project)
  if (selectedProjectId === 'none') {
    return (
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <FolderOpen className="w-6 h-6 text-slate-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Sin Proyecto</h1>
              <p className="text-sm text-slate-500">
                {total} tareas sin proyecto asignado
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Project view
  if (!project) return null;

  return (
    <div className="bg-white border-b px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${project.color}20` }}
          >
            <FolderOpen 
              className="w-6 h-6" 
              style={{ color: project.color }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
              {project.status === 'archived' && (
                <Badge variant="secondary" className="bg-slate-100">
                  <Archive className="w-3 h-3 mr-1" />
                  Archivado
                </Badge>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-slate-500">{project.description}</p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onEditProject}>
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm">
              <strong>{completed}</strong> completadas
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm">
              <strong>{pending + inProgress}</strong> pendientes
            </span>
          </div>
        </div>
        
        <div className="flex-1 max-w-xs">
          <div className="flex items-center gap-2">
            <Progress value={progressPercent} className="h-2" />
            <span className="text-sm font-medium text-slate-600 w-12">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}