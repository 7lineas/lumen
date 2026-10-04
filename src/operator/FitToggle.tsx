import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MediaFit } from "@shared/types";

interface Props {
  /** Accessible name of the group (what the setting applies to). */
  label: string;
  value: MediaFit;
  onChange: (value: MediaFit) => void;
  testId?: string;
}

/** Two-option segmented control: "Cubrir" (cover) / "Ajustar" (contain). */
export function FitToggle({ label, value, onChange, testId }: Props) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      className="fit-toggle"
      aria-label={label}
      data-testid={testId}
      value={[value]}
      // A single-choice control: ignore the "nothing pressed" event emitted when the active option is clicked again.
      onValueChange={(next) => {
        const picked = next[0];
        if (picked === "cover" || picked === "contain") onChange(picked);
      }}
    >
      <ToggleGroupItem value="cover" aria-label={`${label}: cubrir`}>Cubrir</ToggleGroupItem>
      <ToggleGroupItem value="contain" aria-label={`${label}: ajustar`}>Ajustar</ToggleGroupItem>
    </ToggleGroup>
  );
}
