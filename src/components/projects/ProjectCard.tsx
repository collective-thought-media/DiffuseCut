"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectListItem } from "@/lib/project-preview";
import { deleteProjectRequest } from "@/lib/api/delete-project";
import { CharacterCardThumbnail } from "@/components/characters/CharacterCardThumbnail";
import { Badge, Button, Card } from "@/components/ui/button";

interface ProjectCardProps {
  project: ProjectListItem;
  onDeleted?: () => void;
}

export function ProjectCard({ project, onDeleted }: ProjectCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const previewItems = project.previewPaths.map((referencePath) => ({
    referencePath,
    referenceKind: "image" as const,
  }));

  async function handleDelete(e: React.MouseEvent, deleteMedia: boolean) {
    e.preventDefault();
    e.stopPropagation();

    const keepMediaMessage = `Remove "${project.name}" from DiffuseCut? All media will stay on disk in the project folder.`;
    const deleteAllMessage = `Delete "${project.name}" and all media from disk? This cannot be undone.`;
    if (!confirm(deleteMedia ? deleteAllMessage : keepMediaMessage)) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteProjectRequest(project.id, deleteMedia);
      if (!result.ok) {
        alert(result.error);
        return;
      }

      if (!deleteMedia && result.data.keptMediaPath) {
        alert(
          `Project removed from DiffuseCut.\n\nMedia kept at:\n${result.data.keptMediaPath}`
        );
      }

      if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <Link href={`/projects/${project.id}`} className="group block flex-1">
        <div className="overflow-hidden">
          <div className="transition duration-500 group-hover:scale-[1.02]">
            <CharacterCardThumbnail
              projectId={project.id}
              characterName={project.name}
              previewItems={previewItems}
              variantCount={project.previewPaths.length}
              animateMultipleSources
              variantLabel="frames"
              aspectClassName="aspect-video"
            />
          </div>
        </div>

        <div className="flex flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium leading-tight group-hover:text-primary">
              {project.name}
            </h3>
            <Badge className="shrink-0">{project.defaultFps} fps</Badge>
          </div>

          {project.logline ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {project.logline}
            </p>
          ) : (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {"\u00A0"}
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Updated {new Date(project.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </Link>

      <div className="flex flex-wrap gap-2 border-t border-neutral-800 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          disabled={deleting}
          onClick={(e) => void handleDelete(e, false)}
        >
          Remove, keep media
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-400 hover:text-red-300"
          disabled={deleting}
          onClick={(e) => void handleDelete(e, true)}
        >
          Delete project and media
        </Button>
      </div>
    </Card>
  );
}
