import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FB923C 0%, #F472B6 100%)",
          borderRadius: 40,
          fontSize: 100,
          fontWeight: 800,
          color: "#09090B",
          letterSpacing: "-0.05em",
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
