"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Database,
  Code2,
  Table as TableIcon,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Activity,
  Paperclip,
  Loader2,
  Download,
  Image as ImageIcon,
  MessageSquare,
  Trash2,
  Settings2,
  CheckCircle2,
  XCircle,
  X,
  Zap,
  ShieldCheck,
  Cpu,
  Copy,
  Check,
  Sparkles,
  Layers,
  Terminal,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toPng } from "html-to-image";

type ChartType = "bar" | "line" | "area" | "pie";

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  columns?: string[];
  rows?: Record<string, any>[];
  selectedChart?: ChartType;
  execution_time_ms?: number;
  correction_history?: string[];
  explain_plan?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

const PIE_COLORS = [
  "#6366f1",
  "#06b6d4",
  "#a855f7",
  "#ec4899",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
];

const PROMPT_SUGGESTIONS = [
  "Show top 5 organizations by employee count with a chart",
  "Calculate average stock and price grouped by category",
  "Find the most frequent industry and list its total companies",
  "Compare total leads revenue across different categories",
];

export default function ChatInterface() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [dbUri, setDbUri] = useState("sqlite:///sales.db");
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [tempDbUri, setTempDbUri] = useState("sqlite:///sales.db");
  const [testingDb, setTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{
    success: boolean;
    message: string;
    tables?: string[];
  } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    const savedUri = localStorage.getItem("sql_agent_db_uri");
    if (savedUri) {
      setDbUri(savedUri);
      setTempDbUri(savedUri);
    }

    const saved = localStorage.getItem("sql_agent_sessions");
    if (saved) {
      try {
        const parsed: ChatSession[] = JSON.parse(saved);
        setSessions(parsed);
        if (parsed.length > 0) {
          setCurrentSessionId(parsed[0].id);
          setMessages(parsed[0].messages);
        } else {
          startNewChat();
        }
      } catch {
        startNewChat();
      }
    } else {
      startNewChat();
    }
  }, []);

  const updateCurrentMessages = (newMsgs: Message[]) => {
    setMessages(newMsgs);
    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id === currentSessionId) {
          const firstUserMsg = newMsgs.find((m) => m.role === "user");
          const title = firstUserMsg
            ? firstUserMsg.content.slice(0, 26) + "..."
            : "Session Initialized";
          return { ...s, title, messages: newMsgs };
        }
        return s;
      });
      localStorage.setItem("sql_agent_sessions", JSON.stringify(updated));
      return updated;
    });
  };

  const startNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: "New Query Stream",
      messages: [],
      timestamp: Date.now(),
    };
    setSessions((prev) => {
      const updated = [newSession, ...prev];
      localStorage.setItem("sql_agent_sessions", JSON.stringify(updated));
      return updated;
    });
    setCurrentSessionId(newId);
    setMessages([]);
  };

  const switchSession = (id: string) => {
    const target = sessions.find((s) => s.id === id);
    if (target) {
      setCurrentSessionId(target.id);
      setMessages(target.messages);
    }
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== id);
    setSessions(filtered);
    localStorage.setItem("sql_agent_sessions", JSON.stringify(filtered));
    if (currentSessionId === id) {
      if (filtered.length > 0) {
        setCurrentSessionId(filtered[0].id);
        setMessages(filtered[0].messages);
      } else {
        startNewChat();
      }
    }
  };

  const handleTestAndSaveDb = async () => {
    setTestingDb(true);
    setDbTestResult(null);
    try {
      const res = await fetch("/api/test-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ db_uri: tempDbUri }),
      });
      const data = await res.json();
      if (data.success) {
        setDbUri(tempDbUri);
        localStorage.setItem("sql_agent_db_uri", tempDbUri);
        setDbTestResult({
          success: true,
          message: `Connected successfully! Found ${data.tables.length} tables:`,
          tables: data.tables,
        });
      } else {
        setDbTestResult({ success: false, message: data.error });
      }
    } catch (err: any) {
      setDbTestResult({ success: false, message: err.message });
    } finally {
      setTestingDb(false);
    }
  };

  const executePrompt = async (promptText: string) => {
    if (!promptText.trim() || loading) return;

    const userMsg: Message = { role: "user", content: promptText };
    const baseMessages = [...messages, userMsg];
    updateCurrentMessages(baseMessages);
    setInput("");
    setLoading(true);

    const cleanPayload = baseMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const assistantMsg: Message = {
      role: "assistant",
      content: "",
      selectedChart: "bar",
    };
    const streamingList = [...baseMessages, assistantMsg];
    setMessages(streamingList);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: cleanPayload, db_uri: dbUri }),
      });

      if (!res.body) throw new Error("No response stream available");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let currentAssistant = { ...assistantMsg };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.replace("data: ", "").trim();

          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === "metadata") {
              currentAssistant = {
                ...currentAssistant,
                sql: parsed.sql,
                columns: parsed.columns,
                rows: parsed.rows,
                execution_time_ms: parsed.execution_time_ms,
                correction_history: parsed.correction_history,
                explain_plan: parsed.explain_plan,
              };
            } else if (parsed.type === "token") {
              currentAssistant.content += parsed.content;
            }

            const updatedStream = [...baseMessages, { ...currentAssistant }];
            setMessages(updatedStream);
          } catch {
            // Ignore incomplete chunks
          }
        }
      }

      updateCurrentMessages([...baseMessages, { ...currentAssistant }]);
    } catch {
      updateCurrentMessages([
        ...baseMessages,
        { role: "assistant", content: "Error: Stream interrupted by host agent." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executePrompt(input);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        updateCurrentMessages([
          ...messages,
          {
            role: "assistant",
            content: `⚡ **Dataset Ingestion Complete!**\n- **Target Entity:** \`${data.table_name}\`\n- **Vector Size:** ${data.rows_count} records\n- **Schema Columns:** \`${data.columns.join(", ")}\`\n\nYou can now execute natural language queries against this table.`,
          },
        ]);
      } else {
        updateCurrentMessages([
          ...messages,
          { role: "assistant", content: `❌ Ingestion Failure: ${data.error}` },
        ]);
      }
    } catch (err: any) {
      updateCurrentMessages([
        ...messages,
        { role: "assistant", content: `❌ Transmission Error: ${err.message}` },
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const copySQL = (sqlText: string, index: number) => {
    navigator.clipboard.writeText(sqlText);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const downloadCSV = (columns: string[], rows: Record<string, any>[]) => {
    const header = columns.join(",");
    const csvRows = rows.map((row) =>
      columns.map((col) => JSON.stringify(row[col] ?? "")).join(",")
    );
    const csvContent =
      "data:text/csv;charset=utf-8," + [header, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `telemetry_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportChartAsPNG = async (idx: number) => {
    const chartElement = document.getElementById(`chart-container-${idx}`);
    if (!chartElement) return;

    try {
      const dataUrl = await toPng(chartElement, {
        backgroundColor: "#030712",
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `neural_chart_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export chart snapshot:", err);
    }
  };

  const toggleChartType = (msgIdx: number, type: ChartType) => {
    const updated = [...messages];
    updated[msgIdx].selectedChart = type;
    updateCurrentMessages(updated);
  };

  const getChartConfig = (columns?: string[], rows?: Record<string, any>[]) => {
    if (!columns || !rows || rows.length <= 1 || columns.length < 2) return null;
    const firstRow = rows[0];
    const numericCol = columns.find((col) => typeof firstRow[col] === "number");
    const stringCol = columns.find((col) => typeof firstRow[col] === "string");
    if (numericCol && stringCol) {
      return { xKey: stringCol, yKey: numericCol };
    }
    return null;
  };

  return (
    <div className="flex h-screen bg-[#030712] text-zinc-100 cyber-grid overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Ambient Neon Background Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Cyber Sidebar */}
      <aside className="w-72 glass-panel border-r border-white/10 p-5 flex flex-col justify-between hidden md:flex z-20 relative shadow-2xl">
        <div className="space-y-6">
          {/* Logo HUD */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                  <div className="w-full h-full bg-zinc-950 rounded-[11px] flex items-center justify-center">
                    <Database className="w-4 h-4 text-cyan-400" />
                  </div>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-zinc-950 animate-pulse" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-wider uppercase bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  SYNAPSE SQL
                </h1>
                <p className="text-[10px] text-zinc-400 font-mono tracking-tighter">
                  NEURAL DATA AGENT
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsDbModalOpen(true)}
              className="p-2 glass-panel rounded-xl hover:border-indigo-500/50 text-zinc-400 hover:text-cyan-300 transition-all duration-300 group"
              title="Database Node Config"
            >
              <Settings2 className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
            </button>
          </div>

          {/* New Query Session Button */}
          <button
            onClick={startNewChat}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide bg-gradient-to-r from-indigo-600/80 to-indigo-700/80 hover:from-indigo-500 hover:to-indigo-600 border border-indigo-400/30 shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300 group-hover:scale-125 transition-transform" />
            <span>INITIALIZE STREAM</span>
          </button>

          {/* History HUD */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-mono tracking-wider text-zinc-300 uppercase">
                Recent Sessions
              </span>
              <Layers className="w-3 h-3 text-zinc-300" />
            </div>
            <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-270px)] pr-1">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => switchSession(s.id)}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all duration-200 ${
                    s.id === currentSessionId
                      ? "glass-panel-glow text-white font-medium border-indigo-500/40"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Terminal
                      className={`w-3.5 h-3.5 shrink-0 ${
                        s.id === currentSessionId ? "text-cyan-400" : "text-zinc-600"
                      }`}
                    />
                    <span className="truncate text-[11px] font-mono">{s.title}</span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Database Connection Indicator */}
        <div
          onClick={() => setIsDbModalOpen(true)}
          className="glass-panel p-3 rounded-xl cursor-pointer hover:border-indigo-500/40 transition-all duration-300 group"
        >
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 truncate">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-mono text-zinc-300 truncate text-[10px]">
                {dbUri.includes("neon")
                  ? "Neon PostgreSQL Cluster"
                  : dbUri.split("@")[1] || dbUri}
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </aside>

      {/* Main Agent Arena */}
      <main className="flex-1 flex flex-col max-w-5xl mx-auto h-full p-4 md:p-6 z-10 relative">
        {/* Message Feed Area */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1.5px] shadow-[0_0_40px_rgba(99,102,241,0.3)]">
                  <div className="w-full h-full bg-[#070d1e] rounded-[22px] flex items-center justify-center">
                    <Bot className="w-9 h-9 text-cyan-400 animate-pulse" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  Autonomous Natural Language SQL Agent
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed font-light">
                  Ask analytical inquiries, drop custom CSV datasets, or toggle
                  connected SQL clusters with self-correcting execution.
                </p>
              </div>

              {/* Instant Prompt Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 w-full pt-4">
                {PROMPT_SUGGESTIONS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => executePrompt(prompt)}
                    className="glass-panel p-3.5 rounded-xl text-left text-xs text-zinc-300 hover:text-white hover:border-indigo-500/50 hover:bg-indigo-950/20 transition-all duration-300 flex items-center justify-between group"
                  >
                    <span className="font-mono text-[11px] line-clamp-2">{prompt}</span>
                    <TrendingUp className="w-3.5 h-3.5 text-zinc-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => {
              const chartConfig = getChartConfig(msg.columns, msg.rows);
              const chartType = msg.selectedChart || "bar";
              const hasAutoCorrected =
                msg.correction_history && msg.correction_history.length > 0;

              return (
                <div
                  key={i}
                  className={`flex gap-3.5 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  } animate-in fade-in slide-in-from-bottom-2 duration-300`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 p-[1px] shrink-0 shadow-lg shadow-indigo-500/20 mt-1">
                      <div className="w-full h-full bg-zinc-950 rounded-[11px] flex items-center justify-center">
                        <Bot className="w-4 h-4 text-cyan-300" />
                      </div>
                    </div>
                  )}

                  <div
                    className={`max-w-[88%] rounded-2xl p-5 space-y-4 shadow-xl ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-indigo-900/30 border border-indigo-400/20"
                        : "glass-panel text-zinc-200 border-white/[0.08]"
                    }`}
                  >
                    {/* Performance & Status Telemetry Bar */}
                    {msg.role === "assistant" &&
                      msg.execution_time_ms !== undefined &&
                      msg.execution_time_ms > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[10px] pb-2 border-b border-white/[0.06]">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-zinc-300 font-mono">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span>{msg.execution_time_ms}ms</span>
                          </span>
                          {hasAutoCorrected && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-mono font-medium shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>SELF-HEALED ({msg.correction_history?.length}x)</span>
                            </span>
                          )}
                        </div>
                      )}

                    {/* Content text */}
                    <div className="whitespace-pre-wrap leading-relaxed text-sm">
                      {msg.content ||
                        (loading && i === messages.length - 1 ? (
                          <div className="flex items-center gap-2 text-zinc-400 font-mono text-xs">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            <span>Synthesizing neural query plan...</span>
                          </div>
                        ) : (
                          ""
                        ))}
                    </div>

                    {/* Executed SQL Box with 1-Click Copy */}
                    {msg.sql && (
                      <div className="rounded-xl overflow-hidden border border-indigo-500/20 bg-[#070d1e]/80">
                        <div className="flex items-center justify-between px-3.5 py-2 bg-indigo-950/40 border-b border-indigo-500/20 text-xs">
                          <div className="flex items-center gap-2 text-indigo-300 font-mono text-[11px] font-semibold">
                            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                            <span>EXECUTED SQL</span>
                          </div>
                          <button
                            onClick={() => copySQL(msg.sql!, i)}
                            className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-cyan-300 transition"
                          >
                            {copiedIndex === i ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">COPIED</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>COPY</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3.5 text-xs font-mono text-cyan-100 overflow-x-auto selection:bg-indigo-600">
                          <code>{msg.sql}</code>
                        </pre>
                        {hasAutoCorrected && (
                          <div className="p-3 bg-emerald-950/30 border-t border-emerald-500/20 text-[11px] text-zinc-300 font-mono space-y-1">
                            <span className="font-semibold text-emerald-400 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Self-Healing Audit:
                            </span>
                            {msg.correction_history?.map((entry, logIdx) => (
                              <p key={logIdx} className="text-zinc-400">
                                • {entry}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* EXPLAIN Plan Accordion */}
                    {msg.explain_plan && (
                      <details className="rounded-xl overflow-hidden border border-amber-500/20 bg-amber-950/10">
                        <summary className="cursor-pointer px-3.5 py-2 text-xs font-mono text-amber-300 font-semibold flex items-center gap-2 hover:bg-amber-950/20 transition">
                          <Cpu className="w-3.5 h-3.5 text-amber-400" />
                          <span>DATABASE EXPLAIN PLAN</span>
                        </summary>
                        <pre className="p-3.5 text-[11px] font-mono text-zinc-300 overflow-x-auto border-t border-amber-500/10 leading-relaxed">
                          {msg.explain_plan}
                        </pre>
                      </details>
                    )}

                    {/* Interactive Data Table HUD */}
                    {msg.rows && msg.rows.length > 0 && msg.columns && (
                      <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-black/40">
                        <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-xs">
                          <div className="flex items-center gap-2 font-mono text-zinc-300 text-[11px]">
                            <TableIcon className="w-3.5 h-3.5 text-indigo-400" />
                            <span>RESULT SET ({msg.rows.length} ROWS)</span>
                          </div>
                          <button
                            onClick={() => downloadCSV(msg.columns!, msg.rows!)}
                            className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 hover:text-cyan-300 transition"
                          >
                            <Download className="w-3 h-3" />
                            <span>EXPORT CSV</span>
                          </button>
                        </div>
                        <div className="overflow-x-auto max-h-52">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="bg-white/[0.03] text-zinc-400 sticky top-0 text-[11px]">
                              <tr>
                                {msg.columns.map((col) => (
                                  <th
                                    key={col}
                                    className="px-3.5 py-2 font-medium tracking-wider"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04] text-zinc-300 text-[11px]">
                              {msg.rows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className="hover:bg-indigo-600/[0.07] transition-colors"
                                >
                                  {msg.columns!.map((col) => (
                                    <td key={col} className="px-3.5 py-2 text-zinc-300">
                                      {String(row[col] ?? "")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Chart HUD with Format Switches & Clean Axis Padding */}
                    {chartConfig && msg.rows && (
                      <div
                        id={`chart-container-${i}`}
                        className="rounded-xl border border-indigo-500/20 bg-[#070d1e]/90 p-4 space-y-4 shadow-xl"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-200">
                              <span className="text-indigo-400 font-semibold">
                                {chartConfig.yKey}
                              </span>
                              <span className="text-zinc-500">by</span>
                              <span className="text-cyan-400 font-semibold">
                                {chartConfig.xKey}
                              </span>
                            </div>

                            {/* Chart Selectors */}
                            <div className="flex glass-panel p-1 rounded-xl border-white/10 gap-0.5">
                              <button
                                onClick={() => toggleChartType(i, "bar")}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-all ${
                                  chartType === "bar"
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                                    : "text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                <BarChart3 className="w-3 h-3" /> BAR
                              </button>
                              <button
                                onClick={() => toggleChartType(i, "line")}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-all ${
                                  chartType === "line"
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                                    : "text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                <LineChartIcon className="w-3 h-3" /> LINE
                              </button>
                              <button
                                onClick={() => toggleChartType(i, "area")}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-all ${
                                  chartType === "area"
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                                    : "text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                <Activity className="w-3 h-3" /> AREA
                              </button>
                              <button
                                onClick={() => toggleChartType(i, "pie")}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-all ${
                                  chartType === "pie"
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                                    : "text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                <PieChartIcon className="w-3 h-3" /> PIE
                              </button>
                            </div>
                          </div>

                          <button
                            onClick={() => exportChartAsPNG(i)}
                            className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-cyan-300 transition"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>PNG SNAPSHOT</span>
                          </button>
                        </div>

                        <div className="h-64 w-full pt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            {chartType === "bar" ? (
                              <BarChart
                                data={msg.rows}
                                margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#1f2937"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey={chartConfig.xKey}
                                  stroke="#9ca3af"
                                  fontSize={10}
                                  tickLine={false}
                                  interval={0}
                                  angle={-15}
                                  textAnchor="end"
                                  height={35}
                                />
                                <YAxis
                                  stroke="#6b7280"
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#030712",
                                    borderColor: "rgba(99, 102, 241, 0.3)",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    color: "#fff",
                                    boxShadow: "0 0 20px rgba(0,0,0,0.8)",
                                  }}
                                />
                                <Bar
                                  dataKey={chartConfig.yKey}
                                  fill="#6366f1"
                                  radius={[6, 6, 0, 0]}
                                />
                              </BarChart>
                            ) : chartType === "line" ? (
                              <LineChart
                                data={msg.rows}
                                margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#1f2937"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey={chartConfig.xKey}
                                  stroke="#9ca3af"
                                  fontSize={10}
                                  tickLine={false}
                                  interval={0}
                                  angle={-15}
                                  textAnchor="end"
                                  height={35}
                                />
                                <YAxis
                                  stroke="#6b7280"
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#030712",
                                    borderColor: "rgba(99, 102, 241, 0.3)",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    color: "#fff",
                                  }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey={chartConfig.yKey}
                                  stroke="#06b6d4"
                                  strokeWidth={3}
                                  dot={{
                                    fill: "#06b6d4",
                                    r: 4,
                                    strokeWidth: 2,
                                    stroke: "#030712",
                                  }}
                                  activeDot={{ r: 6, fill: "#67e8f9" }}
                                />
                              </LineChart>
                            ) : chartType === "area" ? (
                              <AreaChart
                                data={msg.rows}
                                margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
                              >
                                <defs>
                                  <linearGradient
                                    id={`grad-${i}`}
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      offset="5%"
                                      stopColor="#6366f1"
                                      stopOpacity={0.6}
                                    />
                                    <stop
                                      offset="95%"
                                      stopColor="#06b6d4"
                                      stopOpacity={0.0}
                                    />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#1f2937"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey={chartConfig.xKey}
                                  stroke="#9ca3af"
                                  fontSize={10}
                                  tickLine={false}
                                  interval={0}
                                  angle={-15}
                                  textAnchor="end"
                                  height={35}
                                />
                                <YAxis
                                  stroke="#6b7280"
                                  fontSize={11}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#030712",
                                    borderColor: "rgba(99, 102, 241, 0.3)",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey={chartConfig.yKey}
                                  stroke="#6366f1"
                                  strokeWidth={2.5}
                                  fillOpacity={1}
                                  fill={`url(#grad-${i})`}
                                />
                              </AreaChart>
                            ) : (
                              <PieChart>
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "#030712",
                                    borderColor: "rgba(99, 102, 241, 0.3)",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                  }}
                                />
                                <Pie
                                  data={msg.rows}
                                  dataKey={chartConfig.yKey}
                                  nameKey={chartConfig.xKey}
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={85}
                                  innerRadius={45}
                                  paddingAngle={4}
                                >
                                  {msg.rows.map((_, cellIdx) => (
                                    <Cell
                                      key={`cell-${cellIdx}`}
                                      fill={PIE_COLORS[cellIdx % PIE_COLORS.length]}
                                      stroke="#030712"
                                      strokeWidth={2}
                                    />
                                  ))}
                                </Pie>
                              </PieChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-800 p-[1px] shrink-0 mt-1 shadow-md">
                      <div className="w-full h-full bg-zinc-900 rounded-[11px] flex items-center justify-center">
                        <User className="w-4 h-4 text-zinc-300" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {uploading && (
            <div className="flex gap-3.5 animate-pulse">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="glass-panel rounded-2xl p-4 text-cyan-300 text-xs font-mono flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Ingesting vector batch into memory...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Futuristic Floating Input Bar */}
        <form onSubmit={handleSubmit} className="mt-4 relative">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="glass-panel p-1.5 rounded-2xl flex items-center gap-2 border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] focus-within:border-indigo-500/50 focus-within:shadow-[0_0_25px_rgba(99,102,241,0.25)] transition-all duration-300">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || loading}
              className="p-3 text-zinc-400 hover:text-cyan-300 rounded-xl hover:bg-white/[0.04] transition-all disabled:opacity-40"
              title="Upload CSV Schema"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask an analytical inquiry or request a chart visualization..."
              className="flex-1 bg-transparent px-2 py-2 text-xs md:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-sans"
            />

            <button
              type="submit"
              disabled={loading || !input.trim() || uploading}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-30 text-white text-xs font-semibold shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all duration-300 flex items-center gap-1.5"
            >
              <span>SEND</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </main>

      {/* Futuristic Database Configuration Modal */}
      {isDbModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="glass-panel border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Database className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white font-mono">
                    DATABASE NODE ROUTER
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Configure target connection string
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDbModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase text-zinc-400">
                Connection URI
              </label>
              <input
                type="text"
                value={tempDbUri}
                onChange={(e) => setTempDbUri(e.target.value)}
                placeholder="postgresql://user:pass@host:5432/dbname"
                className="w-full glass-panel border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-indigo-500/50"
              />
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.04] text-[10px] font-mono text-zinc-400 space-y-1">
                <p className="text-zinc-300 font-semibold">SUPPORTED DRIVERS:</p>
                <p>
                  • SQLite:{" "}
                  <code className="text-indigo-300">sqlite:///sales.db</code>
                </p>
                <p>
                  • PostgreSQL:{" "}
                  <code className="text-indigo-300">
                    postgresql://user:pass@host:5432/db
                  </code>
                </p>
                <p>
                  • MySQL:{" "}
                  <code className="text-indigo-300">
                    mysql+pymysql://user:pass@host:3306/db
                  </code>
                </p>
              </div>
            </div>

            {dbTestResult && (
              <div
                className={`p-3.5 rounded-xl text-xs font-mono flex items-start gap-2.5 ${
                  dbTestResult.success
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30"
                    : "bg-rose-950/40 text-rose-300 border border-rose-500/30"
                }`}
              >
                {dbTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{dbTestResult.message}</p>
                  {dbTestResult.tables && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {dbTestResult.tables.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-500/30 text-[10px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsDbModalOpen(false)}
                className="px-4 py-2 text-xs font-mono rounded-xl glass-panel text-zinc-400 hover:text-white transition"
              >
                CLOSE
              </button>
              <button
                type="button"
                onClick={handleTestAndSaveDb}
                disabled={testingDb || !tempDbUri.trim()}
                className="px-4 py-2 text-xs font-mono font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-600/30"
              >
                {testingDb && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                CONNECT & VERIFY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}