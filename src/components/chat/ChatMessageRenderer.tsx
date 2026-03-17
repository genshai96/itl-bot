import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo, useEffect, useRef, useState, useId } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import mermaid from "mermaid";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, FileText, Copy, Check } from "lucide-react";

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "inherit",
});

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

interface FileBlock {
  filename: string;
  content: string;
  type: "csv" | "txt" | "json" | "xml" | "html" | "md" | "xlsx";
}

const FENCED_BLOCK_REGEX = /(^|\n)(```[ \t]*([^\n`]*)\r?\n([\s\S]*?)\r?\n```)/g;
const CHART_FENCE_LANGUAGES = new Set(["chart", "json", "js", "javascript", "ts", "typescript"]);
const MERMAID_FENCE_LANGUAGES = new Set([
  "mermaid",
  "graph",
  "flowchart",
  "sequencediagram",
  "classdiagram",
  "statediagram",
  "statediagram-v2",
  "erdiagram",
  "journey",
  "gantt",
  "mindmap",
  "timeline",
  "gitgraph",
  "quadrantchart",
  "requirementdiagram",
  "kanban",
  "architecture",
  "block-beta",
  "packet-beta",
  "xychart-beta",
  "sankey-beta",
  "pie",
]);
const MERMAID_DIAGRAM_TYPE_PATTERN = /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie(?:\s+title)?|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|c4Container|c4Component|c4Dynamic|c4Deployment|kanban|architecture|block-beta|packet-beta|xychart-beta|sankey-beta)\b/i;
const RAW_MERMAID_AT_END_REGEX = /(^|\n\n)((?:%%\{[\s\S]*?\}%%\s*\n)?(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie(?:\s+title)?|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|c4Container|c4Component|c4Dynamic|c4Deployment|kanban|architecture|block-beta|packet-beta|xychart-beta|sankey-beta)\b[\s\S]*)$/i;

// ==================== EXTRACTORS ====================

function normalizeFenceLanguage(rawLanguage: string | undefined): string {
  return (rawLanguage ?? "").trim().toLowerCase();
}

function parseChartDefinition(raw: string): ChartBlock | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.data)) {
      return null;
    }

    if (parsed.type !== "bar" && parsed.type !== "line" && parsed.type !== "pie") {
      return null;
    }

    return parsed as ChartBlock;
  } catch {
    return null;
  }
}

function sanitizeMermaidCode(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function getFirstMermaidDirective(code: string): string | undefined {
  return code
    .replace(/^%%\{[\s\S]*?\}%%\s*/m, "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
}

function extractCharts(text: string): { cleanText: string; charts: ChartBlock[] } {
  const charts: ChartBlock[] = [];
  const cleanText = text.replace(FENCED_BLOCK_REGEX, (match, prefix, _fullFence, rawLanguage, content) => {
    const language = normalizeFenceLanguage(rawLanguage);
    if (!CHART_FENCE_LANGUAGES.has(language)) {
      return match;
    }

    const parsed = parseChartDefinition(content);
    if (!parsed) {
      return match;
    }

    charts.push(parsed);
    return prefix;
  });
  return { cleanText: cleanText.trim(), charts };
}

function extractMermaid(text: string): { cleanText: string; diagrams: string[] } {
  const diagrams: string[] = [];
  const withFencedRemoved = text.replace(FENCED_BLOCK_REGEX, (match, prefix, _fullFence, rawLanguage, code) => {
    const language = normalizeFenceLanguage(rawLanguage);
    const trimmed = sanitizeMermaidCode(code);
    if (!trimmed) {
      return match;
    }

    const normalized = getFirstMermaidDirective(trimmed);
    const looksLikeMermaid =
      (!!language && MERMAID_FENCE_LANGUAGES.has(language)) ||
      (!!normalized && MERMAID_DIAGRAM_TYPE_PATTERN.test(normalized));

    if (looksLikeMermaid && normalized && MERMAID_DIAGRAM_TYPE_PATTERN.test(normalized)) {
      diagrams.push(trimmed);
      return prefix;
    }

    return match;
  });

  const rawMatch = withFencedRemoved.match(RAW_MERMAID_AT_END_REGEX);
  if (rawMatch) {
    const rawDiagram = sanitizeMermaidCode(rawMatch[2]);
    const normalized = getFirstMermaidDirective(rawDiagram);
    if (normalized && MERMAID_DIAGRAM_TYPE_PATTERN.test(normalized)) {
      diagrams.push(rawDiagram);
      const prefix = withFencedRemoved.slice(0, rawMatch.index ?? 0);
      return { cleanText: prefix.trim(), diagrams };
    }
  }

  return { cleanText: withFencedRemoved.trim(), diagrams };
}

function extractFiles(text: string): { cleanText: string; files: FileBlock[] } {
  const files: FileBlock[] = [];
  const cleanText = text.replace(/```file:(\S+)\s*\n([\s\S]*?)```/g, (_, filename, content) => {
    const ext = filename.split(".").pop()?.toLowerCase() || "txt";
    const validTypes = ["csv", "txt", "json", "xml", "html", "md", "xlsx"];
    files.push({
      filename,
      content: content.trim(),
      type: validTypes.includes(ext) ? ext as FileBlock["type"] : "txt",
    });
    return "";
  });
  return { cleanText: cleanText.trim(), files };
}

function extractImages(text: string): { cleanText: string; images: string[] } {
  const images: string[] = [];
  const cleanText = text.replace(/!\[([^\]]*)\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, (_, _alt, url) => {
    images.push(url);
    return "";
  });
  return { cleanText: cleanText.trim(), images };
}

// ==================== XLSX HELPER ====================

function csvToXlsxBlob(csvContent: string, filename: string): Blob {
  // Parse CSV into array of arrays
  const rows = csvContent.split("\n").map(row => {
    // Handle quoted CSV fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }).filter(r => r.some(c => c.length > 0));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto-width columns
  if (rows.length > 0) {
    ws["!cols"] = rows[0].map((_, ci) => {
      const maxLen = Math.max(...rows.map(r => (r[ci] || "").length));
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });
  }

  const sheetName = filename.replace(/\.[^.]+$/, "").slice(0, 31) || "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ==================== RENDERERS ====================

function MermaidRenderer({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string>("");
  const [fallbackCode, setFallbackCode] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const sanitizedCode = sanitizeMermaidCode(code);
        await mermaid.parse(sanitizedCode, { suppressErrors: false });
        const id = `mermaid-${uniqueId}-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(id, sanitizedCode);
        if (!cancelled) {
          setSvg(rendered);
          setFallbackCode("");
        }
      } catch {
        if (!cancelled) {
          setSvg("");
          setFallbackCode(code);
        }
      }
    };
    render();
    return () => { cancelled = true; };
  }, [code, uniqueId]);

  if (fallbackCode) {
    return (
      <div className="my-2 rounded-lg border bg-muted/30 p-3 overflow-x-auto [&_p]:hidden">
        <p className="text-xs text-warning font-medium mb-1">⚠️ Diagram render error</p>
        <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap">{fallbackCode}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 my-2 animate-pulse">
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          Rendering diagram...
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-lg border bg-card/50 p-3 overflow-x-auto">
      <div
        ref={containerRef}
        className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

function FileDownloadBlock({ file }: { file: FileBlock }) {
  const [copied, setCopied] = useState(false);

  const isXlsx = file.type === "xlsx" || file.filename.endsWith(".xlsx");
  const isCsv = file.type === "csv" || file.filename.endsWith(".csv");

  const handleDownload = (asXlsx?: boolean) => {
    if (asXlsx || isXlsx) {
      // Generate real Excel file from CSV content
      const blob = csvToXlsxBlob(file.content, file.filename);
      const finalName = file.filename.replace(/\.(csv|txt)$/, ".xlsx").replace(/(?<!\.xlsx)$/, s => s.endsWith(".xlsx") ? "" : ".xlsx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = finalName.endsWith(".xlsx") ? finalName : `${finalName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const mimeTypes: Record<string, string> = {
      csv: "text/csv",
      txt: "text/plain",
      json: "application/json",
      xml: "application/xml",
      html: "text/html",
      md: "text/markdown",
    };
    const blob = new Blob([file.content], { type: mimeTypes[file.type] || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const FileIcon = (isCsv || isXlsx) ? FileSpreadsheet : FileText;

  return (
    <div className="my-2 rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <FileIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">{file.filename}</span>
          <span className="text-[10px] text-muted-foreground uppercase">{file.type}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Copy"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {(isCsv || isXlsx) && (
            <button
              onClick={() => handleDownload(true)}
              className="h-7 px-2.5 rounded-md flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700 transition-colors text-[10px] font-medium"
              title="Download as Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-3 w-3" />
              Excel
            </button>
          )}
          <button
            onClick={() => handleDownload(false)}
            className="h-7 px-2.5 rounded-md flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-[10px] font-medium"
          >
            <Download className="h-3 w-3" />
            {isCsv ? "CSV" : "Download"}
          </button>
        </div>
      </div>
      <pre className="p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto max-h-40 overflow-y-auto">
        {file.content.slice(0, 2000)}{file.content.length > 2000 ? "\n..." : ""}
      </pre>
    </div>
  );
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

// ==================== MAIN RENDERER ====================

export function ChatMessageRenderer({ content, role }: { content: string; role: "user" | "bot" | "assistant" }) {
  const processed = useMemo(() => {
    const { cleanText: t1, charts } = extractCharts(content);
    const { cleanText: t2, diagrams } = extractMermaid(t1);
    const { cleanText: t3, files } = extractFiles(t2);
    const { cleanText, images } = extractImages(t3);
    return { cleanText, charts, diagrams, files, images };
  }, [content]);

  const isUser = role === "user";

  if (isUser) {
    return <p className="text-sm whitespace-pre-line">{content}</p>;
  }

  return (
    <div className="space-y-2">
      {processed.cleanText && (
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
            {processed.cleanText}
          </ReactMarkdown>
        </div>
      )}

      {processed.images.map((src, i) => (
        <img key={i} src={src} alt="" className="rounded-lg max-w-full max-h-60 border" loading="lazy" />
      ))}

      {processed.diagrams.map((code, i) => (
        <MermaidRenderer key={i} code={code} />
      ))}

      {processed.charts.map((chart, i) => (
        <ChartRenderer key={i} chart={chart} />
      ))}

      {processed.files.map((file, i) => (
        <FileDownloadBlock key={i} file={file} />
      ))}
    </div>
  );
}
