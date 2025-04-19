"use client";

import { useEffect } from "react";

export default function SyntheticV0PageForDeployment() {
  useEffect(() => {
    import("../html/script.js");
  }, []);

  return (
    <div id="panel" style={{ display: "none" }}>
      {/* ... seu HTML do painel aqui ... */}
    </div>
  );
}
