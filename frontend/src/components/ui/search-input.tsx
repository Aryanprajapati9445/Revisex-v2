import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search notes…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-1 items-center", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 size-4 text-text-tertiary"
        strokeWidth={2}
        aria-hidden="true"
      />
      <label className="flex-1">
        <span className="sr-only">Search notes</span>
        <Input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pl-8 pr-8"
        />
      </label>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 flex size-5 items-center justify-center rounded-control text-text-tertiary hover:bg-surface hover:text-text-primary"
        >
          <X className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
