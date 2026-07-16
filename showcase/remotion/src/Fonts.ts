import {loadFont as loadInter} from "@remotion/google-fonts/Inter";
import {loadFont as loadJetBrainsMono} from "@remotion/google-fonts/JetBrainsMono";

const inter = loadInter("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const jetBrainsMono = loadJetBrainsMono("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const interFamily = inter.fontFamily;
export const jetBrainsMonoFamily = jetBrainsMono.fontFamily;
