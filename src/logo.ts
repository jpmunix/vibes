// src/logo.ts
import logoMain from "../assets/icons/main/logo.png";
import logoDev from "../assets/icons/flavors/development/logo.png";

let logoSrc = logoMain;

if (typeof import.meta !== "undefined" && (import.meta as any).env) {
  const flavor = (import.meta as any).env.VITE_APP_FLAVOR;
  if (flavor === "development") {
    logoSrc = logoDev;
  }
}

export default logoSrc;
