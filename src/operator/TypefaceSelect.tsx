import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useInstalledFonts } from "@/hooks/useInstalledFonts";
import {
  fontChoices,
  fontWeightChoices,
  resolveFontWeight,
  weightLabel,
  type FontFamilyId,
  type InstalledFont,
} from "@shared/fonts";
import { GoogleFontsCombobox } from "./GoogleFontsCombobox";

interface PickerProps {
  value: FontFamilyId;
  installed: InstalledFont[];
  onChange: (id: FontFamilyId) => void;
  /** Called after a font is removed, so a setting that used it can fall back. */
  onRemoved: (id: string) => void;
}

/** Typeface selector (built-in and installed fonts) with the search icon that installs Google fonts. */
export function TypefaceSelect({
  value,
  installed,
  onChange,
  onRemoved,
}: PickerProps) {
  const options = fontChoices(installed);
  return (
    <>
      <Select
        value={value}
        items={options.map((option) => ({
          value: option.id,
          label: option.label,
        }))}
        onValueChange={(next) => next && onChange(next as FontFamilyId)}
      >
        <SelectTrigger className="ajustes-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className="ajustes-select-popup"
          alignItemWithTrigger={false}
        >
          {options.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              style={{ fontFamily: option.stack }}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <GoogleFontsCombobox
        value={value}
        installed={installed}
        onSelect={onChange}
        onRemoved={onRemoved}
      />
    </>
  );
}

interface WeightProps {
  value: number;
  weights: number[];
  onChange: (weight: number) => void;
}

/** Weight of the text, limited to the weights the typeface offers. */
export function FontWeightSelect({ value, weights, onChange }: WeightProps) {
  return (
    <Select
      value={String(value)}
      items={weights.map((weight) => ({
        value: String(weight),
        label: weightLabel(weight),
      }))}
      onValueChange={(next) => next && onChange(Number(next))}
    >
      <SelectTrigger className="ajustes-select" aria-label="Grosor">
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className="ajustes-select-popup"
        alignItemWithTrigger={false}
      >
        {weights.map((weight) => (
          <SelectItem
            key={weight}
            value={String(weight)}
            style={{ fontWeight: weight }}
          >
            {weightLabel(weight)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface OwnProps {
  /** Whether this song or text has its own typeface (the switch). */
  own: boolean;
  onOwnChange: (own: boolean) => void;
  fontFamily: FontFamilyId;
  fontWeight: number;
  onChange: (typeface: {
    fontFamily: FontFamilyId;
    fontWeight: number;
  }) => void;
  testId: string;
}

/** Switch plus typeface and weight pickers for one song or text. Off: Ajustes > Tipo de letra applies. */
export function OwnTypeface({
  own,
  onOwnChange,
  fontFamily,
  fontWeight,
  onChange,
  testId,
}: OwnProps) {
  const installed = useInstalledFonts();
  const weights = fontWeightChoices(fontFamily, installed);
  return (
    <div className="lx-field">
      <label className="lx-toggle">
        <Switch
          checked={own}
          onCheckedChange={onOwnChange}
          aria-label="Tipo de letra propio"
          data-testid={testId}
        />
        <span>Tipo de letra propio</span>
      </label>
      {own && (
        <div className="lx-typeface">
          <TypefaceSelect
            value={fontFamily}
            installed={installed}
            onChange={(id) =>
              onChange({
                fontFamily: id,
                fontWeight: resolveFontWeight(
                  fontWeight,
                  fontWeightChoices(id, installed),
                ),
              })
            }
            onRemoved={(id) => {
              if (id !== fontFamily) return;
              onChange({
                fontFamily: "system",
                fontWeight: resolveFontWeight(
                  fontWeight,
                  fontWeightChoices("system", installed),
                ),
              });
            }}
          />
          <FontWeightSelect
            value={resolveFontWeight(fontWeight, weights)}
            weights={weights}
            onChange={(weight) => onChange({ fontFamily, fontWeight: weight })}
          />
        </div>
      )}
    </div>
  );
}
