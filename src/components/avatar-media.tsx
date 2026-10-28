"use client";

import { initials } from "@/lib/format";

type Props = {
  media: string | null | undefined;
  name: string;
  className?: string;
};

export function AvatarMedia({ media, name, className = "" }: Props) {
  if (media?.startsWith("data:video/")) {
    return (
      <video
        className={`avatar-media ${className}`}
        src={media}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
    );
  }

  if (media) {
    // GIFs stay animated when rendered as an image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`avatar-media ${className}`} src={media} alt="" />;
  }

  return <span>{initials(name || "Estudante")}</span>;
}
