import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function TotpQrCode({ provisioningUri, username }: { provisioningUri: string; username: string }) {
  const [imageSource, setImageSource] = useState<string>();

  useEffect(() => {
    let active = true;
    setImageSource(undefined);
    void QRCode.toString(provisioningUri, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
      .then((svg) => {
        if (active) setImageSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      });
    return () => {
      active = false;
      setImageSource(undefined);
    };
  }, [provisioningUri]);

  return imageSource
    ? <img className="totpQr" src={imageSource} alt={`Authenticator QR code for ${username}`} />
    : <div className="inlineState" role="status">Generating authenticator QR code</div>;
}
