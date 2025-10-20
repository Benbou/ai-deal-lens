import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Download, Trash2, MoreHorizontal, CheckCircle, Clock, Loader, AlertCircle } from "lucide-react";
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

// Format sector to show only first tag
const formatSector = (sector?: string): string => {
  if (!sector) return '-';
  // Extract first tag before "/" or "-"
  const firstTag = sector.split(/[\/\-]/)[0].trim();
  return firstTag;
};

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
      const solution = (row.original.solution_summary || '').toLowerCase();
      return companyName.includes(searchValue) || solution.includes(searchValue);
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
    accessorKey: "sector",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Secteur" />
    ),
    cell: ({ row }) => {
      return (
        <Badge variant="secondary" className="font-normal">
          {formatSector(row.getValue("sector"))}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "solution_summary",
    header: "Résumé",
    cell: ({ row }) => {
      const summary = row.getValue("solution_summary") as string;
      if (!summary) return <span className="text-muted-foreground">-</span>;
      return (
        <div className="max-w-[400px]">
          <p className="text-sm line-clamp-2 leading-relaxed">
            {summary}
          </p>
        </div>
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
        <div className="font-medium text-green-600 dark:text-green-400">+{value.toFixed(0)}%</div>
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
        <div className="font-medium text-green-600 dark:text-green-400">+{value.toFixed(0)}%</div>
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
      
      const statusConfig = {
        pending: { 
          label: "En attente", 
          variant: "outline" as const,
          icon: Clock,
          className: "whitespace-nowrap bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200"
        },
        processing: { 
          label: "En cours", 
          variant: "default" as const,
          icon: Loader,
          className: "whitespace-nowrap animate-pulse bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
        },
        completed: { 
          label: "Analysé", 
          variant: "outline" as const,
          icon: CheckCircle,
          className: "whitespace-nowrap bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
        },
        failed: { 
          label: "Échoué", 
          variant: "outline" as const,
          icon: AlertCircle,
          className: "whitespace-nowrap bg-red-50 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-200"
        },
      };
      
      const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
      const Icon = config.icon;
      
      return (
        <Badge variant={config.variant} className={config.className}>
          <Icon className="mr-1 h-3 w-3" />
          {config.label}
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
