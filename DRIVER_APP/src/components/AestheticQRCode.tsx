import React, { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

export interface AestheticQRCodeProps {
  data: string;
  size?: number;
  dotsColor?: string;
  cornersColor?: string;
  className?: string;
}

/**
 * Modern Aesthetic QR Code Generator
 * Uses rounded dots and extra-rounded corner eyes with dark-mode transparent background
 */
export const AestheticQRCode: React.FC<AestheticQRCodeProps> = ({
  data,
  size = 220,
  dotsColor = '#38bdf8', // Theme cyan/sky
  cornersColor = '#818cf8', // Indigo accent
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling({
        width: size,
        height: size,
        type: 'svg',
        data,
        margin: 4,
        dotsOptions: {
          type: 'rounded',
          color: dotsColor,
        },
        cornersSquareOptions: {
          type: 'extra-rounded',
          color: cornersColor,
        },
        cornersDotOptions: {
          type: 'dot',
          color: cornersColor,
        },
        backgroundOptions: {
          color: 'transparent',
        },
      });
    } else {
      qrRef.current.update({
        data,
        width: size,
        height: size,
        dotsOptions: {
          type: 'rounded',
          color: dotsColor,
        },
        cornersSquareOptions: {
          type: 'extra-rounded',
          color: cornersColor,
        },
        cornersDotOptions: {
          type: 'dot',
          color: cornersColor,
        },
      });
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      qrRef.current.append(containerRef.current);
    }
  }, [data, size, dotsColor, cornersColor]);

  return <div ref={containerRef} className={`flex items-center justify-center select-none ${className}`} />;
};
