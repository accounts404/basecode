import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FolderOpen, 
  Plus, 
  Archive, 
  ChevronRight,
  Inbox,
  CheckCircle2
} from 'lucide-react';

const defaultColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export default function ProjectSidebar({ 
  projects, 
  tasks,
  selectedProjectId, 
  onSelectProject, 
  onCreateProject,
  showArchived = false,
  onToggleArchived
}) {
  const activeProjects = projects.filter(p => p.status === 'active');
  const archivedProjects = projects.filter(p => p.status === 'archived');

  const getProjectStats = (projectId) => {
    const projectTasks = tasks.filter(t => t.project_id === projectId);
    const completed = projectTasks.filter(t => t.status === 'completed').length;
    const total = projectTasks.length;
    return { completed, total, pending: total - completed };
  };

  const getTasksWithoutProject = () => {
    return tasks.filter(t => !t.project_id);
  };

  const tasksWithoutProject = getTasksWithoutProject();
  const pendingWithoutProject = tasksWithoutProject.filter(t => t.status !== 'completed').length;

  return (
    <div className="h-full flex flex-col bg-white border-r">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-600" />
            Proyectos
          </h2>
          <Button size="sm" variant="ghost" onClick={onCreateProject}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Project List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* All Tasks (no project filter) */}
          <button
            onClick={() => onSelectProject(null)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
              selectedProjectId === null 
                ? 'bg-blue-100 text-blue-900' 
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              <span className="font-medium">Todas las Tareas</span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {tasks.filter(t => t.status !== 'completed').length}
            </Badge>
          </button>

          {/* Tasks without project */}
          <button
            onClick={() => onSelectProject('none')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
              selectedProjectId === 'none' 
                ? 'bg-slate-200 text-slate-900' 
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-400" />
              <span className="text-sm">Sin Proyecto</span>
            </div>
            {pendingWithoutProject > 0 && (
              <Badge variant="secondary" className="text-xs">
                {pendingWithoutProject}
              </Badge>
            )}
          </button>

          {/* Divider */}
          <div className="border-t my-2" />

          {/* Active Projects */}
          {activeProjects.map(project => {
            const stats = getProjectStats(project.id);
            const isSelected = selectedProjectId === project.id;
            
            return (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                  isSelected 
                    ? 'bg-blue-100 text-blue-900' 
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: project.color || '#3b82f6' }}
                  />
                  <span className="font-medium truncate">{project.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {stats.total > 0 && (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span className="text-xs text-slate-500">
                        {stats.completed}/{stats.total}
                      </span>
                    </div>
                  )}
                  {stats.pending > 0 && (
                    <Badge 
                      variant="secondary" 
                      className="text-xs"
                      style={{ 
                        backgroundColor: `${project.color || '#3b82f6'}20`,
                        color: project.color || '#3b82f6'
                      }}
                    >
                      {stats.pending}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}

          {activeProjects.length === 0 && (
            <div className="text-center py-6 text-slate-500 text-sm">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>No hay proyectos activos</p>
              <Button 
                size="sm" 
                variant="ghost" 
                className="mt-2"
                onClick={onCreateProject}
              >
                <Plus className="w-4 h-4 mr-1" />
                Crear Proyecto
              </Button>
            </div>
          )}

          {/* Archived Projects */}
          {archivedProjects.length > 0 && (
            <>
              <div className="border-t my-2" />
              <button
                onClick={onToggleArchived}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg"
              >
                <Archive className="w-4 h-4" />
                <span>Archivados ({archivedProjects.length})</span>
                <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${showArchived ? 'rotate-90' : ''}`} />
              </button>
              
              {showArchived && archivedProjects.map(project => {
                const stats = getProjectStats(project.id);
                
                return (
                  <button
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors opacity-60 ${
                      selectedProjectId === project.id 
                        ? 'bg-slate-200 text-slate-900' 
                        : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: project.color || '#94a3b8' }}
                      />
                      <span className="truncate">{project.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {stats.completed}/{stats.total}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}