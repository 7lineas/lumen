/** Stroke icons drawn on a 20×20 grid; the stroke style comes from `.lx-icon`. */

interface IconProps {
  className?: string;
}

const svg = (children: React.ReactNode) =>
  function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className={className ? `lx-icon ${className}` : "lx-icon"}
      >
        {children}
      </svg>
    );
  };

export const BibleIcon = svg(
  <path d="M3 4.5C5.5 3.5 8 3.7 10 5c2-1.3 4.5-1.5 7-.5v11c-2.5-1-5-.8-7 .5-2-1.3-4.5-1.5-7-.5z M10 5v11" />,
);

export const SongIcon = svg(
  <>
    <path d="M7.5 15V4.5l8-1.5v10.5" />
    <circle cx="5.5" cy="15" r="2" />
    <circle cx="13.5" cy="13.5" r="2" />
  </>,
);

export const TextIcon = svg(<path d="M3.5 5h13M3.5 9h13M3.5 13h8M3.5 17h10" />);

export const MediaIcon = svg(
  <>
    <rect x="2.5" y="4" width="15" height="12" rx="2" />
    <path d="M8.5 7.5v5l4-2.5z" />
  </>,
);

export const SlidesIcon = svg(
  <>
    <rect x="2.5" y="5.5" width="12" height="9.5" rx="1.5" />
    <path d="M5.5 3h10a2 2 0 0 1 2 2v7.5" />
  </>,
);

export const AudioIcon = svg(
  <path d="M3 8v4 M6.5 5.5v9 M10 3v14 M13.5 6.5v7 M17 8.5v3" />,
);

export const SearchIcon = svg(
  <>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.2 13.2 17 17" />
  </>,
);
