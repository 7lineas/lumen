import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MediaFit } from "@shared/types";

interface Props {
  label: string;
  value: MediaFit;
  onChange: (value: MediaFit) => void;
  testId?: string;
  spacing?: number;
}

export function FitToggle({
  label,
  value,
  onChange,
  testId,
  spacing = 0,
}: Props) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={spacing}
      className="fit-toggle"
      aria-label={label}
      data-testid={testId}
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0];
        if (picked === "cover" || picked === "contain") onChange(picked);
      }}
    >
      <ToggleGroupItem value="cover" aria-label={`${label}: cubrir`}>
        Cubrir
      </ToggleGroupItem>
      <ToggleGroupItem value="contain" aria-label={`${label}: ajustar`}>
        Ajustar
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
