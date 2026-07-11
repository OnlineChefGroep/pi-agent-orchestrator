declare module "ansi-to-html" {
  type Options = {
    fg?: string;
    bg?: string;
    newline?: boolean;
    escapeXML?: boolean;
    stream?: boolean;
  };

  export default class Convert {
    constructor(options?: Options);
    toHtml(input: string): string;
  }
}
