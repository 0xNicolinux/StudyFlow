"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** HTML bruto é ignorado por padrão pelo react-markdown; links externos abrem isolados. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer nofollow" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
