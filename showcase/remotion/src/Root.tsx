import {Composition, Still} from "remotion";
import {ArchitectureDiagram} from "./ArchitectureDiagram.js";
import {FeatureTour} from "./FeatureTour.js";
import {PiTerminalShowcase} from "./PiTerminalShowcase.js";
import {PromoBanner, PromoSocialCard} from "./PromoBanner.js";
import {
  calculateFeatureTourMetadata,
  fallbackPromoData,
  getFeatureTourDuration,
} from "./promo-data.js";
import {layout} from "./theme.js";

const TERMINAL_DURATION_IN_FRAMES = 480;

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
