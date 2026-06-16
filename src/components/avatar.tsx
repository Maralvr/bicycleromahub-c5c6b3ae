import { cn } from "@/lib/utils";

const palette = [
  "from-emerald-400 to-green-600",
  "from-lime-400 to-emerald-600",
  "from-teal-400 to-emerald-600",
  "from-green-500 to-teal-600",
  "from-emerald-500 to-cyan-600",
  "from-green-400 to-emerald-700",
];

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

export function Avatar({
  name,
  initials,
  imageUrl,
  size = "md",
  className,
}: {
  name: string;
  initials: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const grad = palette[hash(name) % palette.length];
  const sz = { sm: "h-7 w-7 text-[10px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-base" }[size];
  if (imageUrl) {
    return (
      <div
        className={cn(
          "rounded-xl overflow-hidden bg-muted flex items-center justify-center shadow-sm flex-shrink-0",
          sz,
          className,
        )}
      >
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-xl bg-gradient-to-br text-white font-bold flex items-center justify-center shadow-sm flex-shrink-0",
        grad,
        sz,
        className,
      )}
    >
      {initials}
    </div>
  );
}
