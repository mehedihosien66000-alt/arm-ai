interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  layout?: 'row' | 'stacked';
}

export const OFFICIAL_LOGO_SRC = '/assets/outfit-arm-logo.png';

export function BrandLogo({
  size = 'md',
  showWordmark = true,
  layout = 'row',
}: BrandLogoProps) {
  const imgDimensions =
    size === 'sm'
      ? 'h-10 w-auto max-w-[46px]'
      : size === 'lg'
      ? 'h-24 w-auto max-w-[108px]'
      : 'h-12 w-auto max-w-[54px]';

  if (layout === 'stacked') {
    return (
      <div className="inline-flex flex-col items-center text-center gap-2 select-none shrink-0">
        <img
          src={OFFICIAL_LOGO_SRC}
          alt="OUTFIT ARM ACCESSORIES official logo"
          className={`${imgDimensions} object-contain shrink-0`}
        />
        {showWordmark && (
          <div className="flex flex-col items-center leading-tight">
            <span className="text-base font-semibold tracking-tight text-[#FFFFFF] whitespace-nowrap">
              ARM AI
            </span>
            <span className="text-[11px] font-medium text-[#A0A0A0] mt-0.5 whitespace-nowrap">
              Powered by MEHEDI AI
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <img
        src={OFFICIAL_LOGO_SRC}
        alt="OUTFIT ARM ACCESSORIES official logo"
        className={`${imgDimensions} object-contain shrink-0`}
      />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-[#FFFFFF] whitespace-nowrap">
            ARM AI
          </span>
          <span className="text-[11px] font-medium text-[#A0A0A0] mt-0.5 whitespace-nowrap">
            MEHEDI AI
          </span>
        </div>
      )}
    </div>
  );
}
