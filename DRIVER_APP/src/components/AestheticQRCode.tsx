import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

export interface AestheticQRCodeHandle {
  getBlob: () => Promise<Blob | null>;
}

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
export const AestheticQRCode = forwardRef<AestheticQRCodeHandle, AestheticQRCodeProps>(({
  data,
  size = 220,
  dotsColor = '#0284c7',
  cornersColor = '#2563eb',
  className = '',
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  useImperativeHandle(ref, () => ({
    async getBlob() {
      if (!qrRef.current) return null;
      try {
        const raw = await qrRef.current.getRawData('png');
        if (raw instanceof Blob) return raw;
        if (raw) return new Blob([raw as any], { type: 'image/png' });
        return null;
      } catch (err) {
        console.warn('Failed to extract QR blob:', err);
        return null;
      }
    },
  }));

  useEffect(() => {
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling({
        width: size,
        height: size,
        type: 'canvas',
        data,
        margin: 4,
        dotsOptions: {
          type: 'dots',
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
          type: 'dots',
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
});

AestheticQRCode.displayName = 'AestheticQRCode';
