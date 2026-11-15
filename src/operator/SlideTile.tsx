interface Props {
  text: string;
  variant?: "verse" | "song";
}

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
