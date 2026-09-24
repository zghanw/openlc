import { Bricolage_Grotesque } from "next/font/google";

/** The landing's display face (owner's choice). Self-hosted by next/font at build time; exposed only
 *  as --font-lp-display, which landing.css applies to the display headlines. */
export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-lp-display",
});
