import React, { useState, useEffect, useMemo } from 'react';
import {
  buildProxiedImageUrl,
  isExternalHttpUrl,
  normalizeImageUrl
} from '../../utils/imageUrl';

export interface SmartImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  fallback?: React.ReactNode;
  onFinalError?: () => void;
}

/**
 * Resilient <img> component engineered for Facebook In-App Browser (FBAN/FBAV)
 * and slow mobile networks:
 * - Normalizes URLs (HTTPS upgrade, Google Drive/Dropbox share URLs)
 * - Automatic 3-stage fallback on error:
 *   0) Direct URL with referrerPolicy="no-referrer"
 *   1) Direct URL with referrerPolicy="origin-when-cross-origin"
 *   2) Same-origin /api/image-proxy?url=... (bypasses WebView hotlink/CDN/CORS blocks)
 */
export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  className = '',
  eager = false,
  fallback = null,
  onFinalError
}) => {
  const normalized = useMemo(() => normalizeImageUrl(src), [src]);
  const [stage, setStage] = useState<number>(0);

  useEffect(() => {
    setStage(0);
  }, [normalized]);

  if (!normalized) {
    return <>{fallback}</>;
  }

  const external = isExternalHttpUrl(normalized);
  const maxStage = external ? 2 : 0;

  if (stage > maxStage) {
    return <>{fallback}</>;
  }

  const effectiveSrc =
    stage === 2 && external ? buildProxiedImageUrl(normalized) : normalized;
  const effectiveReferrer: React.HTMLAttributeReferrerPolicy =
    stage === 1 ? 'origin-when-cross-origin' : 'no-referrer';

  const handleError = () => {
    if (stage < maxStage) {
      setStage(prev => prev + 1);
    } else {
      setStage(maxStage + 1);
      onFinalError?.();
    }
  };

  return (
    <img
      key={`${effectiveSrc}::${stage}`}
      src={effectiveSrc}
      alt={alt}
      referrerPolicy={effectiveReferrer}
      loading={eager ? 'eager' : 'lazy'}
      decoding={eager ? 'sync' : 'async'}
      fetchPriority={eager ? 'high' : 'auto'}
      onError={handleError}
      className={className}
    />
  );
};
