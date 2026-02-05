export const OnboardingBanner = ({
  isVisible,
  setIsVisible,
}: {
  isVisible: boolean;
  setIsVisible: (isVisible: boolean) => void;
}) => {
  if (!isVisible) return null;

  return "";
};
