const LoadingState = ({
  fullScreen = false,
  heightClass = 'h-64',
  sizeClass = 'h-10 w-10',
  showBackground = false,
}) => {
  const containerClass = fullScreen
    ? `min-h-screen flex items-center justify-center ${showBackground ? 'bg-zinc-100' : ''}`
    : `flex items-center justify-center ${heightClass}`;

  return (
    <div className={containerClass}>
      <div className="relative flex items-center justify-center">
        <div className={`absolute ${sizeClass} rounded-full bg-red-500/15 blur-md animate-pulse`} />

        <div className={`relative ${sizeClass}`}>
          <div className="absolute inset-0 rounded-full border-2 border-red-200/80" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-red-600 border-r-red-400 animate-spin" />
          <div className="absolute inset-2 rounded-full border border-zinc-300/70 animate-pulse" />
          <div className="absolute inset-[38%] rounded-full bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.5)]" />
        </div>
      </div>
    </div>
  );
};

export default LoadingState;