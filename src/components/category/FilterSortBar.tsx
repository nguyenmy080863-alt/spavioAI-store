import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";
import { CATEGORIES } from "@/data/products";
import { useProductText } from "@/i18n/useProductText";
import { SlidersHorizontal, RotateCcw } from "lucide-react";

interface FilterSortBarProps {
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  itemCount: number;
  selectedCategories: string[];
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  selectedPriceRanges: string[];
  setSelectedPriceRanges: React.Dispatch<React.SetStateAction<string[]>>;
  selectedStyles: string[];
  setSelectedStyles: React.Dispatch<React.SetStateAction<string[]>>;
  sortBy: string;
  setSortBy: (sort: string) => void;
  onClearAll: () => void;
}

const FilterSortBar = ({
  filtersOpen,
  setFiltersOpen,
  itemCount,
  selectedCategories,
  setSelectedCategories,
  selectedPriceRanges,
  setSelectedPriceRanges,
  selectedStyles,
  setSelectedStyles,
  sortBy,
  setSortBy,
  onClearAll,
}: FilterSortBarProps) => {
  const { t } = useTranslation("shop");
  const { categoryLabel } = useProductText();

  const categories = [...CATEGORIES];
  const priceRanges = ["Under €100", "€100 - €200", "€200+"];
  const priceRangeKeys: Record<string, string> = { "Under €100": "under100", "€100 - €200": "from100to200", "€200+": "over200" };
  const styles = ["LED", "Microcurrent", "Radiofrequency", "Ionic", "Cordless"];

  const activeFiltersCount =
    selectedCategories.length +
    selectedPriceRanges.length +
    selectedStyles.length;

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const togglePriceRange = (range: string) => {
    setSelectedPriceRanges((prev) =>
      prev.includes(range) ? prev.filter((r) => r !== range) : [...prev, range]
    );
  };

  const toggleStyle = (style: string) => {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  return (
    <>
      <section className="w-full px-6 mb-8 border-b border-border pb-4 font-sans">
        <div className="flex justify-between items-center">
          <p className="text-sm font-light text-muted-foreground">
            {t("filterSort.itemCount", { count: itemCount })}
          </p>

          <div className="flex items-center gap-4">
            {/* Filter Drawer */}
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-normal flex items-center gap-2 hover:bg-accent/10"
                >
                  <SlidersHorizontal size={14} />
                  <span>{t("filterSort.filters")}</span>
                  {activeFiltersCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-accent text-accent-foreground font-semibold rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 sm:w-96 bg-background border-l border-border p-6 overflow-y-auto">
                <SheetHeader className="mb-6 border-b border-border pb-4 flex flex-row items-center justify-between">
                  <SheetTitle className="text-lg font-serif font-normal">
                    {t("filterSort.filters")}
                  </SheetTitle>
                  {activeFiltersCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearAll}
                      className="text-xs text-accent hover:text-accent/80 p-0 h-auto font-sans flex items-center gap-1"
                    >
                      <RotateCcw size={12} />
                      <span>{t("filterSort.clearAll") || "Reset"}</span>
                    </Button>
                  )}
                </SheetHeader>

                <div className="space-y-8">
                  {/* Category Filter */}
                  <div>
                    <h3 className="text-sm font-medium mb-4 text-foreground uppercase tracking-wider text-xs">
                      {t("filterSort.category")}
                    </h3>
                    <div className="space-y-3">
                      {categories.map((cat) => (
                        <div key={cat} className="flex items-center space-x-3">
                          <Checkbox
                            id={`cat-${cat}`}
                            checked={selectedCategories.includes(cat)}
                            onCheckedChange={() => toggleCategory(cat)}
                            className="border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-foreground"
                          />
                          <Label
                            htmlFor={`cat-${cat}`}
                            className="text-sm font-normal text-foreground cursor-pointer hover:text-accent transition-colors"
                          >
                            {categoryLabel(cat)}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator className="border-border/60" />

                  {/* Price Filter */}
                  <div>
                    <h3 className="text-sm font-medium mb-4 text-foreground uppercase tracking-wider text-xs">
                      {t("filterSort.price")}
                    </h3>
                    <div className="space-y-3">
                      {priceRanges.map((range) => (
                        <div key={range} className="flex items-center space-x-3">
                          <Checkbox
                            id={`price-${range}`}
                            checked={selectedPriceRanges.includes(range)}
                            onCheckedChange={() => togglePriceRange(range)}
                            className="border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-foreground"
                          />
                          <Label
                            htmlFor={`price-${range}`}
                            className="text-sm font-normal text-foreground cursor-pointer hover:text-accent transition-colors"
                          >
                            {t(`filterSort.priceRanges.${priceRangeKeys[range]}`, { defaultValue: range })}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator className="border-border/60" />

                  {/* Style Filter */}
                  <div>
                    <h3 className="text-sm font-medium mb-4 text-foreground uppercase tracking-wider text-xs">
                      {t("filterSort.style")}
                    </h3>
                    <div className="space-y-3">
                      {styles.map((style) => (
                        <div key={style} className="flex items-center space-x-3">
                          <Checkbox
                            id={`style-${style}`}
                            checked={selectedStyles.includes(style)}
                            onCheckedChange={() => toggleStyle(style)}
                            className="border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-foreground"
                          />
                          <Label
                            htmlFor={`style-${style}`}
                            className="text-sm font-normal text-foreground cursor-pointer hover:text-accent transition-colors"
                          >
                            {style}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator className="border-border/60" />

                  <div className="flex flex-col gap-3 pt-2">
                    <Button
                      onClick={() => setFiltersOpen(false)}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary-hover text-xs font-semibold uppercase tracking-wider py-3"
                    >
                      {t("filterSort.applyFilters") || "Apply Filters"} ({itemCount})
                    </Button>
                    {activeFiltersCount > 0 && (
                      <Button
                        variant="outline"
                        onClick={onClearAll}
                        className="w-full text-xs font-normal border-border hover:bg-secondary/40"
                      >
                        {t("filterSort.clearAll") || "Clear All Filters"}
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-auto border-none bg-transparent text-sm font-normal shadow-none rounded-none pr-2 hover:text-accent transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="shadow-lg border border-border rounded-sm bg-background">
                <SelectItem value="featured" className="text-xs font-sans">
                  {t("filterSort.sort.featured")}
                </SelectItem>
                <SelectItem value="price-low" className="text-xs font-sans">
                  {t("filterSort.sort.priceLow")}
                </SelectItem>
                <SelectItem value="price-high" className="text-xs font-sans">
                  {t("filterSort.sort.priceHigh")}
                </SelectItem>
                <SelectItem value="newest" className="text-xs font-sans">
                  {t("filterSort.sort.newest")}
                </SelectItem>
                <SelectItem value="name" className="text-xs font-sans">
                  {t("filterSort.sort.name")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </>
  );
};

export default FilterSortBar;