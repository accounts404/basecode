import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen, Inbox } from "lucide-react";

export default function ProjectSelector({ 
    projects, 
    selectedProjectId, 
    onSelect, 
    includeNoProject = true,
    includeAll = true,
    placeholder = "Filtrar por proyecto" 
}) {
    return (
        <Select value={selectedProjectId || "all"} onValueChange={onSelect}>
            <SelectTrigger className="w-full md:w-[250px]">
                <SelectValue placeholder={placeholder}>
                    {selectedProjectId === "all" && includeAll && (
                        <div className="flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-slate-500" />
                            Todos los proyectos
                        </div>
                    )}
                    {selectedProjectId === "no_project" && (
                        <div className="flex items-center gap-2">
                            <Inbox className="w-4 h-4 text-slate-500" />
                            Sin proyecto
                        </div>
                    )}
                    {selectedProjectId && selectedProjectId !== "all" && selectedProjectId !== "no_project" && (
                        <div className="flex items-center gap-2">
                            <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ 
                                    backgroundColor: projects.find(p => p.id === selectedProjectId)?.color || '#3b82f6' 
                                }}
                            />
                            {projects.find(p => p.id === selectedProjectId)?.name || 'Proyecto'}
                        </div>
                    )}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {includeAll && (
                    <SelectItem value="all">
                        <div className="flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-slate-500" />
                            Todos los proyectos
                        </div>
                    </SelectItem>
                )}
                {includeNoProject && (
                    <SelectItem value="no_project">
                        <div className="flex items-center gap-2">
                            <Inbox className="w-4 h-4 text-slate-500" />
                            Sin proyecto
                        </div>
                    </SelectItem>
                )}
                {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                            <div 
                                className="w-3 h-3 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: project.color || '#3b82f6' }}
                            />
                            <span className="truncate">{project.name}</span>
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}