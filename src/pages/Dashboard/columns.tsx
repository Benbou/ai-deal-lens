import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Download, Trash2, MoreHorizontal, CheckCircle, Loader } from "lucide-react";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface Deal {
  id: string;
  startup_name: string;
  company_name?: string | null;
  sector: string;
  stage?: string | null;
  status: string | null;
  memo_html?: string | null;
  deck_files?: { storage_path: string; file_name: string }[];
}

export const createColumns = (
  onView: (id: string) => void,
  onDownload: (deal: Deal, e: React.MouseEvent) => void,
  onDelete: (dealId: string, deal: Deal) => void,
  deleting: string | null
): ColumnDef<Deal>[] => [
  {
    id: "company_name",
    accessorFn: (row) => row.company_name || row.startup_name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Entreprise" />
    ),
    filterFn: (row, id, value) => {
      const searchValue = value.toLowerCase();
      const companyName = (row.original.company_name || row.original.startup_name || '').toLowerCase();
      return companyName.includes(searchValue);
    },
    cell: ({ row }) => {
      const deal = row.original;
      const displayName = deal.company_name || deal.startup_name;
      
      return (
        <div
          className="font-semibold hover:underline cursor-pointer"
          onClick={() => onView(deal.id)}
        >
          {displayName}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string | null;
      const isCompleted = status === 'completed';
      
      if (isCompleted) {
        return (
          <Badge className="whitespace-nowrap bg-green-500 text-white hover:bg-green-600">
            <CheckCircle className="mr-1 h-3 w-3" />
            Analysé
          </Badge>
        );
      }
      
      return (
        <Badge variant="outline" className="whitespace-nowrap animate-pulse bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <Loader className="mr-1 h-3 w-3" />
          En cours d'analyse
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const deal = row.original;
      
      return (
        <div className="flex items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Ouvrir le menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px] bg-popover">
              <DropdownMenuItem onClick={() => onView(deal.id)}>
                <Eye className="mr-2 h-4 w-4" />
                Voir détails
              </DropdownMenuItem>
              {deal.deck_files?.[0] && (
                <DropdownMenuItem onClick={(e) => onDownload(deal, e as any)}>
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                    disabled={deleting === deal.id}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. Cela supprimera définitivement le deal
                      et toutes les données associées.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(deal.id, deal)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer définitivement
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];