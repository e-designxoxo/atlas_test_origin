import { useState, useEffect, useRef } from "react"
import atlasLogo from "@/imports/image.png"
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback"
import {
  Upload, FileText, Network, Bell, Search, Settings,
  ChevronRight, ChevronDown, X, Menu,
  BookOpen, Scale, Globe, Gavel, Database,
  AlertTriangle, Info, Check, Clock,
  Link2, ExternalLink, Download,
  Share2, Filter, Calendar,
  MoreHorizontal, Plus, Folder, Hash,
  AlertCircle, Zap, Eye, Map, Layers,
} from "lucide-react"

// ── Palette ───────────────────────────────────────────────────────────────

const C = {
  cream:    "#F7F4EE",
  teal:     "#447F80",
  tealDark: "#335F60",
  tealFade: "rgba(68,127,128,0.10)",
  slate:    "#636885",
  navy:     "#141928",
  navyMid:  "#1D2640",
  navyHi:   "#26304E",
  platinum: "#DAD8E1",
  glacier:  "#B0B8E1",
  glacierFade: "rgba(176,184,225,0.18)",
  ink:      "#1A1C2E",
  muted:    "#636885",
  dimmer:   "#9196AE",
  border:   "#DAD8E1",
  card:     "#FFFFFF",
  amber:    "#C4935A",
  red:      "#C84B4B",
  green:    "#4A9B6A",
  SERIF:    "'Playfair Display', serif",
  SANS:     "'DM Sans', sans-serif",
  MONO:     "'JetBrains Mono', monospace",
}

// ── Mock Library Data ────────────────────────────────────────────────────

const LIBRARY_DOCS = [
  { id: "mifid2",   title: "Directive 2014/65/EU", short: "MiFID II",            type: "directive",   field: "Trade & Finance",  date: "15 May 2014",         connections: 47, alerts: 3, status: "In Force" },
  { id: "ecj-c413", title: "ECJ C-413/14 P",       short: "Intel v Commission",  type: "judgment",    field: "EU Competition",   date: "6 Sep 2017",          connections: 31, alerts: 0, status: "Final" },
  { id: "tfeu101",  title: "Art. 101 TFEU",         short: "Competition Law",     type: "regulation",  field: "EU Competition",   date: "1 Dec 2009",          connections: 88, alerts: 1, status: "In Force" },
  { id: "gdpr83",   title: "GDPR Art. 83",          short: "Administrative Fines",type: "regulation",  field: "Data Protection",  date: "25 May 2018",         connections: 24, alerts: 2, status: "In Force" },
  { id: "rome1",    title: "Rome I Regulation",     short: "Contractual Oblig.",  type: "regulation",  field: "Civil Law",        date: "17 Jun 2008",         connections: 19, alerts: 0, status: "In Force" },
]

const TYPE_COLORS: Record<string, string> = {
  directive:   "#447F80",
  judgment:    "#C4935A",
  regulation:  "#636885",
  treaty:      "#7A6AAA",
  instrument:  "#4A9B6A",
  statute:     "#C4935A",
}

// ── Full Fiche for MiFID II ───────────────────────────────────────────────

const MIFID_FICHE = {
  docType:      "European Directive",
  ref:          "2014/65/EU",
  fullTitle:    "Directive of the European Parliament and of the Council on markets in financial instruments and amending Directive 2002/92/EC and Directive 2011/61/EU",
  short:        "MiFID II",
  jurisdiction: "European Union",
  body:         "European Parliament & Council of the EU",
  dateAdopted:  "15 May 2014",
  dateForce:    "3 January 2018",
  field:        "Trade & Finance Law",
  status:       "In Force",
  amendedBy:    ["Directive 2016/1034/EU", "Directive 2019/2034/EU (IFD)"],
  summary: "MiFID II establishes a harmonised regulatory framework for investment services across EU financial markets. It substantially strengthens investor protection, enhances market transparency, and expands the scope of the original MiFID (2004/39/EC) to cover organised trading facilities, systematic internalisers, and a wider class of financial instruments. The Directive operates alongside MiFIR (Regulation 600/2014), which sets out directly applicable trading and reporting obligations.",
  provisions: [
    { art: "Art. 25", title: "Assessment of suitability and appropriateness", detail: "Investment firms must obtain necessary information about clients' knowledge and experience, financial situation, and investment objectives before providing investment advice or portfolio management. Firms must ensure that recommended instruments are suitable for the client." },
    { art: "Art. 27", title: "Obligation to execute orders on terms most favourable", detail: "Investment firms must take all sufficient steps to obtain the best possible result for clients when executing client orders, taking into account price, costs, speed, likelihood of execution and settlement, size, nature, or any other consideration relevant to the execution of the order." },
    { art: "Art. 44", title: "Admission of financial instruments to trading", detail: "Regulated markets shall adopt and publish transparent and non-discriminatory rules for the admission of financial instruments to trading. Regulated markets may only admit financial instruments to trading where the issuer has complied with applicable disclosure requirements." },
    { art: "Art. 54", title: "Suitability assessment", detail: "Detailed implementing rules on how investment firms must conduct and document the suitability assessment when providing investment advice or discretionary portfolio management, including minimum information to be obtained and periodic reassessment requirements." },
    { art: "Art. 58", title: "Transaction reporting to competent authorities", detail: "Investment firms executing transactions in financial instruments admitted to trading on a regulated market, MTF, OTF, or for which a request for admission to trading has been made, must report complete and accurate details of such transactions to the competent authority as quickly as possible, and no later than the close of the following working day." },
  ],
  concepts: ["Best Execution", "Suitability", "Appropriateness", "Investment Advice", "Algorithmic Trading", "Market Transparency", "Client Classification", "Systematic Internaliser", "Transaction Reporting", "Product Governance", "Unbundling", "OTF", "MTF"],
  connections: [
    { title: "MiFIR — Regulation 600/2014",            type: "regulation",  rel: "Implemented by",   conns: 13 },
    { title: "ESMA RTS & ITS (13 technical standards)", type: "regulation",  rel: "Supplemented by",  conns: 13 },
    { title: "MiFID I — Directive 2004/39/EC",          type: "directive",   rel: "Replaces",         conns: 8 },
    { title: "Capital Markets Union Package",            type: "directive",   rel: "Part of",          conns: 5 },
    { title: "ECJ C-186/18 — Société Générale",         type: "judgment",    rel: "Interpreted by",   conns: 3 },
    { title: "Basel III Accord",                         type: "treaty",      rel: "Contextual link",  conns: 2 },
  ],
  alerts: [
    { date: "15 Jan 2026", sev: "high",   title: "ESMA Q&A — 47 new clarifications", text: "ESMA published updated Q&A on MiFID II data reporting obligations, including 47 new questions and answers on transaction reporting and commodity derivatives." },
    { date: "3 Mar 2025",  sev: "medium", title: "Delegated Regulation amendment",    text: "Commission Delegated Regulation amending RTS 1 on pre-trade and post-trade transparency requirements for equity instruments entered into force." },
    { date: "12 Nov 2024", sev: "low",    title: "ESMA Supervisory Report",           text: "Annual supervisory convergence report on MiFID II research unbundling published. Key findings on member state implementation divergences." },
  ],
  jurisdictions: [
    { code: "EU", name: "European Union",  authority: "ESMA",  impl: "Primary legislation",        status: "In Force" },
    { code: "FR", name: "France",          authority: "AMF",   impl: "Ord. 2017-1107 + RG AMF",    status: "Transposed" },
    { code: "GB", name: "United Kingdom",  authority: "FCA",   impl: "UK MiFID (post-Brexit)",      status: "Diverging" },
    { code: "DE", name: "Germany",         authority: "BaFin", impl: "WpHG (Securities Act)",       status: "Transposed" },
  ],
  timeline: [
    { year: "2004", text: "MiFID I adopted (Dir. 2004/39/EC)" },
    { year: "2014", text: "MiFID II & MiFIR adopted by Parliament" },
    { year: "2018", text: "MiFID II enters into application (3 Jan)" },
    { year: "2020", text: "Quick Fix: COVID-19 amendments to transparency waivers" },
    { year: "2021", text: "Investment Firms Regulation (IFR/IFD) cross-reference" },
    { year: "2025", text: "CMU 2.0 review: Listing Act amendments proposed" },
  ],
}

// ── Search Corpus ────────────────────────────────────────────────────────

const SEARCH_CORPUS = [
  { id: "mifid2-25",  title: "MiFID II — Art. 25 Suitability",         type: "directive",  field: "Trade & Finance",  excerpt: "Investment firms must obtain necessary information about clients' knowledge, financial situation, and investment objectives…" },
  { id: "ecj-c413",   title: "ECJ C-413/14 P — Intel v Commission",    type: "judgment",   field: "EU Competition",   excerpt: "A dominant undertaking is not prohibited from engaging in competition on the merits. However, all the circumstances…" },
  { id: "tfeu-101",   title: "Art. 101 TFEU — Prohibited agreements",  type: "regulation", field: "EU Competition",   excerpt: "The following shall be prohibited as incompatible with the internal market: all agreements between undertakings…" },
  { id: "gdpr-83",    title: "GDPR Art. 83 — Administrative fines",    type: "regulation", field: "Data Protection",  excerpt: "Each supervisory authority shall ensure that each administrative fine imposed is effective, proportionate and dissuasive…" },
  { id: "rome1-3",    title: "Rome I Reg. — Art. 3 Freedom of choice", type: "regulation", field: "Civil Law",        excerpt: "A contract shall be governed by the law chosen by the parties. The choice shall be made expressly or clearly…" },
  { id: "basel3-lr",  title: "Basel III — Leverage Ratio Framework",   type: "treaty",     field: "Banking Law",      excerpt: "Banks must maintain a leverage ratio of at least 3% (Tier 1 capital to total exposure). The ratio is designed to…" },
  { id: "icc-23",     title: "ICC Rules 2021 — Art. 23 Terms of Ref.", type: "instrument", field: "Arbitration",      excerpt: "As soon as it has received the file from the Secretariat, the arbitral tribunal shall draw up, on the basis of…" },
]

// ── General Alerts ───────────────────────────────────────────────────────

const GEN_ALERTS = [
  { date: "15 Jan 2026", sev: "high",   doc: "MiFID II",       field: "Trade & Finance", title: "ESMA Q&A Update — 47 new clarifications on data reporting" },
  { date: "22 Dec 2025", sev: "medium", doc: "Art. 101 TFEU",  field: "EU Competition",  title: "ECJ ruling C-238/25 — New safe harbor interpretation" },
  { date: "3 Mar 2025",  sev: "medium", doc: "MiFID II",       field: "Trade & Finance", title: "Delegated Regulation amends RTS on pre-trade transparency" },
  { date: "12 Nov 2024", sev: "low",    doc: "MiFID II",       field: "Trade & Finance", title: "ESMA supervisory convergence report — research unbundling" },
  { date: "8 Oct 2024",  sev: "low",    doc: "GDPR Art. 83",   field: "Data Protection", title: "EDPB revised guidelines on administrative fines calculation" },
]

// ── Mini Knowledge Graph ─────────────────────────────────────────────────

const MINI_NODES = [
  { id: "c",  label: "MiFID II",       sub: "Dir. 2014/65/EU", cx: 130, cy: 115, r: 10, color: C.teal },
  { id: "n1", label: "MiFIR",          sub: "Reg. 600/2014",   cx: 130, cy: 32,  r: 6,  color: C.slate },
  { id: "n2", label: "ESMA RTS",       sub: "13 standards",    cx: 220, cy: 68,  r: 5,  color: C.slate },
  { id: "n3", label: "MiFID I",        sub: "Dir. 2004/39",    cx: 130, cy: 200, r: 6,  color: "#9b7ac8" },
  { id: "n4", label: "Basel III",      sub: "BIS Accord",      cx: 38,  cy: 68,  r: 5,  color: "#9b7ac8" },
  { id: "n5", label: "ECJ C-186/18",  sub: "Soc. Générale",   cx: 38,  cy: 165, r: 5,  color: C.amber },
]
const MINI_EDGES: [string, string][] = [
  ["c","n1"],["c","n2"],["c","n3"],["c","n4"],["c","n5"],
]

function MiniGraph() {
  return (
    <svg viewBox="0 0 260 232" className="w-full h-full" style={{ overflow: "visible" }}>
      <defs>
        <filter id="mg-glow">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {MINI_EDGES.map(([a, b]) => {
          const na = MINI_NODES.find(n => n.id === a)!
          const nb = MINI_NODES.find(n => n.id === b)!
          return <path key={`d-${a}-${b}`} id={`mg-${a}-${b}`} d={`M ${na.cx} ${na.cy} L ${nb.cx} ${nb.cy}`} />
        })}
      </defs>

      {MINI_EDGES.map(([a, b]) => {
        const na = MINI_NODES.find(n => n.id === a)!
        const nb = MINI_NODES.find(n => n.id === b)!
        return (
          <line key={`e-${a}-${b}`} x1={na.cx} y1={na.cy} x2={nb.cx} y2={nb.cy}
            stroke="rgba(68,127,128,0.25)" strokeWidth="1" />
        )
      })}

      {MINI_EDGES.slice(0, 4).map(([a, b], i) => (
        <circle key={`pk-${i}`} r="2" fill={C.teal} filter="url(#mg-glow)" opacity="0.85">
          <animateMotion dur={`${2 + i * 0.5}s`} repeatCount="indefinite" begin={`${i * 0.5}s`}>
            <mpath href={`#mg-${a}-${b}`} />
          </animateMotion>
        </circle>
      ))}

      {MINI_NODES.map((node, i) => (
        <g key={node.id} style={{ cursor: "pointer" }}>
          <circle cx={node.cx} cy={node.cy} r={node.r + 4} fill="none" stroke={node.color}
            strokeWidth="0.6" opacity="0">
            <animate attributeName="r" values={`${node.r + 3};${node.r + 10}`}
              dur={`${2.5 + i * 0.2}s`} repeatCount="indefinite" begin={`${i * 0.35}s`} />
            <animate attributeName="opacity" values="0.35;0"
              dur={`${2.5 + i * 0.2}s`} repeatCount="indefinite" begin={`${i * 0.35}s`} />
          </circle>
          <circle cx={node.cx} cy={node.cy} r={node.r} fill={node.color} filter="url(#mg-glow)" />
          <text x={node.cx} y={node.cy - node.r - 6} textAnchor="middle"
            fill={C.ink} fontSize="7.5" fontFamily={C.SANS} fontWeight="500">{node.label}</text>
          <text x={node.cx} y={node.cy + node.r + 10} textAnchor="middle"
            fill={C.muted} fontSize="6" fontFamily={C.MONO}>{node.sub}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Processing Steps ──────────────────────────────────────────────────────

const PROC_STEPS = [
  "Reading document structure & metadata",
  "Extracting legal provisions & articles",
  "Cross-referencing 1,247 indexed documents",
  "Mapping legal connections & relationships",
  "Generating analysis fiche",
]

// ── Sev Badge ─────────────────────────────────────────────────────────────

function SevBadge({ sev }: { sev: string }) {
  const map: Record<string, { bg: string; color: string; Icon: typeof AlertTriangle }> = {
    high:   { bg: "rgba(200,75,75,0.10)",   color: C.red,   Icon: AlertTriangle },
    medium: { bg: "rgba(196,147,90,0.12)",  color: C.amber, Icon: AlertCircle },
    low:    { bg: "rgba(99,104,133,0.12)",  color: C.muted, Icon: Info },
  }
  const { bg, color, Icon } = map[sev] || map.low
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: bg, color, fontFamily: C.SANS }}>
      <Icon size={10} /> {sev}
    </span>
  )
}

// ── Type Badge ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] || C.slate
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide"
      style={{ backgroundColor: `${color}18`, color, fontFamily: C.MONO, fontSize: "10px" }}>
      {type}
    </span>
  )
}

// ── Upload Zone ───────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: { name: string; size: string; type: string }) => void }) {
  const [drag, setDrag] = useState(false)
  const [file, setFile] = useState<{ name: string; size: string; type: string } | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const simulate = (name: string, ext: string) => {
    const types: Record<string, string> = { pdf: "application/pdf", txt: "text/plain", html: "text/html" }
    const sizes = ["142 KB", "387 KB", "1.2 MB", "2.8 MB", "560 KB"]
    const f = { name, size: sizes[Math.floor(Math.random() * sizes.length)], type: types[ext] || "application/octet-stream" }
    setFile(f)
  }

  return (
    <div className="flex flex-col items-center gap-6 h-full justify-center py-10">
      {/* Drop zone */}
      <div
        className="w-full max-w-xl rounded-xl flex flex-col items-center gap-5 py-14 px-8 text-center transition-all duration-200 cursor-pointer"
        style={{
          border: `2px dashed ${drag ? C.teal : C.platinum}`,
          backgroundColor: drag ? C.tealFade : "#FAFAF8",
        }}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) simulate(f.name, f.name.split(".").pop() || "")
        }}
        onClick={() => ref.current?.click()}
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: C.tealFade, border: `1px solid ${C.teal}33` }}>
          <Upload size={26} style={{ color: C.teal }} />
        </div>
        <div>
          <p className="font-semibold text-base mb-1" style={{ fontFamily: C.SERIF, color: C.ink }}>
            Drop a legal document here
          </p>
          <p className="text-sm" style={{ color: C.muted, fontFamily: C.SANS }}>
            Accepts PDF, TXT, HTML — legislation, judgments, directives, reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          {["PDF", "TXT", "HTML"].map(ext => (
            <span key={ext} className="px-3 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: C.glacierFade, color: C.slate, fontFamily: C.MONO }}>
              .{ext.toLowerCase()}
            </span>
          ))}
        </div>
        <button className="px-5 py-2 rounded text-sm font-medium transition-opacity hover:opacity-80"
          style={{ backgroundColor: C.teal, color: "#fff", fontFamily: C.SANS }}>
          Select File
        </button>
        <input ref={ref} type="file" accept=".pdf,.txt,.html" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) simulate(f.name, f.name.split(".").pop() || "") }} />
      </div>

      {/* File preview */}
      {file && (
        <div className="w-full max-w-xl rounded-xl p-5 flex items-center gap-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: C.tealFade }}>
            <FileText size={20} style={{ color: C.teal }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" style={{ fontFamily: C.SANS, color: C.ink }}>{file.name}</p>
            <p className="text-xs mt-0.5" style={{ color: C.muted, fontFamily: C.MONO }}>{file.size} · {file.type}</p>
          </div>
          <button
            className="px-5 py-2 rounded text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
            style={{ backgroundColor: C.teal, color: "#fff", fontFamily: C.SANS }}
            onClick={() => onFile(file)}>
            Begin Analysis <ChevronRight size={14} />
          </button>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setFile(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Or load demo */}
      <p className="text-xs" style={{ color: C.dimmer, fontFamily: C.SANS }}>
        Or{" "}
        <button className="underline underline-offset-2" style={{ color: C.teal }}
          onClick={() => simulate("Directive_2014_65_EU_MiFID_II.pdf", "pdf")}>
          load the MiFID II demo
        </button>
        {" "}to see a full analysis fiche
      </p>
    </div>
  )
}

// ── Processing View ───────────────────────────────────────────────────────

function ProcessingView({ progress, phase }: { progress: number; phase: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 py-12">
      {/* Animated orb */}
      <div className="relative w-28 h-28">
        <style>{`
          @keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes orb-pulse { 0%,100% { opacity:0.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.08); } }
          .orb-ring { animation: orb-spin 3s linear infinite; transform-box: fill-box; transform-origin: center; }
          .orb-core { animation: orb-pulse 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        `}</style>
        <svg viewBox="0 0 112 112" className="w-full h-full">
          <defs>
            <filter id="proc-glow">
              <feGaussianBlur stdDeviation="4" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <circle cx="56" cy="56" r="48" fill="none" stroke={C.platinum} strokeWidth="1.5" />
          <circle cx="56" cy="56" r="48" fill="none" stroke={C.teal} strokeWidth="2"
            strokeDasharray={`${progress * 3.015} 301.5`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease" }} />
          <g className="orb-ring">
            <circle cx="56" cy="8" r="4" fill={C.teal} filter="url(#proc-glow)" />
          </g>
          <circle cx="56" cy="56" r="22" fill={C.tealFade} className="orb-core" />
          <circle cx="56" cy="56" r="12" fill={C.teal} filter="url(#proc-glow)" className="orb-core" />
          <text x="56" y="62" textAnchor="middle" fill="#fff" fontSize="12" fontFamily={C.MONO} fontWeight="500">
            {progress}%
          </text>
        </svg>
      </div>

      {/* Current phase */}
      <div className="text-center">
        <p className="text-lg font-semibold mb-1" style={{ fontFamily: C.SERIF, color: C.ink }}>
          {PROC_STEPS[Math.min(phase, PROC_STEPS.length - 1)]}
        </p>
        <p className="text-sm" style={{ color: C.muted, fontFamily: C.SANS }}>
          ATLAS is building your legal knowledge fiche
        </p>
      </div>

      {/* Step list */}
      <div className="w-full max-w-sm flex flex-col gap-2">
        {PROC_STEPS.map((step, i) => {
          const done = i < phase
          const active = i === phase
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all"
              style={{ backgroundColor: active ? C.tealFade : done ? "rgba(68,127,128,0.04)" : "transparent" }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: done ? C.teal : active ? `${C.teal}33` : C.platinum }}>
                {done
                  ? <Check size={11} color="#fff" />
                  : active
                  ? <div className="w-2 h-2 rounded-full bg-current animate-pulse" style={{ color: C.teal }} />
                  : null}
              </div>
              <span className="text-sm" style={{
                color: done ? C.teal : active ? C.ink : C.dimmer,
                fontFamily: C.SANS,
                fontWeight: active ? 500 : 400,
              }}>
                {step}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Fiche Document ────────────────────────────────────────────────────────

function FicheDocument() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const f = MIFID_FICHE

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1" style={{ backgroundColor: C.border }} />
        <span className="text-xs tracking-widest uppercase px-2"
          style={{ color: C.slate, fontFamily: C.MONO }}>{title}</span>
        <div className="h-px flex-1" style={{ backgroundColor: C.border }} />
      </div>
      {children}
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto py-6 px-2">
      {/* Document header */}
      <div className="rounded-xl p-6 mb-8" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type="directive" />
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(74,155,106,0.12)", color: C.green, fontFamily: C.MONO, fontSize: "10px" }}>
              ● {f.status}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="p-1.5 rounded hover:bg-muted transition-colors" title="Download"><Download size={15} style={{ color: C.muted }} /></button>
            <button className="p-1.5 rounded hover:bg-muted transition-colors" title="Share"><Share2 size={15} style={{ color: C.muted }} /></button>
            <button className="p-1.5 rounded hover:bg-muted transition-colors" title="More"><MoreHorizontal size={15} style={{ color: C.muted }} /></button>
          </div>
        </div>
        <h1 className="text-xl font-bold mb-2 leading-snug" style={{ fontFamily: C.SERIF, color: C.ink }}>
          {f.fullTitle}
        </h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3">
          {[
            { label: "Reference",   val: f.ref },
            { label: "Body",        val: f.body },
            { label: "Adopted",     val: f.dateAdopted },
            { label: "In Force",    val: f.dateForce },
            { label: "Jurisdiction",val: f.jurisdiction },
            { label: "Field",       val: f.field },
          ].map(({ label, val }) => (
            <div key={label}>
              <span className="text-xs uppercase tracking-wide" style={{ color: C.dimmer, fontFamily: C.MONO }}>{label}</span>
              <p className="text-sm font-medium" style={{ color: C.ink, fontFamily: C.SANS }}>{val}</p>
            </div>
          ))}
        </div>
        {f.amendedBy.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
            <span className="text-xs uppercase tracking-wide mr-2" style={{ color: C.dimmer, fontFamily: C.MONO }}>Amended by</span>
            {f.amendedBy.map(a => (
              <span key={a} className="text-xs mr-2" style={{ color: C.teal, fontFamily: C.MONO }}>{a}</span>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <Section title="Executive Summary">
        <div className="rounded-lg p-5" style={{ backgroundColor: C.tealFade, border: `1px solid ${C.teal}22` }}>
          <p className="text-sm leading-relaxed" style={{ color: C.ink, fontFamily: C.SANS }}>{f.summary}</p>
        </div>
      </Section>

      {/* Key Provisions */}
      <Section title="Key Provisions">
        <div className="flex flex-col gap-2">
          {f.provisions.map(p => (
            <div key={p.art} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <button
                className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                style={{ backgroundColor: expanded === p.art ? C.tealFade : C.card }}
                onClick={() => setExpanded(expanded === p.art ? null : p.art)}>
                <span className="text-xs font-bold shrink-0" style={{ color: C.teal, fontFamily: C.MONO, minWidth: "52px" }}>{p.art}</span>
                <span className="flex-1 text-sm font-medium" style={{ color: C.ink, fontFamily: C.SANS }}>{p.title}</span>
                <ChevronDown size={14} style={{ color: C.muted, transform: expanded === p.art ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {expanded === p.art && (
                <div className="px-4 pb-4 pt-1" style={{ backgroundColor: C.tealFade }}>
                  <p className="text-sm leading-relaxed" style={{ color: C.ink, fontFamily: C.SANS }}>{p.detail}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Concepts */}
      <Section title="Legal Concepts Identified">
        <div className="flex flex-wrap gap-2">
          {f.concepts.map(c => (
            <span key={c} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:opacity-80"
              style={{ backgroundColor: C.glacierFade, color: C.slate, border: `1px solid ${C.platinum}`, fontFamily: C.SANS }}>
              <Hash size={9} />{c}
            </span>
          ))}
        </div>
      </Section>

      {/* Connections */}
      <Section title="Connected Documents">
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {f.connections.map((conn, i) => (
            <div key={i}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              style={{ backgroundColor: i % 2 === 0 ? C.card : "#FAFAF8", borderBottom: i < f.connections.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <TypeBadge type={conn.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: C.ink, fontFamily: C.SANS }}>{conn.title}</p>
              </div>
              <span className="text-xs shrink-0" style={{ color: C.muted, fontFamily: C.MONO }}>{conn.rel}</span>
              <span className="text-xs shrink-0" style={{ color: C.dimmer, fontFamily: C.MONO }}>{conn.conns} links</span>
              <ExternalLink size={12} style={{ color: C.dimmer }} />
            </div>
          ))}
        </div>
      </Section>

      {/* Alerts */}
      <Section title="Update Alerts">
        <div className="flex flex-col gap-2">
          {f.alerts.map((a, i) => (
            <div key={i} className="rounded-lg p-4 flex gap-3" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
              <SevBadge sev={a.sev} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium" style={{ color: C.ink, fontFamily: C.SANS }}>{a.title}</p>
                  <span className="text-xs shrink-0" style={{ color: C.dimmer, fontFamily: C.MONO }}>{a.date}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.muted, fontFamily: C.SANS }}>{a.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Jurisdictions */}
      <Section title="Jurisdiction Coverage">
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-4 gap-px text-xs font-medium px-4 py-2.5 uppercase tracking-wide"
            style={{ backgroundColor: "#F5F3EE", color: C.dimmer, fontFamily: C.MONO }}>
            <span>Country</span><span>Authority</span><span>Implementation</span><span>Status</span>
          </div>
          {f.jurisdictions.map((j, i) => (
            <div key={j.code} className="grid grid-cols-4 gap-px px-4 py-3 text-sm"
              style={{ backgroundColor: i % 2 === 0 ? C.card : "#FAFAF8", borderTop: `1px solid ${C.border}`, fontFamily: C.SANS }}>
              <span className="font-medium" style={{ color: C.ink }}>{j.name}</span>
              <span className="font-bold" style={{ color: C.teal, fontFamily: C.MONO, fontSize: "11px" }}>{j.authority}</span>
              <span className="text-xs" style={{ color: C.muted }}>{j.impl}</span>
              <span className="text-xs" style={{ color: j.status === "In Force" || j.status === "Transposed" ? C.green : j.status === "Diverging" ? C.amber : C.muted }}>
                {j.status}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Timeline */}
      <Section title="Legislative Timeline">
        <div className="relative pl-4">
          <div className="absolute left-4 top-2 bottom-2 w-px" style={{ backgroundColor: C.platinum }} />
          {f.timeline.map((t, i) => (
            <div key={i} className="relative flex gap-4 mb-4 last:mb-0">
              <div className="w-3 h-3 rounded-full shrink-0 mt-0.5 z-10" style={{ backgroundColor: i === f.timeline.length - 1 ? C.teal : C.platinum, border: `2px solid ${i === f.timeline.length - 1 ? C.teal : C.border}`, marginLeft: "-4px" }} />
              <div>
                <span className="text-xs font-bold" style={{ color: C.teal, fontFamily: C.MONO }}>{t.year}</span>
                <p className="text-sm mt-0.5" style={{ color: C.ink, fontFamily: C.SANS }}>{t.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Right Panel ───────────────────────────────────────────────────────────

function RightPanel({ activeDoc }: { activeDoc: typeof LIBRARY_DOCS[0] | null }) {
  const [tab, setTab] = useState<"search" | "graph" | "alerts">("search")
  const [query, setQuery] = useState("")

  const results = query.trim()
    ? SEARCH_CORPUS.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) || r.excerpt.toLowerCase().includes(query.toLowerCase()))
    : []

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: C.card, borderLeft: `1px solid ${C.border}` }}>
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: C.border }}>
        {(["search", "graph", "alerts"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-3 text-xs font-medium uppercase tracking-wide transition-colors"
            style={{
              color: tab === t ? C.teal : C.muted,
              borderBottom: tab === t ? `2px solid ${C.teal}` : "2px solid transparent",
              fontFamily: C.MONO,
            }}>
            {t === "search" ? "Search" : t === "graph" ? "Connections" : "Alerts"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* ── Search ── */}
        {tab === "search" && (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search concepts, provisions…"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ backgroundColor: "#F7F4EE", border: `1px solid ${C.border}`, color: C.ink, fontFamily: C.SANS }}
              />
            </div>
            {query.trim() === "" ? (
              <div className="text-center py-8">
                <Map size={28} className="mx-auto mb-2" style={{ color: C.platinum }} />
                <p className="text-xs" style={{ color: C.dimmer, fontFamily: C.SANS }}>Search across your indexed legal corpus by concept, provision, or keyword</p>
              </div>
            ) : results.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: C.muted, fontFamily: C.SANS }}>No results found</p>
            ) : (
              results.map(r => (
                <div key={r.id} className="p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/40"
                  style={{ border: `1px solid ${C.border}`, backgroundColor: C.card }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <TypeBadge type={r.type} />
                    <span className="text-xs" style={{ color: C.dimmer, fontFamily: C.MONO }}>{r.field}</span>
                  </div>
                  <p className="text-sm font-medium mb-1" style={{ color: C.ink, fontFamily: C.SANS }}>{r.title}</p>
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: C.muted, fontFamily: C.SANS }}>{r.excerpt}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Connections Graph ── */}
        {tab === "graph" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: C.ink, fontFamily: C.SANS }}>
                {activeDoc ? activeDoc.short : "Select a document"} — Connection Map
              </p>
              <p className="text-xs" style={{ color: C.dimmer, fontFamily: C.SANS }}>
                {activeDoc ? `${activeDoc.connections} mapped connections` : "Open a document to see its knowledge connections"}
              </p>
            </div>
            <div className="rounded-xl p-3 h-56" style={{ backgroundColor: "#FAFAF8", border: `1px solid ${C.border}` }}>
              <MiniGraph />
            </div>
            <div className="flex flex-col gap-1.5">
              {MIFID_FICHE.connections.slice(0, 4).map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[c.type] || C.slate }} />
                  <span className="text-xs flex-1 truncate" style={{ color: C.ink, fontFamily: C.SANS }}>{c.title}</span>
                  <span className="text-xs shrink-0" style={{ color: C.dimmer, fontFamily: C.MONO }}>{c.conns}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Alerts ── */}
        {tab === "alerts" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium" style={{ color: C.ink, fontFamily: C.SANS }}>Update Alerts</p>
              <button className="flex items-center gap-1 text-xs" style={{ color: C.muted, fontFamily: C.MONO }}>
                <Filter size={10} /> Filter
              </button>
            </div>
            {GEN_ALERTS.map((a, i) => (
              <div key={i} className="p-3 rounded-lg" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <SevBadge sev={a.sev} />
                  <span className="text-xs" style={{ color: C.dimmer, fontFamily: C.MONO }}>{a.date}</span>
                </div>
                <p className="text-xs font-medium mb-0.5" style={{ color: C.ink, fontFamily: C.SANS }}>{a.title}</p>
                <p className="text-xs" style={{ color: C.muted, fontFamily: C.SANS }}>{a.doc} · {a.field}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "workspace", label: "Workspace", Icon: Layers },
  { id: "library",   label: "Library",   Icon: Folder },
  { id: "search",    label: "Search",    Icon: Search },
  { id: "graph",     label: "Knowledge", Icon: Network },
  { id: "alerts",    label: "Alerts",    Icon: Bell },
  { id: "settings",  label: "Settings",  Icon: Settings },
]

function Sidebar({
  activeNav, setActiveNav, activeDoc, setActiveDoc, setStage,
}: {
  activeNav: string
  setActiveNav: (v: string) => void
  activeDoc: typeof LIBRARY_DOCS[0] | null
  setActiveDoc: (d: typeof LIBRARY_DOCS[0]) => void
  setStage: (s: "upload" | "processing" | "fiche") => void
}) {
  return (
    <div className="flex flex-col h-full w-52 shrink-0" style={{ backgroundColor: C.navy, borderRight: `1px solid ${C.navyHi}` }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4" style={{ borderBottom: `1px solid ${C.navyHi}` }}>
        <ImageWithFallback src={atlasLogo} alt="ATLAS" className="w-8 h-8 rounded-lg object-contain" />
        <div>
          <span className="text-sm font-bold tracking-widest block" style={{ color: "#FFFFFF", fontFamily: C.SANS }}>ATLAS</span>
          <span className="text-xs" style={{ color: C.glacier, fontFamily: C.MONO, fontSize: "9px", opacity: 0.7 }}>Workplace v3</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 py-3">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button key={id}
            onClick={() => setActiveNav(id)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full text-left transition-all"
            style={{
              backgroundColor: activeNav === id ? C.navyHi : "transparent",
              color: activeNav === id ? "#FFFFFF" : C.glacier,
              fontFamily: C.SANS,
            }}>
            <Icon size={15} style={{ color: activeNav === id ? C.teal : C.glacier, opacity: activeNav === id ? 1 : 0.65 }} />
            {label}
            {id === "alerts" && (
              <span className="ml-auto text-xs rounded-full px-1.5 py-0.5 font-bold" style={{ backgroundColor: C.red, color: "#fff", fontFamily: C.MONO, fontSize: "9px" }}>5</span>
            )}
          </button>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-1" style={{ height: "1px", backgroundColor: C.navyHi }} />

      {/* Document library */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs uppercase tracking-widest" style={{ color: C.glacier, fontFamily: C.MONO, opacity: 0.55 }}>Library</span>
        <button className="opacity-50 hover:opacity-100 transition-opacity" title="New document">
          <Plus size={13} style={{ color: C.glacier }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
        {LIBRARY_DOCS.map(doc => (
          <button key={doc.id}
            onClick={() => { setActiveDoc(doc); setActiveNav("workspace"); setStage("fiche") }}
            className="flex flex-col gap-0.5 px-3 py-2 rounded-lg text-left w-full transition-all"
            style={{
              backgroundColor: activeDoc?.id === doc.id ? C.navyHi : "transparent",
            }}>
            <span className="text-xs font-medium truncate" style={{ color: activeDoc?.id === doc.id ? "#fff" : C.glacier, fontFamily: C.SANS }}>{doc.short}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs truncate" style={{ color: C.dimmer, fontFamily: C.MONO, fontSize: "9px" }}>{doc.type}</span>
              {doc.alerts > 0 && (
                <span className="text-xs" style={{ color: C.amber, fontFamily: C.MONO, fontSize: "9px" }}>· {doc.alerts} alerts</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* User */}
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderTop: `1px solid ${C.navyHi}` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: C.teal, color: "#fff", fontFamily: C.SANS }}>
          JD
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: "#fff", fontFamily: C.SANS }}>Jean Dupont</p>
          <p className="text-xs truncate" style={{ color: C.glacier, fontFamily: C.MONO, fontSize: "9px", opacity: 0.6 }}>Senior Counsel</p>
        </div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [stage, setStage] = useState<"upload" | "processing" | "fiche">("upload")
  const [activeDoc, setActiveDoc] = useState<typeof LIBRARY_DOCS[0] | null>(null)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState(0)
  const [activeNav, setActiveNav] = useState("workspace")
  const [mobileOpen, setMobileOpen] = useState(false)

  // Processing simulation
  useEffect(() => {
    if (stage !== "processing") return
    setProgress(0); setPhase(0)
    const iv = setInterval(() => {
      setProgress(p => {
        const next = Math.min(p + 1.4, 100)
        setPhase(Math.floor(next / 20))
        if (next >= 100) {
          clearInterval(iv)
          setTimeout(() => { setStage("fiche"); setActiveDoc(LIBRARY_DOCS[0]) }, 600)
        }
        return next
      })
    }, 60)
    return () => clearInterval(iv)
  }, [stage])

  const STAGES: { key: "upload" | "processing" | "fiche"; roman: string; label: string }[] = [
    { key: "upload",     roman: "I",   label: "Upload Document" },
    { key: "processing", roman: "II",  label: "Processing" },
    { key: "fiche",      roman: "III", label: "Analysis Fiche" },
  ]

  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: C.cream }}>
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full">
            <Sidebar activeNav={activeNav} setActiveNav={n => { setActiveNav(n); setMobileOpen(false) }}
              activeDoc={activeDoc} setActiveDoc={setActiveDoc} setStage={setStage} />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <Sidebar activeNav={activeNav} setActiveNav={setActiveNav}
          activeDoc={activeDoc} setActiveDoc={setActiveDoc} setStage={setStage} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 h-14 shrink-0"
          style={{ backgroundColor: C.card, borderBottom: `1px solid ${C.border}` }}>
          <button className="lg:hidden mr-1" onClick={() => setMobileOpen(true)}>
            <Menu size={18} style={{ color: C.muted }} />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: C.muted, fontFamily: C.MONO }}>
            <span style={{ color: C.teal }}>ATLAS</span>
            <ChevronRight size={11} />
            <span>Workspace</span>
            {activeDoc && (
              <>
                <ChevronRight size={11} />
                <span style={{ color: C.ink }}>{activeDoc.short}</span>
              </>
            )}
          </div>

          {/* Stage tabs */}
          <div className="flex items-center gap-1 ml-4 p-1 rounded-lg" style={{ backgroundColor: "#F0EFF8" }}>
            {STAGES.map(s => (
              <button key={s.key}
                onClick={() => { if (s.key !== "processing") setStage(s.key) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
                style={{
                  backgroundColor: stage === s.key ? C.card : "transparent",
                  color: stage === s.key ? C.teal : C.muted,
                  boxShadow: stage === s.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  fontFamily: C.SANS,
                }}>
                <span className="font-bold text-xs" style={{ fontFamily: C.MONO, opacity: 0.7 }}>{s.roman}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Top actions */}
          <div className="flex items-center gap-2">
            {activeDoc && (
              <>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: C.tealFade, color: C.teal, fontFamily: C.SANS }}>
                  <Download size={12} /> Export
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.SANS }}>
                  <Share2 size={12} /> Share
                </button>
              </>
            )}
            <div className="relative">
              <Bell size={16} style={{ color: C.muted }} />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: C.red }} />
            </div>
          </div>
        </div>

        {/* Content + Right panel */}
        <div className="flex-1 flex min-h-0">

          {/* Stage content */}
          <div className="flex-1 overflow-y-auto px-6">
            {activeNav === "workspace" && (
              <>
                {stage === "upload" && (
                  <UploadZone onFile={() => setStage("processing")} />
                )}
                {stage === "processing" && (
                  <ProcessingView progress={Math.round(progress)} phase={phase} />
                )}
                {stage === "fiche" && (
                  <FicheDocument />
                )}
              </>
            )}

            {activeNav === "library" && (
              <div className="py-6 max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-6" style={{ fontFamily: C.SERIF, color: C.ink }}>Document Library</h2>
                <div className="flex flex-col gap-2">
                  {LIBRARY_DOCS.map(doc => (
                    <button key={doc.id}
                      onClick={() => { setActiveDoc(doc); setActiveNav("workspace"); setStage("fiche") }}
                      className="flex items-center gap-4 p-4 rounded-xl text-left transition-all hover:shadow-sm"
                      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${TYPE_COLORS[doc.type]}18` }}>
                        <FileText size={18} style={{ color: TYPE_COLORS[doc.type] }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm truncate" style={{ color: C.ink, fontFamily: C.SANS }}>{doc.title}</p>
                          <TypeBadge type={doc.type} />
                        </div>
                        <p className="text-xs" style={{ color: C.muted, fontFamily: C.SANS }}>{doc.field} · {doc.date}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color: C.teal, fontFamily: C.MONO }}>{doc.connections}</p>
                        <p className="text-xs" style={{ color: C.dimmer, fontFamily: C.MONO }}>connections</p>
                      </div>
                      {doc.alerts > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0"
                          style={{ backgroundColor: "rgba(200,75,75,0.10)", color: C.red, fontFamily: C.MONO }}>
                          {doc.alerts} alerts
                        </span>
                      )}
                      <ChevronRight size={14} style={{ color: C.dimmer }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeNav === "graph" && (
              <div className="py-6 max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-2" style={{ fontFamily: C.SERIF, color: C.ink }}>Knowledge Navigation</h2>
                <p className="text-sm mb-6" style={{ color: C.muted, fontFamily: C.SANS }}>Navigate connections across all indexed documents</p>
                <div className="rounded-xl p-8 h-96" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                  <MiniGraph />
                </div>
              </div>
            )}

            {activeNav === "alerts" && (
              <div className="py-6 max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-6" style={{ fontFamily: C.SERIF, color: C.ink }}>Update Alerts</h2>
                <div className="flex flex-col gap-3">
                  {GEN_ALERTS.map((a, i) => (
                    <div key={i} className="p-5 rounded-xl" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start gap-3">
                        <SevBadge sev={a.sev} />
                        <div className="flex-1">
                          <p className="font-semibold text-sm mb-1" style={{ color: C.ink, fontFamily: C.SANS }}>{a.title}</p>
                          <div className="flex items-center gap-3 text-xs" style={{ color: C.muted, fontFamily: C.MONO }}>
                            <span>{a.doc}</span>
                            <span>·</span>
                            <span>{a.field}</span>
                            <span>·</span>
                            <span>{a.date}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right panel (always visible in workspace + search + alerts views) */}
          {(activeNav === "workspace" || activeNav === "search" || activeNav === "alerts") && (
            <div className="w-72 xl:w-80 shrink-0 hidden md:flex flex-col overflow-hidden">
              <RightPanel activeDoc={activeDoc} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
