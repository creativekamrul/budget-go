"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, Code2, Copy, FileJson, Search, ShieldCheck, Workflow } from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { useWorkspace } from "@/lib/use-workspace";
import styles from "./developer-docs.module.css";

type Document = { id: string; title: string; group: string; description: string; markdown: string };
const headingId = (text: string) => text.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "-").replace(/^-|-$/g, "");
function linkTarget(href: string) {
  if (/^(https?:\/\/|\/|#)/.test(href)) return href;
  if (/^[a-z-]+\.md(?:#.*)?$/.test(href)) return `/docs/${href.replace(".md", "")}`;
  return "#documentation-content";
}
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (match) return <a href={linkTarget(match[2])} key={index} rel={match[2].startsWith("https:") ? "noreferrer" : undefined}>{match[1]}</a>;
    return part;
  });
}
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState("");
  return <div className={styles.codeBlock}><div><span>{language === "sh" ? "Shell" : language || "Example"}</span><button onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setFailure(""); } catch { setFailure("Copy unavailable. Select the example text to copy it."); } }} aria-label="Copy code example">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div><pre tabIndex={0}><code>{code}</code></pre>{failure && <p role="status">{failure}</p>}</div>;
}
function Markdown({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim(), start = index++;
      const content: string[] = [];
      while (index < lines.length && !lines[index].startsWith("```")) content.push(lines[index++]);
      index++;
      blocks.push(<CodeBlock key={start} language={language} code={content.join("\n")} />); continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const id = headingId(heading[2]);
      blocks.push(heading[1].length === 1 ? <h1 key={index} id={id}>{inline(heading[2])}</h1> : heading[1].length === 2 ? <h2 key={index} id={id}>{inline(heading[2])}</h2> : <h3 key={index} id={id}>{inline(heading[2])}</h3>); index++; continue;
    }
    if (line.startsWith("|") && lines[index + 1]?.match(/^\|[\s:|\-]+\|$/)) {
      const start = index, cells = (value: string) => value.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
      const headers = cells(line); index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith("|")) rows.push(cells(lines[index++]));
      blocks.push(<div className={styles.tableWrap} tabIndex={0} key={start}><table><thead><tr>{headers.map((cell, position) => <th key={position}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, position) => <tr key={position}>{headers.map((_, column) => <td key={column}>{inline(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^(?:\d+\.|-)\s/.test(line)) {
      const start = index, ordered = /^\d+\./.test(line), items: ReactNode[] = [];
      while (index < lines.length && (ordered ? /^\d+\.\s/.test(lines[index]) : /^-\s/.test(lines[index]))) items.push(<li key={index}>{inline(lines[index++].replace(/^(?:\d+\.|-)\s/, ""))}</li>);
      blocks.push(ordered ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>); continue;
    }
    if (line.startsWith("> ")) { blocks.push(<aside className={styles.callout} key={index}><ShieldCheck size={19} aria-hidden="true" /><p>{inline(line.slice(2))}</p></aside>); index++; continue; }
    const start = index, paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(#|\||```|> |\d+\.\s|-\s)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={start}>{inline(paragraph.join(" "))}</p>);
  }
  return blocks;
}

export function DeveloperDocs({ documents, current }: { documents: Document[]; current: string }) {
  const store = useWorkspace();
  const [query, setQuery] = useState("");
  const [exampleLanguage, setExampleLanguage] = useState<"curl" | "javascript">("curl");
  const document = documents.find(item => item.id === current) ?? documents[0];
  const groups = [...new Set(documents.map(item => item.group))];
  const results = useMemo(() => { const search = query.trim().toLowerCase(); return search ? documents.filter(item => `${item.title} ${item.description} ${item.markdown}`.toLowerCase().includes(search)) : []; }, [documents, query]);
  const headings = [...document.markdown.matchAll(/^## (.+)$/gm)].map(match => match[1].trim());
  const documentIndex = documents.findIndex(item => item.id === document.id);
  const next = documents[documentIndex + 1];
  const readExample = exampleLanguage === "curl" ? 'curl "$BUDGET_GO_URL/api/v4/workspace" \\\n  -H "Authorization: Bearer $BUDGET_GO_TOKEN"' : 'const response = await fetch(\n  `${process.env.BUDGET_GO_URL}/api/v4/workspace`,\n  { headers: { Authorization: `Bearer ${process.env.BUDGET_GO_TOKEN}` } }\n);\nif (!response.ok) throw new Error(`HTTP ${response.status}`);\nconst workspace = await response.json();\nconsole.log({ revision: workspace.revision });';
  return <FinanceShell active="Developer docs" data={store.data} defaultCollapsed><div className={styles.root}>
    <div className={styles.banner}><div><p><Code2 size={15} aria-hidden="true" />BUDGET GO / DEVELOPERS</p><strong>Your financial workflow.<br/><span>Your own integrations.</span></strong><span>API, automation and agent guides for a Bangladesh-first ledger.</span></div><div className={styles.bannerLinks}><a href="/api/v3/openapi?download=1"><FileJson size={18} />Download OpenAPI<ArrowDownToLine size={16}/></a><Link href="/docs/n8n"><Workflow size={18} />Set up n8n<ArrowRight size={16}/></Link></div></div>
    <div className={styles.layout}><aside className={styles.sidebar} aria-label="Documentation navigation"><label className={styles.search}><Search size={17}/><span className={styles.srOnly}>Search documentation</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the guides…" /></label>{groups.map(group => <nav key={group} aria-label={group}><p>{group}</p>{documents.filter(item => item.group === group).map(item => <Link href={`/docs/${item.id}`} key={item.id} aria-current={item.id === current ? "page" : undefined} onClick={() => setQuery("")}>{item.title}</Link>)}</nav>)}<a href="/docs/downloads/n8n" download className={styles.download}><ArrowDownToLine size={16}/>n8n starter workflow</a><p className={styles.version}>V4 finance API · BDT / integer poisha<br/>Manual bearer authentication</p></aside>
      <main className={styles.content} id="workspace-main" tabIndex={-1}><div id="documentation-content" className={styles.reading}>
      {query.trim() ? <section className={styles.results} aria-live="polite"><p className={styles.eyebrow}>DOCUMENTATION SEARCH</p><h1>{results.length ? `${results.length} ${results.length === 1 ? "guide" : "guides"} found` : "No matching guides"}</h1><p>Search includes API names, examples and guide contents.</p>{results.map(item => <Link href={`/docs/${item.id}`} key={item.id} onClick={() => setQuery("")}><BookOpen size={20}/><div><strong>{item.title}</strong><p>{item.description}</p></div><ArrowRight size={17}/></Link>)}<button className={styles.clear} onClick={() => setQuery("")}>Clear search</button></section> : <><div className={styles.articleMeta}><span>{document.group}</span><span>Developer guide / V4</span></div><article className={styles.article}><Markdown markdown={document.markdown}/>{current === "api" && <section className={styles.example}><h2 id="read-example">Read example</h2><p>These examples read private environment variables. They do not store credentials in the app or issue a request from this page.</p><div className={styles.languageTabs} role="tablist" aria-label="Example language">{(["curl", "javascript"] as const).map(language => <button type="button" role="tab" id={`example-tab-${language}`} aria-controls="read-example-panel" aria-selected={exampleLanguage === language} key={language} onClick={() => setExampleLanguage(language)}>{language === "curl" ? "cURL" : "JavaScript / Node.js"}</button>)}</div><div id="read-example-panel" role="tabpanel" aria-labelledby={`example-tab-${exampleLanguage}`}><CodeBlock key={exampleLanguage} language={exampleLanguage} code={readExample}/></div></section>}</article><footer className={styles.articleFooter}><span>Examples use placeholders and synthetic data.</span>{next && <Link href={`/docs/${next.id}`}>Next: {next.title}<ArrowRight size={17}/></Link>}</footer></>}
      </div></main>{!query.trim() && <aside className={styles.contents} aria-label="On this page"><p>On this page</p>{headings.map(heading => <a key={heading} href={`#${headingId(heading)}`}>{heading}</a>)}<Link href="/settings/integrations">Manage integration access<ArrowRight size={14}/></Link></aside>}
    </div></div></FinanceShell>;
}
