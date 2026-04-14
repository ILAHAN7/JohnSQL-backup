import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X } from "lucide-react"
import type { MarketFilters, MarketCategory, SortOption } from "@/types/market"
import { CATEGORY_LABELS } from "@/types/market"

interface FilterBarProps {
    filters: MarketFilters
    onChange: (filters: MarketFilters) => void
}

const TYPE_OPTIONS = [
    { value: undefined,  label: "All" },
    { value: "SELL",     label: "For Sale" },
    { value: "BUY",      label: "Wanted" },
] as const

const CATEGORY_OPTIONS: { value: MarketCategory | undefined; label: string }[] = [
    { value: undefined,       label: "All Categories" },
    { value: "ELECTRONICS",   label: CATEGORY_LABELS.ELECTRONICS },
    { value: "TEXTBOOKS",     label: CATEGORY_LABELS.TEXTBOOKS },
    { value: "FURNITURE",     label: CATEGORY_LABELS.FURNITURE },
    { value: "CLOTHING",      label: CATEGORY_LABELS.CLOTHING },
    { value: "APPLIANCES",    label: CATEGORY_LABELS.APPLIANCES },
    { value: "OTHER",         label: CATEGORY_LABELS.OTHER },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "newest",      label: "Newest" },
    { value: "oldest",      label: "Oldest" },
    { value: "price_asc",   label: "Price: Low to High" },
    { value: "price_desc",  label: "Price: High to Low" },
]

export function FilterBar({ filters, onChange }: FilterBarProps) {
    const hasActiveFilters = filters.type || filters.category || filters.search || filters.sort

    return (
        <div className="space-y-3">
            {/* Search + Sort row */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search listings..."
                        className="pl-9 pr-9"
                        value={filters.search || ""}
                        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
                    />
                    {filters.search && (
                        <button
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => onChange({ ...filters, search: undefined })}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={filters.sort || "newest"}
                    onChange={(e) => onChange({ ...filters, sort: e.target.value as SortOption })}
                >
                    {SORT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>

            {/* Type + Category pills */}
            <div className="flex gap-2 flex-wrap items-center">
                {/* Type filter */}
                <div className="flex gap-1">
                    {TYPE_OPTIONS.map(opt => (
                        <button
                            key={String(opt.value)}
                            onClick={() => onChange({ ...filters, type: opt.value as MarketFilters["type"] })}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                filters.type === opt.value
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <div className="h-4 w-px bg-border mx-1" />

                {/* Category filter */}
                <div className="flex gap-1 flex-wrap">
                    {CATEGORY_OPTIONS.map(opt => (
                        <button
                            key={String(opt.value)}
                            onClick={() => onChange({ ...filters, category: opt.value })}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                filters.category === opt.value
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {hasActiveFilters && (
                    <>
                        <div className="h-4 w-px bg-border mx-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => onChange({ campus: filters.campus })}
                        >
                            <X className="h-3 w-3 mr-1" />
                            Clear
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}
