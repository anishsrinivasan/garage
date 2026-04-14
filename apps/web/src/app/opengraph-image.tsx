import { ImageResponse } from "next/og";

export const alt = "Torque — Preowned Cars, Curated";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#09090B",
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(251,146,60,0.35), transparent 60%), radial-gradient(ellipse 60% 50% at 85% 20%, rgba(34,211,238,0.2), transparent 60%)",
          color: "#FAFAFA",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "linear-gradient(135deg, #FB923C 0%, #F472B6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              fontWeight: 800,
              color: "#09090B",
            }}
          >
            T
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Torque
            <span
              style={{
                marginLeft: 12,
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 18,
                fontWeight: 600,
                color: "#D4D4D8",
                letterSpacing: "0.14em",
              }}
            >
              IN
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              maxWidth: 900,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ color: "#FAFAFA" }}>Your next ride,</span>
            <span
              style={{
                background:
                  "linear-gradient(135deg, #FB923C 0%, #F472B6 55%, #22D3EE 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              engineered to find you.
            </span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#A1A1AA",
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            Every preowned car listing across marketplaces and trusted dealers — deduplicated, normalized, and searchable.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 20,
            color: "#71717A",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 600,
            fontFamily: "monospace",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#34D399",
              boxShadow: "0 0 12px rgba(52,211,153,0.9)",
            }}
          />
          Live · AI-curated · Updated hourly
        </div>
      </div>
    ),
    { ...size },
  );
}
