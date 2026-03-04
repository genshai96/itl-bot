import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
];

interface ChartBlock {
  type: "bar" | "line" | "pie";
  title?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
}

function extractCharts(text: string): { cleanText: string; charts: ChartBlock[] } {
  const charts: ChartBlock[] = [];
  const cleanText = text.replace(/```chart\s*\n([\s\S]*?)```/g, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (parsed.data && Array.isArray(parsed.data)) {
        charts.push(parsed as ChartBlock);
        return ""; // remove from text
      }
    } catch { /* ignore */ }
    return _;
  });
  return { cleanText: cleanText.trim(), charts };
}

function extractImages(text: string): { cleanText: string; images: string[] } {
  const images: string[] = [];
  // Match base64 images or URLs in markdown image syntax
  const cleanText = text.replace(/!\[([^\]]*)\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, (_, _alt, url) => {
    images.push(url);
    return "";
  });
  return { cleanText: cleanText.trim(), images };
}

function ChartRenderer({ chart }: { chart: ChartBlock }) {
  const keys = chart.data.length > 0 ? Object.keys(chart.data[0]) : [];
  const xKey = chart.xKey || keys[0] || "name";
  const yKeys = chart.yKey ? [chart.yKey] : keys.filter((k) => k !== xKey);

  if (chart.type === "pie") {
    return (
      <div className="my-3">
        {chart.title && <p className="text-xs font-medium mb-2 text-foreground/80">{chart.title}</p>}
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={chart.data} dataKey={yKeys[0] || "value"} nameKey={xKey} cx="50%" cy="50%" outerRadius={70} label>
              {chart.data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const ChartComponent = chart.type === "line" ? LineChart : BarChart;
  const DataComponent = chart.type === "line" ? Line : Bar;

  return (
    <div className="my-3">
      {chart.title && <p className="text-xs font-medium mb-2 text-foreground/80">{chart.title}</p>}
      <ResponsiveContainer width="100%" height={200}>
        <ChartComponent data={chart.data}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          {yKeys.map((key, i) => (
            // @ts-ignore - dynamic chart component
            <DataComponent key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
          {yKeys.length > 1 && <Legend />}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}

export function ChatMessageRenderer({ content, role }: { content: string; role: "user" | "bot" | "assistant" }) {
  const { cleanText: textAfterCharts, charts } = useMemo(() => extractCharts(content), [content]);
  const { cleanText, images } = useMemo(() => extractImages(textAfterCharts), [textAfterCharts]);

  const isUser = role === "user";

  if (isUser) {
    return <p className="text-sm whitespace-pre-line">{content}</p>;
  }

  return (
    <div className="space-y-2">
      {cleanText && (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-table:my-2 text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto rounded-lg border my-2">
                  <table className="w-full text-xs">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-muted/50 border-b">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-3 py-2 text-left font-medium text-foreground/80">{children}</th>
              ),
              td: ({ children }) => (
                <td className="px-3 py-2 border-t text-foreground/70">{children}</td>
              ),
              code: ({ className, children, ...props }) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-primary" {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <pre className="rounded-lg bg-muted/80 border p-3 overflow-x-auto">
                    <code className={`text-xs font-mono ${className || ""}`} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              },
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
                  {children}
                </a>
              ),
              img: ({ src, alt }) => (
                <img src={src} alt={alt || ""} className="rounded-lg max-w-full h-auto my-2 border" loading="lazy" />
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-3 border-primary/40 pl-3 italic text-foreground/70 my-2">
                  {children}
                </blockquote>
              ),
            }}
          >
            {cleanText}
          </ReactMarkdown>
        </div>
      )}

      {images.map((src, i) => (
        <img key={i} src={src} alt="" className="rounded-lg max-w-full max-h-60 border" loading="lazy" />
      ))}

      {charts.map((chart, i) => (
        <ChartRenderer key={i} chart={chart} />
      ))}
    </div>
  );
}
