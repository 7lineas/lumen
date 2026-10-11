interface Props {
  text: string;
  /** Lyrics are centred and heavier; verses read as running text. */
  variant?: "verse" | "song";
}

/**
 * Miniature of a text slide. The type shrinks with the amount of text so a
 * long verse still fits the 16:9 tile; sizes are in container units, so the
 * tile looks the same at any card width.
 */
export function SlideTile({ text, variant = "verse" }: Props) {
  const lines = text.split("\n").length;
  const weight = text.length + lines * 10;
  const size = Math.min(6.4, Math.max(3, 64 / Math.sqrt(Math.max(weight, 1))));
  return (
    <div className={`lx-tile lx-tile-${variant}`}>
      <p style={{ fontSize: `${size.toFixed(2)}cqw` }}>{text}</p>
    </div>
  );
}
