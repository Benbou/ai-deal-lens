import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Download, Trash2, MoreHorizontal, CheckCircle } from "lucide-react";
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
  company_name?: string;
  sector: string;
  stage?: string;
  amount_raised_cents?: number;
  pre_money_valuation_cents?: number;
  current_arr_cents?: number;
  yoy_growth_percent?: number;
  mom_growth_percent?: number;
  status: string;
  solution_summary?: string;
  deck_files?: { storage_path: string; file_name: string }[];
  analyses?: { status: string }[];
}

const formatCurrency = (cents?: number) => {
  if (!cents) return "-";
  const millions = cents / 100 / 1000000;
  return `€${millions.toFixed(1)}M`;
};

export const createColumns = (
  onView: (id: string) => void,
  onDownload: (deal: Deal, e: React.MouseEvent) => void,
  onDelete: (dealId: string, deal: Deal) => void,
  deleting: string | null
): ColumnDef<Deal>[] => [
  {
    accessorKey: "company_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Entreprise" />
    ),
    cell: ({ row }) => {
      const deal = row.original;
      const displayName = deal.company_name || deal.startup_name;
      
      return (
        <div className="max-w-[300px]">
          <div
            className="font-semibold hover:underline cursor-pointer mb-1"
            onClick={() => onView(deal.id)}
          >
            {displayName}
          </div>
          {deal.solution_summary && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {deal.solution_summary}
            </p>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "sector",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Secteur" />
    ),
    cell: ({ row }) => {
      return (
        <Badge variant="outline" className="text-xs">
          {row.getValue("sector")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "stage",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stage" />
    ),
    cell: ({ row }) => {
      const stage = row.getValue("stage") as string | undefined;
      return stage ? (
        <Badge variant="outline" className="text-xs">
          {stage}
        </Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
  {
    accessorKey: "amount_raised_cents",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Levé" />
    ),
    cell: ({ row }) => {
      return (
        <div className="font-medium">
          {formatCurrency(row.getValue("amount_raised_cents"))}
        </div>
      );
    },
  },
  {
    accessorKey: "pre_money_valuation_cents",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Valorisation" />
    ),
    cell: ({ row }) => {
      return (
        <div className="font-medium">
          {formatCurrency(row.getValue("pre_money_valuation_cents"))}
        </div>
      );
    },
  },
  {
    accessorKey: "current_arr_cents",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ARR" />
    ),
    cell: ({ row }) => {
      return (
        <div className="font-medium">
          {formatCurrency(row.getValue("current_arr_cents"))}
        </div>
      );
    },
  },
  {
    accessorKey: "yoy_growth_percent",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="YoY" />
    ),
    cell: ({ row }) => {
      const value = row.getValue("yoy_growth_percent") as number | undefined;
      return value !== undefined && value !== null ? (
        <div className="font-medium text-success">+{value.toFixed(0)}%</div>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
  {
    accessorKey: "mom_growth_percent",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="MoM" />
    ),
    cell: ({ row }) => {
      const value = row.getValue("mom_growth_percent") as number | undefined;
      return value !== undefined && value !== null ? (
        <div className="font-medium text-success">+{value.toFixed(0)}%</div>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      
      if (status === "processing") {
        return (
          <Badge className="bg-warning text-warning-foreground flex items-center gap-1 w-fit">
            Analyse en cours
            <span className="animate-pulse">...</span>
          </Badge>
        );
      }
      
      if (status === "completed") {
        return (
          <Badge className="bg-success text-success-foreground flex items-center gap-2 w-fit animate-fade-in">
            <CheckCircle className="h-3 w-3" />
            Analysé
          </Badge>
        );
      }
      
      if (status === "pending") {
        return <Badge variant="outline">En attente</Badge>;
      }
      
      if (status === "failed") {
        return <Badge variant="destructive">Échoué</Badge>;
      }
      
      return <Badge variant="outline">{status}</Badge>;
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
                      Cette action est irréversible. Cela supprimera définitivement le deal,
                      les analyses, les fichiers et toutes les données associées.
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
