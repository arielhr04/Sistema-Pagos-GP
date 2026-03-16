import { useEffect, useState, useCallback } from 'react';
import Joyride, { STATUS, ACTIONS, EVENTS } from 'react-joyride';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTour } from '../context/TourContext';

// Custom tooltip with the app's design system
const TourTooltip = ({
  continuous,
  index,
  step,
  size,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
}) => (
  <div
    {...tooltipProps}
    className="bg-white rounded-xl shadow-2xl border border-zinc-200 max-w-sm animate-fade-in"
  >
    {/* Progress bar */}
    <div className="h-1 bg-zinc-100 rounded-t-xl overflow-hidden">
      <div
        className="h-full bg-red-600 transition-all duration-300"
        style={{ width: `${((index + 1) / size) * 100}%` }}
      />
    </div>

    <div className="p-5">
      {/* Step counter */}
      <p className="text-xs text-zinc-400 font-mono mb-2">
        Paso {index + 1} de {size}
      </p>

      {/* Content */}
      <p className="text-sm text-zinc-700 leading-relaxed">{step.content}</p>

      {/* Navigation hint for steps on other pages */}
      {step.pageHint && (
        <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded-md">
          {step.pageHint}
        </p>
      )}
    </div>

    {/* Buttons */}
    <div className="flex items-center justify-between px-5 pb-4 pt-0">
      <button
        {...skipProps}
        className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
      >
        Omitir tour
      </button>

      <div className="flex gap-2">
        {index > 0 && (
          <button
            {...backProps}
            className="px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Anterior
          </button>
        )}
        <button
          {...primaryProps}
          className="px-4 py-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          {isLastStep ? '¡Entendido!' : 'Siguiente'}
        </button>
      </div>
    </div>

    {/* Final step: help button hint */}
    {isLastStep && (
      <div className="px-5 pb-4 pt-0">
        <p className="text-xs text-zinc-500 bg-zinc-50 p-2 rounded-md text-center">
          💡 Puedes repetir este tour en cualquier momento desde el botón <strong>?</strong> en la barra superior.
        </p>
      </div>
    )}
  </div>
);

const AppTour = () => {
  const { tourActive, tourKey, steps, completeTour, skipTour } = useTour();
  const location = useLocation();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [run, setRun] = useState(false);

  // When tour becomes active, start from step 0
  useEffect(() => {
    if (tourActive) {
      setStepIndex(0);
      setRun(true);
    } else {
      setRun(false);
    }
  }, [tourActive, tourKey]);

  // Annotate steps: add pageHint if the step is on a different page
  const annotatedSteps = steps.map((step) => {
    const onDifferentPage =
      step.page && !location.pathname.startsWith(step.page);
    return {
      ...step,
      pageHint: onDifferentPage
        ? `Navega a "${step.page}" en el menú lateral para ver este elemento.`
        : undefined,
    };
  });

  const handleCallback = useCallback(
    (data) => {
      const { status, action, index, type } = data;

      // Tour finished or skipped
      if (status === STATUS.FINISHED) {
        completeTour();
        return;
      }
      if (status === STATUS.SKIPPED || action === ACTIONS.SKIP) {
        skipTour();
        return;
      }

      // Step navigation
      if (type === EVENTS.STEP_AFTER) {
        const nextIndex =
          action === ACTIONS.PREV ? index - 1 : index + 1;

        if (nextIndex >= 0 && nextIndex < steps.length) {
          const nextStep = steps[nextIndex];

          // Navigate to the correct page if needed
          if (
            nextStep.page &&
            !location.pathname.startsWith(nextStep.page)
          ) {
            navigate(nextStep.page);
            // Small delay to let the page render
            setTimeout(() => setStepIndex(nextIndex), 400);
          } else {
            setStepIndex(nextIndex);
          }
        }
      }
    },
    [completeTour, skipTour, steps, location.pathname, navigate]
  );

  if (!tourActive || steps.length === 0) return null;

  return (
    <Joyride
      key={tourKey}
      steps={annotatedSteps}
      stepIndex={stepIndex}
      run={run}
      continuous
      showSkipButton
      disableOverlayClose
      disableScrolling={false}
      spotlightClicks={false}
      callback={handleCallback}
      tooltipComponent={TourTooltip}
      styles={{
        options: {
          arrowColor: '#fff',
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
        },
        spotlight: {
          borderRadius: 12,
        },
      }}
      floaterProps={{
        disableAnimation: false,
        styles: {
          floater: { zIndex: 10001 },
        },
      }}
      locale={{
        back: 'Anterior',
        close: 'Cerrar',
        last: '¡Entendido!',
        next: 'Siguiente',
        skip: 'Omitir',
      }}
    />
  );
};

export default AppTour;
