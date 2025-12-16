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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface MemoContent {
  markdown?: string;
  montant_leve?: string;
  valorisation?: string;
  arr?: string;
  mrr?: string;
}

export interface Deal {
  id: string;
  startup_name: string;
  company_name?: string | null;
  sector: string;
  stage?: string | null;
  amount_raised_cents?: number | null;
  pre_money_valuation_cents?: number | null;
  current_arr_cents?: number | null;
  yoy_growth_percent?: number | null;
  mom_growth_percent?: number | null;
  status: string | null;
  solution_summary?: string | null;
  recommandation?: string | null;
  memo_content?: MemoContent | Record<string, unknown> | null;
  deck_files?: { storage_path: string; file_name: string }[];
  analyses?: { status: string }[];
}

// Helper to safely get memo content values
const getMemoValue = (deal: Deal, key: keyof MemoContent): string | undefined => {
  if (!deal.memo_content || typeof deal.memo_content !== 'object') return undefined;
  return (deal.memo_content as MemoContent)[key];
};

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
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Résumé" />
    ),
    cell: ({ row }) => {
      const summary = row.getValue("solution_summary") as string;
      if (!summary) return <span className="text-muted-foreground">-</span>;
      return (
        <HoverCard>
          <HoverCardTrigger asChild>
            <div className="max-w-[600px] cursor-help">
              <p className="text-sm line-clamp-3 leading-relaxed">{summary}</p>
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="w-96">
            <p className="text-sm leading-relaxed">{summary}</p>
          </HoverCardContent>
        </HoverCard>
      );
    },
  },
  {
    id: "montant_leve",
    accessorFn: (row) => getMemoValue(row, 'montant_leve') || row.amount_raised_cents,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Levée" />
    ),
    cell: ({ row }) => {
      const deal = row.original;
      const value = getMemoValue(deal, 'montant_leve') || formatCurrency(deal.amount_raised_cents ?? undefined);
      return <div className="font-medium">{value}</div>;
    },
  },
  {
    id: "valorisation",
    accessorFn: (row) => getMemoValue(row, 'valorisation') || row.pre_money_valuation_cents,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Valorisation" />
    ),
    cell: ({ row }) => {
      const deal = row.original;
      const value = getMemoValue(deal, 'valorisation') || formatCurrency(deal.pre_money_valuation_cents ?? undefined);
      return <div className="font-medium">{value}</div>;
    },
  },
  {
    id: "arr",
    accessorFn: (row) => getMemoValue(row, 'arr') || row.current_arr_cents,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ARR" />
    ),
    cell: ({ row }) => {
      const deal = row.original;
      const value = getMemoValue(deal, 'arr') || formatCurrency(deal.current_arr_cents ?? undefined);
      return <div className="font-medium">{value}</div>;
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
    accessorKey: "recommandation",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Recommandation" />
    ),
    cell: ({ row }) => {
      const deal = row.original;
      const recommandation = deal.recommandation;
      const status = deal.status;
      
      // If no recommandation, show status
      if (!recommandation) {
        const statusConfig = {
          pending: { 
            label: "En analyse", 
            icon: Loader,
            className: "whitespace-nowrap animate-pulse bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
          },
          error: { 
            label: "Erreur", 
            icon: AlertCircle,
            className: "whitespace-nowrap bg-red-50 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-200"
          },
          completed: { 
            label: "Analysé", 
            icon: CheckCircle,
            className: "whitespace-nowrap bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          },
        };
        
        const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
        const Icon = config.icon;
        
        return (
          <Badge variant="outline" className={config.className}>
            <Icon className="mr-1 h-3 w-3" />
            {config.label}
          </Badge>
        );
      }
      
      // Show recommandation badge
      const recommandationConfig: Record<string, { className: string }> = {
        'GO': { 
          className: "whitespace-nowrap bg-green-500 text-white hover:bg-green-600"
        },
        'GO Conditionnel': { 
          className: "whitespace-nowrap bg-orange-500 text-white hover:bg-orange-600"
        },
        'NO GO': { 
          className: "whitespace-nowrap bg-red-500 text-white hover:bg-red-600"
        },
      };
      
      const config = recommandationConfig[recommandation] || { className: "whitespace-nowrap bg-muted" };
      
      return (
        <Badge className={config.className}>
          {recommandation}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      const deal = row.original;
      const recommandation = deal.recommandation || deal.status;
      return value.includes(recommandation);
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
