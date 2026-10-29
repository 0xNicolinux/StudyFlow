"use client";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

/** HTML bruto é ignorado por padrão pelo react-markdown; links externos abrem isolados. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer nofollow" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
