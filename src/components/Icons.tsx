import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const FilterIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M7 12h10M10 17h4" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <rect x="7" y="5" width="3.5" height="14" rx="1" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
  </Icon>
);

export const SkipBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 5v14" />
    <path d="M18 6.5 9.5 12l8.5 5.5v-11Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const SkipForwardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 5v14" />
    <path d="M6 6.5 14.5 12 6 17.5v-11Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const VolumeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 10v4h3l4 3.5v-11L7 10H4Z" fill="currentColor" stroke="none" />
    <path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7.5 7.5 0 0 1 0 10.4" />
  </Icon>
);

export const MuteIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 10v4h3l4 3.5v-11L7 10H4Z" fill="currentColor" stroke="none" />
    <path d="m15 9 5 6M20 9l-5 6" />
  </Icon>
);

export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5" />
    <path d="M5 18.5h14" />
  </Icon>
);

export const LyricsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 6h11M5 10h8M5 14h11M5 18h6" />
    <path d="M19 13.5v4.2a1.8 1.8 0 1 1-1.4-1.75" />
    <circle cx="17.6" cy="11.3" r="1.4" />
  </Icon>
);

export const AlbumIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" opacity=".45" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.12-1.25l2-1.55-2-3.46-2.36.95A7 7 0 0 0 14.4 5.1L14 2.5h-4l-.4 2.6a7 7 0 0 0-2.12 1.24l-2.36-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .42.04.84.12 1.25l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.12 1.24l.4 2.6h4l.4-2.6a7 7 0 0 0 2.12-1.24l2.36.95 2-3.46-2-1.55c.08-.41.12-.83.12-1.25Z" />
  </Icon>
);

export const ExternalIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 5h5v5M19 5l-8 8" />
    <path d="M18 14v4.5H5.5V6H10" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path d="M12 9v4.5M12 16.8v.2" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 6.5" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
);

export const SparkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5c.5 4.6 3.4 7.5 8 8-4.6.5-7.5 3.4-8 8-.5-4.6-3.4-7.5-8-8 4.6-.5 7.5-3.4 8-8Z" />
  </Icon>
);

export const MusicIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 18V6.5l10-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Icon>
);

export const HeadphonesIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <path d="M4 14h3v5H5.5A1.5 1.5 0 0 1 4 17.5V14ZM20 14h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5V14Z" />
  </Icon>
);

export const WaveIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2M21 12h0" />
  </Icon>
);

export const LoaderIcon = (props: IconProps) => (
  <Icon {...props} className={`spin ${props.className ?? ''}`}>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
  </Icon>
);
