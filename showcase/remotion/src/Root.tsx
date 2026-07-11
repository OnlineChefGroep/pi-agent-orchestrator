import {Composition, Still} from "remotion";
import {PiTerminalShowcase} from "./PiTerminalShowcase";

const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const FPS = 30;
const DURATION_IN_FRAMES = 480;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="PiAgentTerminal"
        component={PiTerminalShowcase}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{poster: false}}
      />
      <Still
        id="PiAgentTerminalPoster"
        component={PiTerminalShowcase}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{poster: true}}
      />
    </>
  );
};
