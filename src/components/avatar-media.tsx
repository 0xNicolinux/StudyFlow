"use client";

import { useEffect, useRef } from "react";
import { initials } from "@/lib/format";

type Props = {
  media: string | null | undefined;
  name: string;
  className?: string;
};

type VisibleVideoProps = {
  src: string;
  className?: string;
  ariaLabel?: string;
  decorative?: boolean;
};

/** Reproduz vídeos decorativos somente no viewport e quando a aba está visível. */
export function VisibleVideo({ src, className = "", ariaLabel, decorative = true }: VisibleVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    let inView = false;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncPlayback = () => {
      if (!inView || document.visibilityState !== "visible" || motionPreference.matches) {
        video.pause();
        return;
      }
      void video.play().catch(() => {
        // Autoplay pode ser bloqueado pelo navegador; o perfil continua funcional sem animação.
      });
    };

    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          inView = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.05);
          syncPlayback();
        }, { threshold: [0, 0.05] });

    if (observer) observer.observe(video);
    else {
      inView = true;
      syncPlayback();
    }

    const onVisibilityChange = () => syncPlayback();
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionPreference.addEventListener("change", syncPlayback);

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionPreference.removeEventListener("change", syncPlayback);
      video.pause();
    };
  }, [src]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      className={className}
      src={src}
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : ariaLabel}
      tabIndex={decorative ? -1 : undefined}
    />
  );
}

export function AvatarMedia({ media, name, className = "" }: Props) {
  if (media?.startsWith("data:video/")) {
    return <VisibleVideo src={media} className={`avatar-media ${className}`} />;
  }

  if (media) {
    // GIFs stay animated when rendered as an image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`avatar-media ${className}`} src={media} alt="" />;
  }

  return <span>{initials(name || "Estudante")}</span>;
}
