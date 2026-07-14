import {Config} from "@remotion/cli/config";

Config.overrideWebpackConfig((currentConfiguration) => ({
  ...currentConfiguration,
  resolve: {
    ...currentConfiguration.resolve,
    extensionAlias: {
      ...currentConfiguration.resolve?.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    },
  },
}));
