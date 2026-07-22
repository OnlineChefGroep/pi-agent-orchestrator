import {Composition, Still, staticFile, type CalculateMetadataFunction} from "remotion";
import {ArchitectureDiagram} from "./ArchitectureDiagram.js";
import {FeatureTour} from "./FeatureTour.js";
import {PiTerminalShowcase, type PiTerminalShowcaseProps} from "./PiTerminalShowcase.js";
import {ProductFilm, productFilmDuration} from "./ProductFilm.js";
import {PromoBanner, PromoSocialCard} from "./PromoBanner.js";
import {
  calculateFeatureTourMetadata,
  fallbackPromoData,
  getFeatureTourDuration,
} from "./promo-data.js";
import {layout} from "./theme.js";

// Fallback when showcase.json is unavailable; calculateMetadata prefers the capture.
const FALLBACK_SHOWCASE_DURATION_SECONDS = 31.115;
const TERMINAL_DURATION_IN_FRAMES = Math.ceil(FALLBACK_SHOWCASE_DURATION_SECONDS * layout.fps);

const calculateTerminalMetadata: CalculateMetadataFunction<PiTerminalShowcaseProps> = async ({
  abortSignal,
}) => {
  try {
    const response = await fetch(staticFile("showcase.json"), {signal: abortSignal});
    if (response.ok) {
      const data = (await response.json()) as {durationSeconds?: number};
      if (typeof data.durationSeconds === "number" && data.durationSeconds > 0) {
        return {
          durationInFrames: Math.ceil(data.durationSeconds * layout.fps),
        };
      }
    }
  } catch {
    // Keep the composition-level fallback duration.
  }
  return {
    durationInFrames: TERMINAL_DURATION_IN_FRAMES,
  };
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="PiAgentTerminal"
        component={PiTerminalShowcase}
        durationInFrames={TERMINAL_DURATION_IN_FRAMES}
        fps={layout.fps}
        width={layout.videoWidth}
        height={layout.videoHeight}
        defaultProps={{poster: false}}
        calculateMetadata={calculateTerminalMetadata}
      />
      <Still
        id="PiAgentTerminalPoster"
        component={PiTerminalShowcase}
        width={layout.videoWidth}
        height={layout.videoHeight}
        defaultProps={{poster: true}}
      />
      <Still
        id="PromoBanner"
        component={PromoBanner}
        width={layout.bannerWidth}
        height={layout.bannerHeight}
      />
      <Still
        id="PromoSocialCard"
        component={PromoSocialCard}
        width={layout.socialCardWidth}
        height={layout.socialCardHeight}
      />
      <Still
        id="ArchitectureDiagram"
        component={ArchitectureDiagram}
        width={layout.videoWidth}
        height={layout.videoHeight}
      />
      <Composition
        id="ProductFilm"
        component={ProductFilm}
        durationInFrames={productFilmDuration}
        fps={layout.fps}
        width={layout.videoWidth}
        height={layout.videoHeight}
        defaultProps={{dataFile: "promo-data.json"}}
      />
      <Composition
        id="FeatureTour"
        component={FeatureTour}
        durationInFrames={getFeatureTourDuration(fallbackPromoData)}
        fps={layout.fps}
        width={layout.videoWidth}
        height={layout.videoHeight}
        defaultProps={{dataFile: "promo-data.json"}}
        calculateMetadata={calculateFeatureTourMetadata}
      />
    </>
  );
};
