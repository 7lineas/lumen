import { useRef, useState } from "react";
import { Download, EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  label: string;
  testId: string;
  editLabel: string;
  onEdit: (row: HTMLElement) => void;
  onDownload?: () => void;
  onDelete: () => void;
}

export function ItemMenu({
  label,
  testId,
  editLabel,
  onEdit,
  onDownload,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        ref={triggerRef}
        className={open ? "lx-ghost on" : "lx-ghost"}
        aria-label={`Más opciones de ${label}`}
        title="Más opciones"
        data-testid={testId}
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            onEdit(triggerRef.current!.closest(".lx-item") as HTMLElement)
          }
        >
          <Pencil /> {editLabel}
        </DropdownMenuItem>
        {onDownload && (
          <DropdownMenuItem onClick={onDownload}>
            <Download /> Descargar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
