import { cn } from "@/lib/utils";

const toneClassNames = {
  neutral: "bg-gray-100 text-gray-700",
  good: "bg-emerald-100 text-emerald-800",
  warning: "bg-orange-100 text-orange-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800"
};

export function StatusBadge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClassNames;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
        toneClassNames[tone]
      )}
    >
      {children}
    </span>
  );
}
